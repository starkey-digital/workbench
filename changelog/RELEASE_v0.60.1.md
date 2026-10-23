# Release v0.60.1

**Released:** 2026-10-23
**Previous version:** v0.60.0

A fix release from a project-wide review. It closes two ways a sandboxed Claude session could get code run outside the sandbox. Trello boards and card links are no longer lost between windows, and branches are deleted safely when you remove a worktree. It also fixes reliability problems in the server, the worktree dialog and the chat.

## Security

- Fixed two ways a sandboxed Claude session could plant something that later ran outside the sandbox: creating a missing `.claude` folder as a link elsewhere and writing hooks through it, or writing Codex config that an unsandboxed Codex pane then loaded (#322)
- Worktrees are now protected like their project: their Claude, Codex and git config can't be rewritten from a sandboxed session, including Claude Code's own worktrees under `.claude/worktrees/` (#322)
- On macOS, a sandboxed session can no longer create or register worktrees, so it can't set one up to tamper with. Creating worktrees from Workbench's own dialog is unaffected (#322)
- Agent action prompts no longer pass control characters to the shell. A tab used to trigger completion, and a pasted Ctrl-C could run the rest of the prompt as a command (#322)

## Bug Fixes

- Fixed Trello board settings and card links overwriting each other when changed from the Settings window and the main window, and adding a board before the settings had loaded could erase the project's other boards. Changes now show up in every open window without a restart (#322)
- Fixed creating a worktree from a Trello card not linking the card to the new branch (#322)
- Fixed the new worktree dialog ignoring the suggested branch from a Trello card or the branch picker, and keeping the previous worktree's values. "Open PR as worktree" now checks out the PR's own commits, including PRs from forks (#322)
- Removing a worktree with "delete branch" ticked now deletes a squash-merged branch when it's still exactly the merged PR's commit. A branch with newer commits is kept, and you're told why (#322)
- Worktree folders for branches like `feature/login` are now one folder (`repo-feature-login`) instead of nested ones, and a name that's taken gets `-2` (#322)
- Fixed the terminal limit being exceeded when many terminals start at once, and a slow request from one client holding up every other client's workspace commands (#322)
- Fixed GitHub status for a project sometimes never updating after a failed background sync (#322)
- Fixed loaded images disappearing from a chat card when "Load images" was clicked twice, and loading earlier Codex history slowing down as it grew (#322)
- Approvals now fall back to the terminal's dialog cleanly when a proxy or network error returns something other than the server's reply (#322)
