//! Copying a project, and the Claude config around it, to another Workbench
//! host: the sending desktop packs a gzipped tar and posts it to the target's
//! `/transfer/*` routes, which unpack it there.

pub mod claude;
pub mod project;
pub mod send;

use std::fs;
use std::io::{self, Write};
use std::path::Path;

use anyhow::Result;
use tar::Builder;

/// Appends everything under `dir` as `archived/...`, without following
/// symlinks or descending into a directory `skip` names. A file that goes away
/// mid-walk (a dev server's output) is left out rather than failing the copy.
fn walk<W: Write>(
    tar: &mut Builder<W>,
    dir: &Path,
    archived: &Path,
    skip: &dyn Fn(&Path) -> bool,
) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = archived.join(entry.file_name());
        let ty = entry.file_type()?;
        let appended = if ty.is_dir() {
            if skip(&path) {
                continue;
            }
            tar.append_dir(&name, &path)
                .map_err(anyhow::Error::from)
                .and_then(|()| walk(tar, &path, &name, skip))
        } else if ty.is_file() || ty.is_symlink() {
            tar.append_path_with_name(&path, &name)
                .map_err(anyhow::Error::from)
        } else {
            continue;
        };
        if let Err(e) = appended {
            let vanished = e
                .downcast_ref::<io::Error>()
                .is_some_and(|e| e.kind() == io::ErrorKind::NotFound);
            if !vanished {
                return Err(e);
            }
        }
    }
    Ok(())
}
