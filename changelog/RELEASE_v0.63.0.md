# Release v0.63.0

**Released:** 2026-11-02
**Previous version:** v0.62.0

A connected Workbench server now works on the desktop the way it does on your phone. Its sessions open in the main area, with tabs, splits and Terminal | Chat, and every process runs on that machine. You can also update a remote server from the desktop. Copy to Server gained a folder picker and a progress bar with time left.

## New Features

- Opened a remote server's sessions on the desktop. Switching to a server in the sidebar shows its workspaces, tabs and splits, with the same Terminal | Chat toggle as local ones. Terminals and chats run on that machine, and chats offer that machine's own Claude accounts (#332)
- Added **Open** buttons for each project and worktree in a remote server's sidebar, and counts of the Claude and Codex sessions running in each project (#332)
- Added remote server updates. A server's sidebar shows its Workbench version and, when a newer one is out, **Update**. Updating ends that machine's terminals and chats, so it asks first. Conversations stay on disk and can be resumed (#332)
- Added **Browse…** to Copy to Server, to pick the destination folder from the other machine's own folders (#332)
- Added a progress bar to Copy to Server, showing how much has gone across, the speed and the time left (#332)
- Added Settings → Permissions toggles to stop Claude reading, or writing, files outside the project and its additional directories. Blocking writes needs Claude Code 2.1.314 or later (#334)

## Improvements

- Kept your local terminals running while you look at a remote server, so switching back is instant and keeps their scrollback (#332)

## Bug Fixes

- Fixed a chat's effort choice resetting to the default after a turn that used `ultrathink`. That turn still runs at the raised effort, and later turns go back to your choice (#334)
