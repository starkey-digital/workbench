//! A user's Claude Code config (CLAUDE.md, settings, skills, agents, commands,
//! hooks, user-scope MCP servers) and Workbench's extra accounts, merged into
//! another host's without overwriting anything there. Logins never travel: a
//! login lives in the macOS Keychain (or `.credentials.json`, which is left
//! out), so each account signs in once on the new host.

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use anyhow::{bail, Context, Result};
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::types::{ClaudeAccount, ClaudeImportReport};

const CONFIG_FILES: &[&str] = &[
    "CLAUDE.md",
    "settings.json",
    "keybindings.json",
    "statusline.sh",
];
const CONFIG_DIRS: &[&str] = &[
    "agents",
    "commands",
    "hooks",
    "output-styles",
    "rules",
    "skills",
];
const MANIFEST: &str = "manifest.json";
/// A config dir's `mcpServers`, taken from its `.claude.json`, which also
/// holds per-machine state that must not be copied.
const MCP_ENTRY: &str = ".workbench-mcp.json";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    source_home: String,
    dirs: Vec<ConfigDir>,
}

/// One config dir in the archive, under `key/`.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigDir {
    key: String,
    /// `None`: the default `~/.claude`.
    account: Option<ClaudeAccount>,
}

/// Packs the default `~/.claude` (`default`) and/or every extra account
/// (`accounts`).
pub fn pack(default: bool, accounts: bool, out: impl Write) -> Result<()> {
    pack_from(&crate::paths::home_dir(), default, accounts, out)
}

fn pack_from(home: &Path, default: bool, accounts: bool, out: impl Write) -> Result<()> {
    let mut dirs = Vec::new();
    if default {
        dirs.push((
            ConfigDir {
                key: "default".into(),
                account: None,
            },
            home.join(".claude"),
            home.join(".claude.json"),
        ));
    }
    if accounts {
        let settings = crate::config::load_workbench_settings()?;
        for (i, account) in settings
            .claude_accounts
            .into_iter()
            .filter(|a| Path::new(&a.config_dir).is_absolute())
            .enumerate()
        {
            let dir = PathBuf::from(&account.config_dir);
            let claude_json = dir.join(".claude.json");
            dirs.push((
                ConfigDir {
                    key: format!("account-{i}"),
                    account: Some(account),
                },
                dir,
                claude_json,
            ));
        }
    }

    let manifest = Manifest {
        source_home: home.to_string_lossy().into_owned(),
        dirs: dirs.iter().map(|(d, _, _)| d.clone()).collect(),
    };
    // Followed: a skill linked in from a dotfiles repo comes across as files,
    // not as a link to a path that may not exist over there.
    let mut tar = tar::Builder::new(GzEncoder::new(out, Compression::default()));
    tar.follow_symlinks(true);
    append_bytes(
        &mut tar,
        Path::new(MANIFEST),
        &serde_json::to_vec(&manifest)?,
    )?;
    let skip = |dir: &Path| {
        let name = dir.file_name().unwrap_or_default();
        name == "node_modules" || name == ".git"
    };
    for (entry, dir, claude_json) in &dirs {
        let prefix = Path::new(&entry.key);
        for file in CONFIG_FILES {
            let path = dir.join(file);
            if path.is_file() {
                tar.append_path_with_name(&path, prefix.join(file))?;
            }
        }
        for sub in CONFIG_DIRS {
            let path = dir.join(sub);
            if path.is_dir() {
                tar.append_dir(prefix.join(sub), &path)?;
                super::walk(&mut tar, &path, &prefix.join(sub), true, &skip)?;
            }
        }
        if let Some(servers) = mcp_servers(claude_json)? {
            append_bytes(
                &mut tar,
                &prefix.join(MCP_ENTRY),
                &serde_json::to_vec(&servers)?,
            )?;
        }
    }
    tar.into_inner()?.finish()?;
    Ok(())
}

fn append_bytes<W: Write>(tar: &mut tar::Builder<W>, path: &Path, data: &[u8]) -> Result<()> {
    let mut header = tar::Header::new_gnu();
    header.set_size(data.len() as u64);
    header.set_mode(0o600);
    tar.append_data(&mut header, path, data)?;
    Ok(())
}

fn mcp_servers(claude_json: &Path) -> Result<Option<Value>> {
    let Ok(text) = fs::read_to_string(claude_json) else {
        return Ok(None);
    };
    let json: Value = serde_json::from_str(&text)
        .with_context(|| format!("unreadable {}", claude_json.display()))?;
    Ok(json
        .get("mcpServers")
        .filter(|s| s.as_object().is_some_and(|s| !s.is_empty()))
        .cloned())
}

/// Merges an archive from [`pack`] into this host. Paths under the sender's
/// home are moved under this one's, in `settings.json`, MCP servers and
/// account dirs alike. Only directories and plain files are written, never a
/// link, so no entry can climb out of its config dir.
pub fn import(archive: impl Read) -> Result<ClaudeImportReport> {
    import_at(&crate::paths::home_dir(), archive)
}

fn import_at(home: &Path, archive: impl Read) -> Result<ClaudeImportReport> {
    let mut report = ClaudeImportReport::default();
    let mut archive = tar::Archive::new(GzDecoder::new(archive));
    let mut entries = archive.entries()?;

    let mut first = entries.next().context("empty archive")??;
    if first.path()?.as_ref() != Path::new(MANIFEST) {
        bail!("archive does not start with its manifest");
    }
    let mut manifest = Vec::new();
    first.read_to_end(&mut manifest)?;
    let manifest: Manifest = serde_json::from_slice(&manifest)?;
    let source_home = manifest.source_home.as_str();
    let target_home = home.to_string_lossy().into_owned();
    let rehome = |text: &str| rehome(text, source_home, &target_home);

    let mut targets: HashMap<String, (PathBuf, PathBuf)> = HashMap::new();
    let mut settings = crate::config::load_workbench_settings()?;
    for dir in &manifest.dirs {
        let target = match &dir.account {
            None => (home.join(".claude"), home.join(".claude.json")),
            Some(account) => {
                let config_dir = add_account(
                    &mut settings.claude_accounts,
                    account,
                    source_home,
                    home,
                    &mut report,
                )?;
                let claude_json = config_dir.join(".claude.json");
                (config_dir, claude_json)
            }
        };
        fs::create_dir_all(&target.0)?;
        targets.insert(dir.key.clone(), target);
    }
    if !report.accounts_added.is_empty() {
        crate::config::save_workbench_settings(&settings)?;
    }

    for entry in &mut entries {
        let mut entry = entry?;
        let path = entry.path()?.into_owned();
        let mut parts = path.components();
        let key = parts.next().map(|c| c.as_os_str().to_string_lossy());
        let rel = parts.as_path().to_path_buf();
        let Some((dir, claude_json)) = key.as_deref().and_then(|k| targets.get(k)) else {
            bail!("unexpected entry {}", path.display());
        };
        if rel.as_os_str().is_empty() {
            continue;
        }
        if !rel.components().all(|c| matches!(c, Component::Normal(_))) {
            bail!("unsafe entry {}", path.display());
        }
        if rel == Path::new(MCP_ENTRY) {
            let mut text = String::new();
            entry.read_to_string(&mut text)?;
            let servers: Map<String, Value> = serde_json::from_str(&rehome(&text))?;
            merge_mcp_servers(claude_json, servers, &mut report)?;
            continue;
        }
        let target = dir.join(&rel);
        let kind = entry.header().entry_type();
        if kind.is_dir() {
            fs::create_dir_all(&target)?;
            continue;
        }
        if !kind.is_file() {
            bail!("unsupported entry {}", path.display());
        }
        if target.symlink_metadata().is_ok() {
            report
                .skipped
                .push(format!("{}/{}", dir.display(), rel.display()));
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        if rel == Path::new("settings.json") {
            let mut text = String::new();
            entry.read_to_string(&mut text)?;
            crate::paths::atomic_write(&target, &rehome(&text))?;
        } else {
            // Through a temp file, so an upload cut off mid-file never leaves a
            // truncated one that later imports would skip as already there.
            let name = target.file_name().unwrap_or_default().to_string_lossy();
            let tmp = target.with_file_name(format!(".{name}.{}.tmp", uuid::Uuid::new_v4()));
            if let Err(e) = entry
                .unpack(&tmp)
                .map_err(anyhow::Error::from)
                .and_then(|_| Ok(fs::rename(&tmp, &target)?))
            {
                let _ = fs::remove_file(&tmp);
                return Err(e);
            }
        }
        report.written += 1;
    }
    super::read_to_end(archive.into_inner())?;
    Ok(report)
}

/// `text` (JSON) with each path under the sender's home moved under this
/// one's: the home itself as a whole string, or followed by `/`, so
/// `/Users/jakeb` is left alone when the home is `/Users/jake`.
fn rehome(text: &str, from: &str, to: &str) -> String {
    if from.is_empty() || from == to {
        return text.to_string();
    }
    text.replace(&format!("{from}/"), &format!("{to}/"))
        .replace(&format!("\"{from}\""), &format!("\"{to}\""))
}

/// Where `account` lives on this host: the same place relative to home, else
/// a folder of its name in home. An account with that id or dir already here
/// is reused, never redefined.
fn add_account(
    accounts: &mut Vec<ClaudeAccount>,
    account: &ClaudeAccount,
    source_home: &str,
    home: &Path,
    report: &mut ClaudeImportReport,
) -> Result<PathBuf> {
    // It becomes a folder name below and an id in settings.
    if account.id.is_empty()
        || !account
            .id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        bail!("not an account id: {:?}", account.id);
    }
    let source = Path::new(&account.config_dir);
    let dir = match source.strip_prefix(source_home) {
        Ok(rel)
            if rel.components().next().is_some()
                && rel.components().all(|c| matches!(c, Component::Normal(_))) =>
        {
            home.join(rel)
        }
        _ => match source.file_name() {
            Some(name) if name != ".claude" => home.join(name),
            _ => home.join(format!(".claude-{}", account.id)),
        },
    };
    if let Some(existing) = accounts
        .iter()
        .find(|a| a.id == account.id || Path::new(&a.config_dir) == dir)
    {
        return Ok(PathBuf::from(&existing.config_dir));
    }
    accounts.push(ClaudeAccount {
        id: account.id.clone(),
        name: account.name.clone(),
        config_dir: dir.to_string_lossy().into_owned(),
    });
    report.accounts_added.push(account.name.clone());
    Ok(dir)
}

/// Adds the servers `claude_json` lacks; one it has keeps its own definition.
fn merge_mcp_servers(
    claude_json: &Path,
    servers: Map<String, Value>,
    report: &mut ClaudeImportReport,
) -> Result<()> {
    let mut json = match fs::read_to_string(claude_json) {
        Ok(text) => serde_json::from_str(&text)
            .with_context(|| format!("unreadable {}", claude_json.display()))?,
        Err(_) => Value::Object(Map::new()),
    };
    let Some(root) = json.as_object_mut() else {
        bail!("{} is not a JSON object", claude_json.display());
    };
    let existing = root
        .entry("mcpServers")
        .or_insert_with(|| Value::Object(Map::new()));
    let Some(existing) = existing.as_object_mut() else {
        bail!("mcpServers in {} is not an object", claude_json.display());
    };
    let mut added = false;
    for (name, server) in servers {
        if existing.contains_key(&name) {
            report.skipped.push(format!("MCP server {name}"));
        } else {
            existing.insert(name.clone(), server);
            report.mcp_servers_added.push(name);
            added = true;
        }
    }
    if added {
        crate::paths::atomic_write(claude_json, &serde_json::to_string_pretty(&json)?)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn archive(manifest: &Manifest, files: &[(&str, &str)]) -> Vec<u8> {
        let mut tar = tar::Builder::new(GzEncoder::new(Vec::new(), Compression::fast()));
        append_bytes(
            &mut tar,
            Path::new(MANIFEST),
            &serde_json::to_vec(manifest).unwrap(),
        )
        .unwrap();
        for (path, text) in files {
            append_bytes(&mut tar, Path::new(path), text.as_bytes()).unwrap();
        }
        tar.into_inner().unwrap().finish().unwrap()
    }

    #[test]
    fn merge_adds_missing_mcp_servers_and_keeps_existing_ones() {
        let dir = tempfile::tempdir().unwrap();
        let claude_json = dir.path().join(".claude.json");
        fs::write(
            &claude_json,
            json!({ "numStartups": 3, "mcpServers": { "a": { "command": "mine" } } }).to_string(),
        )
        .unwrap();
        let mut report = ClaudeImportReport::default();
        let servers = json!({ "a": { "command": "theirs" }, "b": { "command": "new" } });
        merge_mcp_servers(
            &claude_json,
            servers.as_object().unwrap().clone(),
            &mut report,
        )
        .unwrap();

        let merged: Value =
            serde_json::from_str(&fs::read_to_string(&claude_json).unwrap()).unwrap();
        assert_eq!(merged["numStartups"], 3);
        assert_eq!(merged["mcpServers"]["a"]["command"], "mine");
        assert_eq!(merged["mcpServers"]["b"]["command"], "new");
        assert_eq!(report.mcp_servers_added, vec!["b"]);
        assert_eq!(report.skipped, vec!["MCP server a"]);
    }

    #[test]
    fn account_dir_follows_home_and_reuses_a_known_account() {
        let home = Path::new("/Users/new");
        let mut accounts = Vec::new();
        let mut report = ClaudeImportReport::default();
        let account = ClaudeAccount {
            id: "work".into(),
            name: "Work".into(),
            config_dir: "/Users/old/.claude-work".into(),
        };
        let dir = add_account(&mut accounts, &account, "/Users/old", home, &mut report).unwrap();
        assert_eq!(dir, Path::new("/Users/new/.claude-work"));
        assert_eq!(accounts[0].config_dir, "/Users/new/.claude-work");
        assert_eq!(report.accounts_added, vec!["Work"]);

        let again = add_account(&mut accounts, &account, "/Users/old", home, &mut report).unwrap();
        assert_eq!(again, dir);
        assert_eq!(accounts.len(), 1);

        let outside = ClaudeAccount {
            id: "ext".into(),
            name: "Ext".into(),
            config_dir: "/Volumes/x/claude-ext".into(),
        };
        let dir = add_account(&mut accounts, &outside, "/Users/old", home, &mut report).unwrap();
        assert_eq!(dir, Path::new("/Users/new/claude-ext"));
    }

    #[test]
    fn pack_then_import_merges_into_another_home() {
        crate::paths::test_config_dir();
        let old = tempfile::tempdir().unwrap();
        let src = old.path();
        let old_home = src.to_string_lossy();
        fs::create_dir_all(src.join(".claude/skills/build")).unwrap();
        fs::create_dir_all(src.join(".claude/hooks/node_modules/x")).unwrap();
        fs::write(src.join(".claude/skills/build/SKILL.md"), "skill").unwrap();
        fs::write(src.join(".claude/hooks/node_modules/x/i.js"), "").unwrap();
        fs::write(src.join(".claude/CLAUDE.md"), "theirs").unwrap();
        fs::write(src.join(".claude/history.jsonl"), "private").unwrap();
        fs::write(
            src.join(".claude/settings.json"),
            format!(r#"{{"statusLine":"{old_home}/.claude/statusline.sh"}}"#),
        )
        .unwrap();
        fs::write(
            src.join(".claude.json"),
            json!({ "userID": "old", "mcpServers": { "fs": { "args": [format!("{old_home}/x")] } } })
                .to_string(),
        )
        .unwrap();
        let mut bytes = Vec::new();
        pack_from(src, true, false, &mut bytes).unwrap();

        let new = tempfile::tempdir().unwrap();
        let dst = new.path();
        let new_home = dst.to_string_lossy();
        fs::create_dir_all(dst.join(".claude")).unwrap();
        fs::write(dst.join(".claude/CLAUDE.md"), "mine").unwrap();
        let report = import_at(dst, &bytes[..]).unwrap();

        assert_eq!(
            fs::read_to_string(dst.join(".claude/CLAUDE.md")).unwrap(),
            "mine"
        );
        assert_eq!(
            fs::read_to_string(dst.join(".claude/skills/build/SKILL.md")).unwrap(),
            "skill"
        );
        assert!(!dst.join(".claude/history.jsonl").exists());
        assert!(!dst.join(".claude/hooks/node_modules").exists());
        assert_eq!(
            fs::read_to_string(dst.join(".claude/settings.json")).unwrap(),
            format!(r#"{{"statusLine":"{new_home}/.claude/statusline.sh"}}"#)
        );
        let claude_json: Value =
            serde_json::from_str(&fs::read_to_string(dst.join(".claude.json")).unwrap()).unwrap();
        assert_eq!(
            claude_json["mcpServers"]["fs"]["args"][0],
            format!("{new_home}/x")
        );
        assert!(claude_json.get("userID").is_none());
        assert_eq!(report.written, 2);
        assert_eq!(report.mcp_servers_added, vec!["fs"]);
        assert_eq!(report.skipped.len(), 1);
    }

    #[test]
    fn add_account_refuses_an_id_that_is_a_path() {
        let account = ClaudeAccount {
            id: "../../../tmp/evil".into(),
            name: "Evil".into(),
            config_dir: "/x/.claude".into(),
        };
        let mut accounts = Vec::new();
        let mut report = ClaudeImportReport::default();
        assert!(add_account(
            &mut accounts,
            &account,
            "/Users/old",
            Path::new("/h"),
            &mut report
        )
        .is_err());
        assert!(accounts.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn pack_survives_a_link_back_to_an_ancestor() {
        crate::paths::test_config_dir();
        let tmp = tempfile::tempdir().unwrap();
        let skills = tmp.path().join(".claude/skills");
        fs::create_dir_all(skills.join("a")).unwrap();
        fs::write(skills.join("a/SKILL.md"), "a").unwrap();
        std::os::unix::fs::symlink(&skills, skills.join("a/loop")).unwrap();
        let mut bytes = Vec::new();
        pack_from(tmp.path(), true, false, &mut bytes).unwrap();
        let dst = tempfile::tempdir().unwrap();
        import_at(dst.path(), &bytes[..]).unwrap();
        assert!(dst.path().join(".claude/skills/a/SKILL.md").is_file());
        assert!(!dst.path().join(".claude/skills/a/loop").exists());
    }

    #[test]
    fn rehome_moves_only_whole_home_paths() {
        let text = r#"{"a":"/Users/jake/x","b":"/Users/jakeb/y","c":"/Users/jake"}"#;
        assert_eq!(
            rehome(text, "/Users/jake", "/home/j"),
            r#"{"a":"/home/j/x","b":"/Users/jakeb/y","c":"/home/j"}"#
        );
    }

    #[cfg(unix)]
    #[test]
    fn pack_copies_what_a_linked_skill_points_to() {
        crate::paths::test_config_dir();
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        let real = tmp.path().join("dotfiles/skill");
        fs::create_dir_all(&real).unwrap();
        fs::write(real.join("SKILL.md"), "linked").unwrap();
        fs::create_dir_all(src.join(".claude/skills")).unwrap();
        std::os::unix::fs::symlink(&real, src.join(".claude/skills/mine")).unwrap();
        let mut bytes = Vec::new();
        pack_from(&src, true, false, &mut bytes).unwrap();

        let dst = tmp.path().join("dst");
        import_at(&dst, &bytes[..]).unwrap();
        let copied = dst.join(".claude/skills/mine");
        assert!(!copied.symlink_metadata().unwrap().is_symlink());
        assert_eq!(
            fs::read_to_string(copied.join("SKILL.md")).unwrap(),
            "linked"
        );
    }

    #[cfg(unix)]
    #[test]
    fn import_refuses_a_link_entry() {
        crate::paths::test_config_dir();
        let manifest = Manifest {
            source_home: String::new(),
            dirs: vec![ConfigDir {
                key: "default".into(),
                account: None,
            }],
        };
        let mut tar = tar::Builder::new(GzEncoder::new(Vec::new(), Compression::fast()));
        append_bytes(
            &mut tar,
            Path::new(MANIFEST),
            &serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Symlink);
        header.set_size(0);
        tar.append_link(&mut header, "default/skills", "/etc")
            .unwrap();
        let bytes = tar.into_inner().unwrap().finish().unwrap();

        let home = tempfile::tempdir().unwrap();
        let err = import_at(home.path(), &bytes[..]).unwrap_err();
        assert!(err.to_string().contains("unsupported entry"), "{err}");
        assert!(!home.path().join(".claude/skills").exists());
    }

    #[test]
    fn import_refuses_an_entry_for_no_config_dir() {
        crate::paths::test_config_dir();
        let manifest = Manifest {
            source_home: String::new(),
            dirs: vec![],
        };
        let bytes = archive(&manifest, &[("default/CLAUDE.md", "x")]);
        assert!(import(&bytes[..]).is_err());
    }
}
