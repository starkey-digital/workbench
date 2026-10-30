//! A project folder as it is on disk (uncommitted work, stashes, local branches,
//! `.env` files), minus output that can be rebuilt.

use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use anyhow::{bail, Result};
use flate2::{read::GzDecoder, write::GzEncoder, Compression};

use crate::projects::invalid;
use crate::types::{ProjectConfig, ProjectEdit};

/// Left out when git ignores them (a tracked `build/` is source), or always in
/// a folder that isn't a repo.
const REBUILDABLE: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    ".turbo",
    ".svelte-kit",
    ".next",
    ".nuxt",
    ".venv",
    "venv",
    "__pycache__",
    ".gradle",
    "coverage",
    ".cache",
    "DerivedData",
    "Pods",
];

/// The "inside" worktree layout's folder: each worktree is a checkout of its own.
const WORKTREES: &str = ".worktrees";

pub fn pack(root: &Path, out: impl Write) -> Result<()> {
    if root.join(".git").is_file() {
        bail!(
            "{} is a linked worktree, whose history lives in another checkout; copy that main checkout instead",
            root.display()
        );
    }
    let git_dir = root.join(".git");
    let git = git_dir.exists();
    let root_str = root.to_string_lossy().into_owned();
    let git_says = |args: &[&str]| crate::git::git_output(args, &root_str);
    let skip = |dir: &Path| {
        // `.gitignore` patterns also match ref dirs (`refs/heads/build`), which
        // are local branches, never output.
        if dir.starts_with(&git_dir) {
            return false;
        }
        let name = dir.file_name().unwrap_or_default().to_string_lossy();
        if dir.parent() == Some(root) && name == WORKTREES {
            return true;
        }
        if !REBUILDABLE.contains(&name.as_ref()) {
            return false;
        }
        if !git {
            return true;
        }
        let dir = dir.to_string_lossy();
        // Ignored, and holding no file forced into the index with `git add -f`.
        git_says(&["check-ignore", "-q", "--", &dir]).is_ok()
            && git_says(&["ls-files", "--", &dir]).is_ok_and(|tracked| tracked.trim().is_empty())
    };
    let mut tar = tar::Builder::new(GzEncoder::new(out, Compression::fast()));
    tar.follow_symlinks(false);
    super::walk(&mut tar, root, Path::new(""), false, &skip)?;
    tar.into_inner()?.finish()?;
    Ok(())
}

/// Unpacks into `<parent>/<folder>` (the host's clone folder, else home, when
/// `parent` is unset) and registers it as the project `name`. The folder must
/// not exist yet; it appears only once fully unpacked.
pub fn import(
    parent: Option<&str>,
    folder: &str,
    name: &str,
    archive: impl Read,
) -> Result<ProjectConfig> {
    if !matches!(
        Path::new(folder).components().collect::<Vec<_>>()[..],
        [Component::Normal(_)]
    ) {
        return invalid(format!("not a folder name: {folder}"));
    }
    let parent = match parent.filter(|p| !p.trim().is_empty()) {
        Some(p) if crate::projects::is_plain_absolute(Path::new(p)) => PathBuf::from(p),
        Some(p) => return invalid(format!("not a plain absolute path: {p}")),
        None => crate::config::load_workbench_settings()?
            .clone_base_dir
            .filter(|d| Path::new(d).is_absolute())
            .map(PathBuf::from)
            .unwrap_or_else(crate::paths::home_dir),
    };
    let dest = parent.join(folder);
    if dest.symlink_metadata().is_ok() {
        return invalid(format!("{} already exists on this host", dest.display()));
    }
    // Refused before reading the upload, not after unpacking all of it.
    if crate::projects::is_registered(&dest.to_string_lossy())? {
        return invalid(format!("{} is already a project here", dest.display()));
    }
    fs::create_dir_all(&parent)?;
    // Its own per import, so two copies of one folder never share it.
    let staging = parent.join(format!(
        ".{folder}.workbench-import-{}",
        uuid::Uuid::new_v4()
    ));
    // A rename onto a folder that appeared meanwhile fails rather than merging.
    if let Err(e) = unpack(archive, &staging).and_then(|()| Ok(fs::rename(&staging, &dest)?)) {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }
    let path = dest.to_string_lossy().into_owned();
    if dest.join(".git").is_dir() {
        // The source's other worktrees didn't come along.
        let _ = crate::git::git_output(&["worktree", "prune"], &path);
    }
    let added = crate::projects::add(ProjectEdit {
        path,
        name: name.to_string(),
        group: None,
        claude_account_id: None,
    });
    if added.is_err() {
        // Made by this import a moment ago, so nothing of the user's is lost,
        // and a retry isn't refused as "already exists".
        let _ = fs::remove_dir_all(&dest);
    }
    added
}

fn unpack(archive: impl Read, dest: &Path) -> Result<()> {
    let mut archive = tar::Archive::new(GzDecoder::new(archive));
    archive.set_preserve_permissions(true);
    archive.set_preserve_mtime(true);
    archive.unpack(dest)?;
    super::read_to_end(archive.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn git(dir: &Path, args: &[&str]) {
        crate::git::git_output(args, &dir.to_string_lossy()).unwrap();
    }

    #[test]
    fn pack_keeps_local_state_and_drops_ignored_output() {
        let src = tempfile::tempdir().unwrap();
        let root = src.path();
        git(root, &["init", "-q"]);
        fs::write(
            root.join(".gitignore"),
            "node_modules\n.env\nbuild/\ndist/\n",
        )
        .unwrap();
        fs::write(root.join(".env"), "SECRET=1").unwrap();
        fs::write(root.join("main.rs"), "fn main() {}").unwrap();
        fs::create_dir_all(root.join("node_modules/dep")).unwrap();
        fs::write(root.join("node_modules/dep/index.js"), "").unwrap();
        fs::create_dir_all(root.join("dist")).unwrap();
        fs::write(root.join("dist/app.js"), "").unwrap();
        // Ignored but forced into the index, so source: kept.
        fs::create_dir_all(root.join("build")).unwrap();
        fs::write(root.join("build/script.sh"), "").unwrap();
        git(root, &["add", "-f", "build/script.sh"]);
        // A local branch whose ref dir matches the `build/` pattern.
        fs::create_dir_all(root.join(".git/refs/heads/build")).unwrap();
        fs::write(root.join(".git/refs/heads/build/fix"), "0".repeat(40)).unwrap();
        fs::create_dir_all(root.join(".worktrees/feature")).unwrap();
        fs::write(root.join(".worktrees/feature/a"), "").unwrap();

        let mut bytes = Vec::new();
        pack(root, &mut bytes).unwrap();
        let out = tempfile::tempdir().unwrap();
        let dest = out.path().join("copy");
        unpack(&bytes[..], &dest).unwrap();

        assert_eq!(fs::read_to_string(dest.join(".env")).unwrap(), "SECRET=1");
        assert!(dest.join("main.rs").is_file());
        assert!(dest.join(".git/HEAD").is_file());
        assert!(dest.join("build/script.sh").is_file());
        assert!(dest.join(".git/refs/heads/build/fix").is_file());
        assert!(!dest.join("dist").exists());
        assert!(!dest.join("node_modules").exists());
        assert!(!dest.join(".worktrees").exists());
    }

    #[test]
    fn import_refuses_a_path_as_the_folder_name() {
        let parent = tempfile::tempdir().unwrap();
        let parent = parent.path().to_string_lossy();
        for folder in ["../escape", "a/b", "", ".."] {
            let err = import(Some(&parent), folder, "x", &b""[..]).unwrap_err();
            assert!(err.downcast_ref::<crate::projects::Invalid>().is_some());
        }
    }

    #[test]
    fn import_refuses_an_existing_folder_and_leaves_it_alone() {
        let parent = tempfile::tempdir().unwrap();
        fs::create_dir(parent.path().join("taken")).unwrap();
        fs::write(parent.path().join("taken/keep"), "mine").unwrap();
        let err = import(
            Some(&parent.path().to_string_lossy()),
            "taken",
            "x",
            &b""[..],
        )
        .unwrap_err();
        assert!(err.to_string().contains("already exists"));
        assert_eq!(
            fs::read_to_string(parent.path().join("taken/keep")).unwrap(),
            "mine"
        );
    }

    #[test]
    fn a_bad_archive_leaves_nothing_behind() {
        crate::paths::test_config_dir();
        let parent = tempfile::tempdir().unwrap();
        assert!(import(
            Some(&parent.path().to_string_lossy()),
            "proj",
            "x",
            &b"not a gzip"[..],
        )
        .is_err());
        assert_eq!(fs::read_dir(parent.path()).unwrap().count(), 0);
    }

    #[test]
    fn a_body_that_fails_after_a_complete_archive_is_refused() {
        crate::paths::test_config_dir();
        let src = tempfile::tempdir().unwrap();
        fs::write(src.path().join("a"), "x").unwrap();
        let mut bytes = Vec::new();
        pack(src.path(), &mut bytes).unwrap();
        let aborted = (&bytes[..]).chain(FailingReader);
        let parent = tempfile::tempdir().unwrap();
        assert!(import(Some(&parent.path().to_string_lossy()), "proj", "x", aborted).is_err());
        assert_eq!(fs::read_dir(parent.path()).unwrap().count(), 0);
    }

    struct FailingReader;

    impl Read for FailingReader {
        fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("upload aborted"))
        }
    }
}
