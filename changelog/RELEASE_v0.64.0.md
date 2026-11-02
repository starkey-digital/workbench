# Release v0.64.0

**Released:** 2026-11-02
**Previous version:** v0.63.0

A remote server's sidebar now looks and works like your own machine's, and you can choose which Claude account a remote server uses, for the whole server or for each project.

## New Features

- Added a Claude account switch to the footer of a remote server's sidebar. It picks the account that machine's new Claude sessions use; running sessions keep theirs (#336)
- Added a per-project Claude account on remote servers. Each project row has a Claude chip whose menu picks one of that machine's accounts for the project, or **Host's account** to follow the server's choice. A project with its own account shows its name on the row (#337)

## Improvements

- Rebuilt a remote server's sidebar to match the local one. Projects open into branches (main checkout first, then worktrees), each session sits under the branch it runs on, and rows have the same session badges, hover **+** for a new Claude session, inline **+ worktree** field and filter. The server's Workbench version and **Update** moved into the footer (#336)
- Stopped a remote project that isn't a git repository from showing an error over the sidebar; it just lists its sessions (#336)

## Bug Fixes

- Fixed sessions in a worktree created after the remote sidebar loaded not appearing in it. Refresh now reloads each project's worktrees too (#336)
- Fixed a remote server's accounts staying out of date after it reconnects, for example after an update; they reload on reconnect and on Refresh (#336)
