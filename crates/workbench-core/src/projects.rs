//! Adding, editing and removing a registered project one at a time, and
//! browsing the host's folders to pick one: what a remote client (the phone)
//! does where the desktop saves its whole list and uses a native folder picker.

use std::path::Path;
use std::sync::Mutex;

use anyhow::Result;

use crate::types::{Folder, FolderListing, ProjectConfig, ProjectEdit, WorkbenchSettings};

/// A change that can't be made (no such folder, already registered, an
/// unknown account), as opposed to the config failing to load or save.
#[derive(Debug)]
pub struct Invalid(pub String);

impl std::fmt::Display for Invalid {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Invalid {}

fn invalid<T>(message: impl Into<String>) -> Result<T> {
    Err(Invalid(message.into()).into())
}

/// Two requests editing at once would each save a list missing the other's change.
static EDITS: Mutex<()> = Mutex::new(());

fn edit_saved<T>(
    f: impl FnOnce(&mut Vec<ProjectConfig>, &WorkbenchSettings) -> Result<T>,
) -> Result<T> {
    let _guard = EDITS.lock().unwrap_or_else(|e| e.into_inner());
    let mut projects = crate::config::load_projects()?;
    let settings = crate::config::load_workbench_settings()?;
    let result = f(&mut projects, &settings)?;
    crate::config::save_projects(&projects)?;
    Ok(result)
}

/// Registers the folder `edit.path` names.
pub fn add(edit: ProjectEdit) -> Result<ProjectConfig> {
    edit_saved(|projects, settings| add_to(projects, settings, edit))
}

/// Renames, regroups or re-accounts the project at `edit.path`; its path stays.
/// Returns the project as it was and as it is now.
pub fn update(edit: ProjectEdit) -> Result<(ProjectConfig, ProjectConfig)> {
    edit_saved(|projects, settings| update_in(projects, settings, edit))
}

/// Unregisters the project at `path`; its folder is untouched.
pub fn remove(path: &str) -> Result<()> {
    edit_saved(|projects, _| remove_from(projects, path))
}

fn add_to(
    projects: &mut Vec<ProjectConfig>,
    settings: &WorkbenchSettings,
    edit: ProjectEdit,
) -> Result<ProjectConfig> {
    let path = Path::new(&edit.path);
    if !path.is_absolute() || !path.is_dir() {
        return invalid(format!("not a folder on this machine: {}", edit.path));
    }
    if projects.iter().any(|p| same_folder(&p.path, &edit.path)) {
        return invalid(format!("already a project: {}", edit.path));
    }
    let project = ProjectConfig {
        name: String::new(),
        path: edit.path.clone(),
        group: None,
        shell: None,
        startup_command: None,
        tasks: vec![],
        claude_account_id: None,
    };
    let project = apply(project, settings, edit)?;
    projects.push(project.clone());
    Ok(project)
}

fn update_in(
    projects: &mut [ProjectConfig],
    settings: &WorkbenchSettings,
    edit: ProjectEdit,
) -> Result<(ProjectConfig, ProjectConfig)> {
    let Some(slot) = projects.iter_mut().find(|p| p.path == edit.path) else {
        return invalid(format!("not a project: {}", edit.path));
    };
    let before = slot.clone();
    *slot = apply(before.clone(), settings, edit)?;
    Ok((before, slot.clone()))
}

fn remove_from(projects: &mut Vec<ProjectConfig>, path: &str) -> Result<()> {
    let count = projects.len();
    projects.retain(|p| p.path != path);
    if projects.len() == count {
        return invalid(format!("not a project: {path}"));
    }
    Ok(())
}

/// `edit`'s fields over `project`, keeping the ones a client never edits.
fn apply(
    mut project: ProjectConfig,
    settings: &WorkbenchSettings,
    edit: ProjectEdit,
) -> Result<ProjectConfig> {
    if let Some(id) = edit
        .claude_account_id
        .as_deref()
        .filter(|id| !id.is_empty())
    {
        if !settings.claude_accounts.iter().any(|a| a.id == id) {
            return invalid(format!("unknown Claude account: {id}"));
        }
    }
    let name = edit.name.trim();
    project.name = if name.is_empty() {
        folder_name(Path::new(&project.path))
    } else {
        name.to_string()
    };
    project.group = edit
        .group
        .map(|g| g.trim().to_string())
        .filter(|g| !g.is_empty());
    project.claude_account_id = edit.claude_account_id;
    Ok(project)
}

fn same_folder(a: &str, b: &str) -> bool {
    a == b
        || matches!(
            (std::fs::canonicalize(a), std::fs::canonicalize(b)),
            (Ok(a), Ok(b)) if a == b
        )
}

fn folder_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// The folders inside `path` (the home folder when `None`), hidden ones left
/// out, by name; each says whether it is a git checkout.
pub fn list_folders(path: Option<&str>) -> Result<FolderListing> {
    let dir = match path {
        Some(p) => std::path::PathBuf::from(p),
        None => crate::paths::home_dir(),
    };
    if !dir.is_absolute() || !dir.is_dir() {
        return invalid(format!("not a folder on this machine: {}", dir.display()));
    }
    let mut folders: Vec<Folder> = std::fs::read_dir(&dir)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
        // `is_dir` follows symlinks, so a linked folder is listed too.
        .filter(|entry| entry.path().is_dir())
        .map(|entry| Folder {
            name: entry.file_name().to_string_lossy().into_owned(),
            git: entry.path().join(".git").exists(),
            path: entry.path().to_string_lossy().into_owned(),
        })
        .collect();
    folders.sort_by_key(|f| f.name.to_lowercase());
    Ok(FolderListing {
        path: dir.to_string_lossy().into_owned(),
        parent: dir.parent().map(|p| p.to_string_lossy().into_owned()),
        folders,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ClaudeAccount;

    fn settings() -> WorkbenchSettings {
        WorkbenchSettings {
            claude_accounts: vec![ClaudeAccount {
                id: "work".into(),
                name: "Work".into(),
                config_dir: "/accounts/work".into(),
            }],
            ..Default::default()
        }
    }

    fn edit(path: &Path, name: &str) -> ProjectEdit {
        ProjectEdit {
            path: path.to_string_lossy().into_owned(),
            name: name.into(),
            group: None,
            claude_account_id: None,
        }
    }

    fn is_invalid(result: Result<impl std::fmt::Debug>) -> bool {
        result.unwrap_err().downcast_ref::<Invalid>().is_some()
    }

    #[test]
    fn adds_a_folder_named_after_itself_unless_named() {
        let tmp = tempfile::tempdir().unwrap();
        let mut projects = vec![];
        let added = add_to(&mut projects, &settings(), edit(tmp.path(), "  ")).unwrap();
        assert_eq!(added.name, folder_name(tmp.path()));
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].path, added.path);
    }

    #[test]
    fn refuses_a_missing_relative_or_registered_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let mut projects = vec![];
        assert!(is_invalid(add_to(
            &mut projects,
            &settings(),
            edit(&tmp.path().join("gone"), "x")
        )));
        assert!(is_invalid(add_to(
            &mut projects,
            &settings(),
            edit(Path::new("rel"), "x")
        )));
        add_to(&mut projects, &settings(), edit(tmp.path(), "x")).unwrap();
        assert!(is_invalid(add_to(
            &mut projects,
            &settings(),
            edit(tmp.path(), "y")
        )));
        assert_eq!(projects.len(), 1);
    }

    #[test]
    fn an_update_keeps_what_clients_never_edit() {
        let tmp = tempfile::tempdir().unwrap();
        let mut projects = vec![ProjectConfig {
            name: "old".into(),
            path: tmp.path().to_string_lossy().into_owned(),
            group: Some("g".into()),
            shell: Some("/bin/zsh".into()),
            startup_command: Some("make".into()),
            tasks: vec![],
            claude_account_id: None,
        }];
        let mut change = edit(tmp.path(), " new ");
        change.group = Some(" ".into());
        change.claude_account_id = Some("work".into());
        let (before, after) = update_in(&mut projects, &settings(), change).unwrap();
        assert_eq!(before.name, "old");
        assert_eq!(after.name, "new");
        assert_eq!(after.group, None);
        assert_eq!(after.claude_account_id.as_deref(), Some("work"));
        assert_eq!(after.shell.as_deref(), Some("/bin/zsh"));
        assert_eq!(after.startup_command.as_deref(), Some("make"));
        assert_eq!(projects[0].name, "new");
    }

    #[test]
    fn an_unknown_account_is_refused_and_the_default_login_allowed() {
        let tmp = tempfile::tempdir().unwrap();
        let mut projects = vec![];
        let mut change = edit(tmp.path(), "x");
        change.claude_account_id = Some("gone".into());
        assert!(is_invalid(add_to(
            &mut projects,
            &settings(),
            change.clone()
        )));
        change.claude_account_id = Some(String::new());
        let added = add_to(&mut projects, &settings(), change).unwrap();
        assert_eq!(added.claude_account_id.as_deref(), Some(""));
    }

    #[test]
    fn removing_an_unknown_project_is_refused() {
        let mut projects = vec![];
        assert!(is_invalid(remove_from(&mut projects, "/nowhere")));
    }

    #[test]
    fn lists_visible_folders_by_name_marking_checkouts() {
        let tmp = tempfile::tempdir().unwrap();
        for dir in ["beta", "Alpha/.git", ".hidden"] {
            std::fs::create_dir_all(tmp.path().join(dir)).unwrap();
        }
        std::fs::write(tmp.path().join("file.txt"), "").unwrap();
        let listing = list_folders(Some(&tmp.path().to_string_lossy())).unwrap();
        let names: Vec<_> = listing
            .folders
            .iter()
            .map(|f| (f.name.as_str(), f.git))
            .collect();
        assert_eq!(names, vec![("Alpha", true), ("beta", false)]);
        assert_eq!(
            listing.parent.as_deref(),
            tmp.path().parent().map(|p| p.to_str().unwrap())
        );
        assert!(is_invalid(list_folders(Some("relative"))));
    }
}
