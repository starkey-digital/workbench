//! Per-chat prompt cache upkeep (Claude only): keep the cache warm with hidden
//! keep-alive turns until a set time, so the next turn doesn't write it all
//! again. Compacting an idle conversation is Claude Code's own (2.1.299+).
//! Policies are saved by session id, so a chat keeps its own across restarts.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use workbench_core::claude_transcript::TranscriptMeta;

use super::lock;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachePolicy {
    /// Unix ms; keep-alive turns run until then.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keep_warm_until: Option<u64>,
}

/// How often sessions are checked.
pub(super) const TICK: Duration = Duration::from_secs(15);
/// How long before expiry upkeep acts: a check can land a tick late, and the
/// turn still has to reach the API.
const LEAD_MS: u64 = 120_000;
/// A keep-alive's lead on a 1h cache: Claude Code (2.1.299+) compacts a 200K+
/// conversation left idle about 54 minutes, so a keep-warm session would be
/// compacted under it.
const HOUR_KEEPALIVE_LEAD_MS: u64 = 600_000;

/// Whether `policy` calls for a keep-alive at `now`, for a session that is
/// `idle` (no turn, nothing waiting on an answer).
pub(super) fn due(policy: &CachePolicy, meta: &TranscriptMeta, idle: bool, now: u64) -> bool {
    let Some(expires) = meta.cache_expires_at else {
        return false;
    };
    if !idle || now >= expires || policy.keep_warm_until.is_none_or(|until| now >= until) {
        return false;
    }
    let lead = if meta.cache_ttl_secs.is_some_and(|ttl| ttl >= 3600) {
        HOUR_KEEPALIVE_LEAD_MS
    } else {
        LEAD_MS
    };
    expires - now <= lead
}

/// `~/.workbench/chat-cache.json`: session id → policy. Default policies
/// aren't kept.
pub(super) struct PolicyStore {
    path: PathBuf,
    map: Mutex<Option<HashMap<String, CachePolicy>>>,
}

impl Default for PolicyStore {
    fn default() -> Self {
        Self {
            path: workbench_core::paths::workbench_config_dir().join("chat-cache.json"),
            map: Mutex::new(None),
        }
    }
}

impl PolicyStore {
    pub fn get(&self, session_id: &str) -> CachePolicy {
        let mut map = lock(&self.map);
        let map =
            map.get_or_insert_with(|| workbench_core::paths::load_json(&self.path, HashMap::new()));
        map.get(session_id).cloned().unwrap_or_default()
    }

    pub fn set(&self, session_id: &str, policy: &CachePolicy) {
        let mut map = lock(&self.map);
        let map =
            map.get_or_insert_with(|| workbench_core::paths::load_json(&self.path, HashMap::new()));
        if *policy == CachePolicy::default() {
            map.remove(session_id);
        } else {
            map.insert(session_id.to_string(), policy.clone());
        }
        if let Err(e) = workbench_core::paths::save_json(&self.path, map) {
            tracing::warn!("could not save chat cache policies: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_000_000_000;

    fn meta(expires_in: i64) -> TranscriptMeta {
        TranscriptMeta {
            cache_expires_at: Some((NOW as i64 + expires_in) as u64),
            ..TranscriptMeta::default()
        }
    }

    const WARM: CachePolicy = CachePolicy {
        keep_warm_until: Some(NOW + 1),
    };

    #[test]
    fn acts_only_just_before_expiry_while_idle_and_kept_warm() {
        assert!(due(&WARM, &meta(60_000), true, NOW));
        assert!(!due(&WARM, &meta(600_000), true, NOW));
        assert!(!due(&WARM, &meta(60_000), false, NOW));
        // Already cold: a keep-alive would only write it all again.
        assert!(!due(&WARM, &meta(-1), true, NOW));
        let ended = CachePolicy {
            keep_warm_until: Some(NOW),
        };
        assert!(!due(&ended, &meta(60_000), true, NOW));
        assert!(!due(&CachePolicy::default(), &meta(60_000), true, NOW));
    }

    #[test]
    fn acts_on_an_hour_cache_before_claude_codes_idle_compaction() {
        let hour = |expires_in| TranscriptMeta {
            cache_ttl_secs: Some(3600),
            ..meta(expires_in)
        };
        assert!(due(&WARM, &hour(420_000), true, NOW));
        assert!(!due(&WARM, &hour(660_000), true, NOW));
        assert!(!due(&WARM, &meta(420_000), true, NOW));
    }
}
