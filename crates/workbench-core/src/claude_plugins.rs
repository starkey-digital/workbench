//! An account's Claude Code plugins for the chat's Plugins sheet, through
//! `claude plugin … --json`, so the CLI keeps owning its settings, caches and
//! marketplace checks. Changes apply when the session's `claude` restarts.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use crate::claude_accounts::claude_command;

/// Listing reads local files only: well under a second.
const LIST_TIMEOUT: Duration = Duration::from_secs(20);
/// An install or update may clone a repository.
const CHANGE_TIMEOUT: Duration = Duration::from_secs(120);
/// Catalogue matches sent per search; the whole catalogue is megabytes.
pub const MAX_MATCHES: usize = 50;

/// Scopes a person installs into and switches in; `session` (a `--plugin-dir`,
/// Workbench's own plugin) and `synced` ones are someone else's to manage.
const MANAGED_SCOPES: [&str; 3] = ["user", "project", "local"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    /// `name@marketplace`.
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// `user`, or `project`/`local` for the chat's folder.
    pub scope: String,
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailablePlugin {
    #[serde(rename(deserialize = "pluginId"))]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename(deserialize = "marketplaceName"))]
    pub marketplace: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub install_count: Option<u64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginList {
    pub installed: Vec<InstalledPlugin>,
    /// Up to [`MAX_MATCHES`] catalogue plugins not installed here matching the
    /// search, most installed first.
    pub available: Vec<AvailablePlugin>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PluginAction {
    Install,
    Enable,
    Disable,
    Update,
    Uninstall,
}

impl PluginAction {
    fn command(self) -> &'static str {
        match self {
            Self::Install => "install",
            Self::Enable => "enable",
            Self::Disable => "disable",
            Self::Update => "update",
            Self::Uninstall => "uninstall",
        }
    }
}

#[derive(Deserialize)]
struct RawList {
    #[serde(default)]
    installed: Vec<RawInstalled>,
    #[serde(default)]
    available: Vec<AvailablePlugin>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawInstalled {
    id: String,
    version: Option<String>,
    scope: String,
    #[serde(default)]
    enabled: bool,
    project_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawResult {
    outcome: String,
    #[serde(default)]
    message: String,
    /// The command a marketplace installs with, shown for a person to accept.
    shown_command: Option<serde_json::Value>,
}

/// A change the person asked for that can't be made (not installed, a scope
/// that isn't theirs, the CLI's own refusal), as opposed to the CLI failing.
#[derive(Debug)]
pub struct Refused(pub String);

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Refused {}

fn refuse<T>(message: impl Into<String>) -> Result<T> {
    Err(Refused(message.into()).into())
}

/// One listing per account and cwd serves a sheet's searches and the check
/// before a change; a change drops it.
const CACHE_FOR: Duration = Duration::from_secs(30);

struct Cached {
    account: Option<String>,
    cwd: PathBuf,
    at: Instant,
    raw: Arc<RawList>,
}

static CACHE: Mutex<Option<Cached>> = Mutex::new(None);

/// `account_id`'s plugins as seen from `cwd` (which decides its `project` and
/// `local` ones), with catalogue matches for `query`.
pub fn list(account_id: Option<&str>, cwd: &Path, query: &str) -> Result<PluginList> {
    Ok(shape(&*cached(account_id, cwd)?, cwd, query))
}

fn cached(account_id: Option<&str>, cwd: &Path) -> Result<Arc<RawList>> {
    {
        let cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(c) = cache.as_ref().filter(|c| {
            c.account.as_deref() == account_id && c.cwd == cwd && c.at.elapsed() < CACHE_FOR
        }) {
            return Ok(c.raw.clone());
        }
    }
    let raw = Arc::new(load(account_id, cwd)?);
    *CACHE.lock().unwrap_or_else(|e| e.into_inner()) = Some(Cached {
        account: account_id.map(str::to_string),
        cwd: cwd.to_path_buf(),
        at: Instant::now(),
        raw: raw.clone(),
    });
    Ok(raw)
}

/// Run `action` on `id` in `scope`. Only a plugin the account has here (or,
/// to install, one its catalogue lists) is acted on: `claude plugin enable`
/// takes any id and would write it into the settings. An install the
/// marketplace makes by running a command is never accepted here; the CLI
/// refuses it without `-y`, and the person is told to use a terminal.
pub fn change(
    account_id: Option<&str>,
    cwd: &Path,
    action: PluginAction,
    id: &str,
    scope: &str,
) -> Result<()> {
    if !MANAGED_SCOPES.contains(&scope) {
        return refuse(format!("plugins in scope {scope:?} can't be changed here"));
    }
    let raw = cached(account_id, cwd)?;
    let listed = match action {
        PluginAction::Install => raw.available.iter().any(|a| a.id == id),
        _ => shape(&raw, cwd, "")
            .installed
            .iter()
            .any(|p| p.id == id && p.scope == scope),
    };
    if !listed {
        return refuse(format!("no plugin {id} in scope {scope}"));
    }
    let mut cmd = claude_command(account_id)?;
    cmd.args(["plugin", action.command(), id, "--json", "--scope", scope])
        .current_dir(cwd);
    let output = crate::shell::run_with_timeout(&mut cmd, CHANGE_TIMEOUT);
    // Whatever it did, the listing may now be out of date.
    *CACHE.lock().unwrap_or_else(|e| e.into_inner()) = None;
    let output = output
        .with_context(|| format!("`claude plugin {}` failed or timed out", action.command()))?;
    parse_result(&String::from_utf8_lossy(&output.stdout)).map_err(|e| {
        match stderr_line(&output.stderr) {
            Some(reason) if e.downcast_ref::<Refused>().is_none() => e.context(reason),
            _ => e,
        }
    })
}

fn load(account_id: Option<&str>, cwd: &Path) -> Result<RawList> {
    let mut cmd = claude_command(account_id)?;
    cmd.args(["plugin", "list", "--json", "--available"])
        .current_dir(cwd);
    let output = crate::shell::run_with_timeout(&mut cmd, LIST_TIMEOUT)
        .context("`claude plugin list` failed or timed out")?;
    if !output.status.success() {
        bail!(
            "`claude plugin list` failed: {}",
            stderr_line(&output.stderr).unwrap_or_else(|| output.status.to_string())
        );
    }
    serde_json::from_str(String::from_utf8_lossy(&output.stdout).trim())
        .context("unexpected `claude plugin list` output")
}

/// The CLI's last non-empty stderr line: its reason, after any warnings.
fn stderr_line(stderr: &[u8]) -> Option<String> {
    String::from_utf8_lossy(stderr)
        .lines()
        .rev()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .map(str::to_string)
}

/// The CLI reports the folder it ran in resolved (`/private/tmp`, not `/tmp`).
fn same_dir(a: &Path, b: &Path) -> bool {
    a == b
        || match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
            (Ok(a), Ok(b)) => a == b,
            _ => false,
        }
}

fn shape(raw: &RawList, cwd: &Path, query: &str) -> PluginList {
    let described = |id: &str| {
        raw.available
            .iter()
            .find(|a| a.id == id)
            .map(|a| a.description.clone())
            .filter(|d| !d.is_empty())
    };
    let installed: Vec<InstalledPlugin> = raw
        .installed
        .iter()
        .filter(|p| match p.scope.as_str() {
            "user" => true,
            "project" | "local" => p
                .project_path
                .as_deref()
                .is_some_and(|path| same_dir(Path::new(path), cwd)),
            _ => false,
        })
        .map(|p| InstalledPlugin {
            id: p.id.clone(),
            version: p.version.clone().filter(|v| v != "unknown"),
            scope: p.scope.clone(),
            enabled: p.enabled,
            description: described(&p.id),
        })
        .collect();
    let query = query.trim().to_lowercase();
    let mut available: Vec<AvailablePlugin> = raw
        .available
        .iter()
        .filter(|a| !installed.iter().any(|p| p.id == a.id))
        .filter(|a| {
            query.is_empty()
                || a.name.to_lowercase().contains(&query)
                || a.description.to_lowercase().contains(&query)
        })
        .cloned()
        .collect();
    available.sort_by(|a, b| {
        b.install_count
            .cmp(&a.install_count)
            .then_with(|| a.name.cmp(&b.name))
    });
    available.truncate(MAX_MATCHES);
    PluginList {
        installed,
        available,
    }
}

fn parse_result(stdout: &str) -> Result<()> {
    // `--json` prints one result line; a failure may print the human line after it.
    let line = stdout
        .lines()
        .find(|l| l.trim_start().starts_with('{'))
        .context("`claude plugin` printed no result")?;
    let result: RawResult = serde_json::from_str(line)?;
    match result.outcome.as_str() {
        "ok" => Ok(()),
        _ if result.shown_command.is_some() => refuse(
            "This plugin installs by running a command. Install it in a terminal with `claude plugin install`, where you can read the command first.",
        ),
        _ if result.message.is_empty() => bail!("`claude plugin` failed"),
        _ => refuse(result.message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_list(stdout: &str, cwd: &str, query: &str) -> PluginList {
        shape(
            &serde_json::from_str(stdout).unwrap(),
            Path::new(cwd),
            query,
        )
    }

    const LIST: &str = r#"{
      "installed": [
        {"id": "a@m", "version": "1.0.0", "scope": "user", "enabled": true},
        {"id": "b@m", "version": "unknown", "scope": "project", "enabled": false, "projectPath": "/repo"},
        {"id": "c@m", "scope": "local", "enabled": true, "projectPath": "/elsewhere"},
        {"id": "workbench@inline", "scope": "session", "enabled": true},
        {"id": "d@synced", "scope": "synced", "enabled": false}
      ],
      "available": [
        {"pluginId": "a@m", "name": "a", "description": "Alpha", "marketplaceName": "m"},
        {"pluginId": "x@m", "name": "x", "description": "Formats code", "marketplaceName": "m", "installCount": 5},
        {"pluginId": "y@m", "name": "y", "description": "Lints", "marketplaceName": "m", "installCount": 9},
        {"pluginId": "z@n", "name": "z", "description": "", "marketplaceName": "n"}
      ]
    }"#;

    #[test]
    fn lists_the_folders_manageable_plugins_with_their_descriptions() {
        let list = parse_list(LIST, "/repo", "");
        let ids: Vec<_> = list.installed.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["a@m", "b@m"]);
        assert_eq!(list.installed[0].description.as_deref(), Some("Alpha"));
        assert_eq!(list.installed[1].version, None);
    }

    #[test]
    fn catalogue_leaves_out_installed_plugins_and_ranks_by_installs() {
        let list = parse_list(LIST, "/repo", "");
        let ids: Vec<_> = list.available.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["y@m", "x@m", "z@n"]);
    }

    #[test]
    fn search_matches_name_or_description() {
        let list = parse_list(LIST, "/repo", " FORMAT ");
        let ids: Vec<_> = list.available.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["x@m"]);
    }

    #[test]
    fn results_report_the_clis_message() {
        assert!(parse_result(r#"{"command":"enable","outcome":"ok"}"#).is_ok());
        let err = parse_result(
            "{\"outcome\":\"failed\",\"message\":\"Plugin \\\"a\\\" is already disabled\"}\n✘ Failed",
        )
        .unwrap_err();
        assert_eq!(err.to_string(), "Plugin \"a\" is already disabled");
    }

    #[test]
    fn a_command_install_is_sent_to_the_terminal() {
        let err = parse_result(
            r#"{"outcome":"failed","message":"needs confirming","shownCommand":{"sha256":"ab"}}"#,
        )
        .unwrap_err();
        assert!(err.to_string().contains("Install it in a terminal"));
    }

    #[test]
    fn unmanaged_scopes_are_refused_before_running_anything() {
        let err = change(
            None,
            Path::new("/"),
            PluginAction::Enable,
            "workbench@inline",
            "session",
        )
        .unwrap_err();
        assert!(err.to_string().contains("can't be changed here"));
        assert!(err.downcast_ref::<Refused>().is_some());
    }

    #[test]
    fn the_clis_refusals_are_the_persons_to_fix() {
        let err = parse_result(r#"{"outcome":"failed","message":"not found"}"#).unwrap_err();
        assert!(err.downcast_ref::<Refused>().is_some());
        let err = parse_result("not json").unwrap_err();
        assert!(err.downcast_ref::<Refused>().is_none());
    }

    #[test]
    fn an_empty_account_lists_no_installed_plugins() {
        let list = parse_list(r#"{"available":[]}"#, "/repo", "");
        assert_eq!(list, PluginList::default());
    }

    #[test]
    fn stderr_gives_the_last_reason() {
        assert_eq!(
            stderr_line(b"warning: old\nError: not logged in\n\n").as_deref(),
            Some("Error: not logged in")
        );
        assert_eq!(stderr_line(b"  \n"), None);
    }

    #[cfg(unix)]
    #[test]
    fn a_project_plugin_matches_its_folder_through_a_symlink() {
        let tmp = tempfile::tempdir().unwrap();
        let real = tmp.path().join("real");
        std::fs::create_dir(&real).unwrap();
        let link = tmp.path().join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let stdout = serde_json::json!({
            "installed": [{"id": "p@m", "scope": "project", "enabled": true,
                           "projectPath": real.canonicalize().unwrap()}]
        })
        .to_string();
        let list = parse_list(&stdout, link.to_str().unwrap(), "");
        assert_eq!(list.installed.len(), 1);
    }
}
