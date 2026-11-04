//! Making a project's folder on this host: a new (empty) folder, or a clone.

use std::fs;
use std::path::{Component, Path, PathBuf};

use anyhow::Result;

use super::{add, invalid, is_plain_absolute, is_registered};
use crate::types::{CloneProjectRequest, CreateFolderRequest, ProjectConfig, ProjectEdit};

/// Where a new project goes: `parent`, else the host's clone folder, else home.
pub fn parent_folder(parent: Option<&str>) -> Result<PathBuf> {
    match parent.map(str::trim).filter(|p| !p.is_empty()) {
        Some(p) if is_plain_absolute(Path::new(p)) => Ok(PathBuf::from(p)),
        Some(p) => invalid(format!("not a plain absolute path: {p}")),
        None => Ok(crate::config::load_workbench_settings()?
            .clone_base_dir
            .filter(|d| Path::new(d).is_absolute())
            .map(PathBuf::from)
            .unwrap_or_else(crate::paths::home_dir)),
    }
}

/// `parent/name` for a folder that doesn't exist yet and isn't a project: `name`
/// must be one plain folder name.
pub fn new_child(parent: &Path, name: &str) -> Result<PathBuf> {
    if !matches!(
        Path::new(name).components().collect::<Vec<_>>()[..],
        [Component::Normal(_)]
    ) {
        return invalid(format!("not a folder name: {name}"));
    }
    let dest = parent.join(name);
    if dest.symlink_metadata().is_ok() {
        return invalid(format!("{} already exists on this host", dest.display()));
    }
    if is_registered(&dest.to_string_lossy())? {
        return invalid(format!("{} is already a project here", dest.display()));
    }
    Ok(dest)
}

/// Makes the empty folder `req.name` in `req.parent` (a `git init`ed one with
/// `git_init`) and answers its path. It isn't registered: the client adds it.
pub fn create_folder(req: CreateFolderRequest) -> Result<String> {
    // Required: a blank one isn't "the default folder" here.
    if req.parent.trim().is_empty() {
        return invalid("no folder to make it in");
    }
    let parent = parent_folder(Some(&req.parent))?;
    if !parent.is_dir() {
        return invalid(format!(
            "not a folder on this machine: {}",
            parent.display()
        ));
    }
    let dest = new_child(&parent, req.name.trim())?;
    // Not `create_dir_all`: a folder that appeared meanwhile is an error, not reused.
    fs::create_dir(&dest)?;
    let path = dest.to_string_lossy().into_owned();
    if req.git_init {
        if let Err(e) = crate::git::git_output(&["init"], &path) {
            // Ours, made a moment ago: leave nothing that blocks a retry.
            let _ = fs::remove_dir_all(&dest);
            return Err(e);
        }
    }
    Ok(path)
}

/// The folder a clone of `url` gets by default, as `git clone` names it.
fn repo_folder(url: &str) -> &str {
    let url = url.trim_end_matches(['/', '\\']);
    let url = url
        .strip_suffix("/.git")
        .or_else(|| url.strip_suffix("\\.git"))
        .unwrap_or(url);
    let last = url.rsplit(['/', '\\', ':']).next().unwrap_or(url);
    last.strip_suffix(".git").unwrap_or(last)
}

/// `<transport>::<address>`, which runs git's remote helper for `<transport>`.
fn names_a_helper(url: &str) -> bool {
    url.split_once("::").is_some_and(|(scheme, _)| {
        !scheme.is_empty()
            && scheme
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
    })
}

/// Clones `req.url` into `<parent>/<folder>` and registers it as a project.
pub fn clone(req: CloneProjectRequest) -> Result<ProjectConfig> {
    let url = req.url.trim();
    // A leading `-` would be an option to git.
    if url.is_empty() || url.starts_with('-') || names_a_helper(url) {
        return invalid(format!("not a repository URL: {url}"));
    }
    let parent = parent_folder(req.parent.as_deref())?;
    let folder = req
        .folder
        .as_deref()
        .map(str::trim)
        .filter(|f| !f.is_empty())
        .unwrap_or_else(|| repo_folder(url));
    let dest = new_child(&parent, folder)?;
    fs::create_dir_all(&parent)?;
    let added = crate::git::clone_repo(url, &dest.to_string_lossy()).and_then(|()| {
        add(ProjectEdit {
            path: dest.to_string_lossy().into_owned(),
            name: req.name.unwrap_or_default(),
            group: None,
            claude_account_id: None,
        })
    });
    // `dest` didn't exist before: a killed clone or a failed add leaves nothing behind
    // to block a retry.
    if added.is_err() {
        let _ = fs::remove_dir_all(&dest);
    }
    added
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repo_folders_follow_git_clone() {
        assert_eq!(repo_folder("https://github.com/acme/app.git"), "app");
        assert_eq!(repo_folder("https://github.com/acme/app/"), "app");
        assert_eq!(repo_folder("git@github.com:acme/app.git"), "app");
        assert_eq!(repo_folder("git@host:app"), "app");
        assert_eq!(repo_folder("/srv/repos/app/.git"), "app");
        assert_eq!(repo_folder("file:///srv/repos/app/.git/"), "app");
        assert_eq!(repo_folder(r"C:\repos\app"), "app");
    }

    #[test]
    fn only_a_leading_scheme_names_a_helper() {
        assert!(names_a_helper("ext::sh -c x"));
        assert!(names_a_helper("fd::3"));
        assert!(!names_a_helper("ssh://git@[fd00::12]/team/app.git"));
        assert!(!names_a_helper("https://[::1]:8443/app.git"));
    }

    #[test]
    fn create_folder_refuses_a_blank_parent() {
        let err = create_folder(CreateFolderRequest {
            parent: " ".into(),
            name: "x".into(),
            git_init: false,
        })
        .unwrap_err();
        assert!(err.to_string().contains("no folder"));
    }

    #[test]
    fn a_new_child_is_one_unused_folder_name() {
        let parent = tempfile::tempdir().unwrap();
        fs::create_dir(parent.path().join("taken")).unwrap();
        for bad in ["", "..", "a/b", "/abs", "taken"] {
            assert!(new_child(parent.path(), bad).is_err(), "{bad}");
        }
        assert_eq!(
            new_child(parent.path(), "fresh").unwrap(),
            parent.path().join("fresh")
        );
    }

    #[test]
    fn a_relative_parent_is_refused() {
        assert!(parent_folder(Some("repos")).is_err());
        assert!(parent_folder(Some("/a/../b")).is_err());
    }

    #[test]
    fn clone_refuses_option_and_helper_urls() {
        for url in ["", "--upload-pack=touch /tmp/x", "ext::sh -c touch% /tmp/x"] {
            let err = clone(CloneProjectRequest {
                url: url.into(),
                parent: Some("/tmp".into()),
                folder: Some("x".into()),
                name: None,
            })
            .unwrap_err();
            assert!(err.to_string().contains("not a repository URL"), "{url}");
        }
    }
}
