//! One process keeps a config dir's workspace model: the desktop and a
//! standalone server on the same dir would otherwise both boot (and run) every
//! saved pane. An OS file lock (flock / LockFileEx), so the kernel releases it
//! when the process ends however it ends: a pid left in a file outlived every
//! quit, and once the pid was reused the next launch never loaded its tabs.

use std::fs::{File, OpenOptions, TryLockError};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Weak};

const FILE: &str = "workspaces.v2.lock";

/// Locks this process holds, by path: a second service on the same dir (a
/// restart in tests) shares the lock instead of refusing itself.
static HELD: Mutex<Vec<(PathBuf, Weak<File>)>> = Mutex::new(Vec::new());

pub(super) struct ModelLock {
    _file: Arc<File>,
}

impl ModelLock {
    /// Take the dir's lock, or `None` while another process holds it.
    pub(super) fn take(dir: &Path) -> Option<Self> {
        let path = dir.join(FILE);
        let mut held = HELD.lock().unwrap_or_else(|e| e.into_inner());
        held.retain(|(_, file)| file.strong_count() > 0);
        if let Some(file) = held
            .iter()
            .find(|(p, _)| *p == path)
            .and_then(|(_, file)| file.upgrade())
        {
            return Some(Self { _file: file });
        }
        let opened = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&path);
        let file = match opened {
            Ok(file) => file,
            Err(e) => {
                tracing::warn!("workspace lock {}: {e}", path.display());
                return None;
            }
        };
        match file.try_lock() {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => return None,
            // A filesystem without locks (some network mounts): keep the model
            // anyway, as an unlocked one did before.
            Err(TryLockError::Error(e)) => {
                tracing::warn!("workspace lock {} not taken: {e}", path.display());
            }
        }
        // Who holds it, for the banner of a process that can't take it.
        let _ = file.set_len(0);
        let _ = (&file).write_all(std::process::id().to_string().as_bytes());
        let file = Arc::new(file);
        held.push((path, Arc::downgrade(&file)));
        Some(Self { _file: file })
    }

    /// The process holding `dir`'s lock, if it says (Windows' lock keeps
    /// others from reading it).
    pub(super) fn holder_of(dir: &Path) -> Option<u32> {
        std::fs::read_to_string(dir.join(FILE))
            .ok()?
            .trim()
            .parse()
            .ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn held_by_the_os_not_by_a_pid_in_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let held = ModelLock::take(dir.path()).expect("free");
        assert!(ModelLock::take(dir.path()).is_some(), "this process again");
        #[cfg(unix)]
        assert_eq!(ModelLock::holder_of(dir.path()), Some(std::process::id()));
        drop(held);

        // Another process's lock: a separate open file holding it.
        let other = File::open(dir.path().join(FILE)).unwrap();
        other.try_lock().unwrap();
        assert!(ModelLock::take(dir.path()).is_none());
        drop(other);

        // A pid left behind by one that quit (and may be reused) means nothing.
        std::fs::write(dir.path().join(FILE), "1").unwrap();
        assert!(ModelLock::take(dir.path()).is_some());
    }
}
