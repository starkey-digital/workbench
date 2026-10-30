//! Copying a project, and the Claude config around it, to another Workbench
//! host: the sending desktop packs a gzipped tar and posts it to the target's
//! `/transfer/*` routes, which unpack it there.

pub mod claude;
pub mod project;
pub mod send;

use std::fs;
use std::io::{self, Write};
use std::path::Path;

use anyhow::{Context, Result};
use tar::Builder;

/// Appends everything under `dir` as `archived/...`, without descending into a
/// directory `skip` names. With `follow`, a symlink is copied as what it points
/// to (the builder must follow symlinks too); without, as a link. A file that
/// goes away mid-walk (a dev server's output) is left out rather than failing
/// the copy; any other unreadable file fails it, naming the file.
fn walk<W: Write>(
    tar: &mut Builder<W>,
    dir: &Path,
    archived: &Path,
    follow: bool,
    skip: &dyn Fn(&Path) -> bool,
) -> Result<()> {
    let entries = fs::read_dir(dir).with_context(|| format!("can't read {}", dir.display()))?;
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let name = archived.join(entry.file_name());
        let ty = if follow {
            fs::metadata(&path).map(|m| m.file_type())
        } else {
            entry.file_type()
        };
        let appended = match ty {
            Ok(ty) if ty.is_dir() => {
                if skip(&path) {
                    continue;
                }
                tar.append_dir(&name, &path)
                    .with_context(|| format!("can't read {}", path.display()))
                    .and_then(|()| walk(tar, &path, &name, follow, skip))
            }
            Ok(ty) if ty.is_file() || ty.is_symlink() => tar
                .append_path_with_name(&path, &name)
                .with_context(|| format!("can't read {}", path.display())),
            Ok(_) => continue,
            Err(e) => Err(e).with_context(|| format!("can't read {}", path.display())),
        };
        if let Err(e) = appended {
            let vanished = e
                .root_cause()
                .downcast_ref::<io::Error>()
                .is_some_and(|e| e.kind() == io::ErrorKind::NotFound);
            if !vanished {
                return Err(e);
            }
        }
    }
    Ok(())
}
