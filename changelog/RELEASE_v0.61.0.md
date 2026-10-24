# Release v0.61.0

**Released:** 2026-10-24
**Previous version:** v0.60.1

You can now add, edit and remove projects from your phone, including which Claude account a project's new sessions start under. You no longer need to be at your desk to set up a project.

## New Features

- Added projects from the phone: tap **+** beside the project search, browse your computer's folders from your home folder (Git checkouts are marked, and folders that are already projects can't be picked again), then name the project and choose its group and Claude account (#324)
- Edited projects from the phone: an expanded project has **Edit** for its name, group and the Claude account its new sessions use (the active account, the default login or a named one). A rename updates the project's open workspaces on every device (#324)
- Removed projects from the phone: **Remove project** in the edit sheet, after a confirm, ends the project's open sessions and takes it off the list. The folder stays on disk (#324)

## Improvements

- The desktop sidebar updates straight away when the phone adds, edits or removes a project. A removed project's star is cleared on both the phone and the desktop (#324)
