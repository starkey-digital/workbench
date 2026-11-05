# Release v0.67.0

**Released:** 2026-11-05
**Previous version:** v0.66.0

The phone can now manage projects and workspaces, not just run sessions in them. Make a new folder or clone a repository as a project, create and remove worktrees, and close workspaces you don't need.

## New Features

- Adding a project on the phone now has **Folder** and **Clone** tabs. Use the folder you're looking at, make a new one there (as a git repository if you like), or clone a repository from the machine's GitHub list or by URL or `owner/repo`. You can then name it, pick its group and choose its Claude account (#344)
- Remove a worktree from the phone. It asks first and says how many sessions will end. It deletes the worktree's branch too, unless the branch has unmerged work. If git refuses because of uncommitted changes, you can choose **Remove anyway** (#344)
- New worktrees on the phone open a sheet instead of being made the moment you tap. You can branch off fresh or check out an existing branch (including one that's only on the remote), and **Create + Claude** starts a session in it straight away (#344)
- Close a workspace from the phone's Running list, ending its sessions on every device. Empty workspaces are listed too, so you can clear them away (#344)

## Improvements

- Each worktree on the phone shows how many sessions are open in it (#344)

## Bug Fixes

- Claude accounts added on a machine now show up on your phone and on desktops connected to it, without reconnecting. The phone checks again when you come back to it or open an account picker, and a connected desktop checks every 15 seconds (#344)
- A project on a Windows machine is recognised as already added, however its path is written (#344)
