# Release v0.57.0

**Released:** 2026-10-15
**Previous version:** v0.56.0

When Claude needs you to run something yourself, such as a login or anything that needs a browser or a real terminal, the chat now opens it in a new Workbench terminal with one click instead of asking you to type `! command`. The Agents and tasks panel also shows named agents as running while they work, instead of done.

## New Features

- Added a Run button to `! command` suggestions in Claude's replies: one click opens a new terminal tab in the chat's workspace running that command. Only Claude's own replies get the button, never tool output or subagent text (#307)
- Claude can now hand a command over to you: a card in the chat shows the command and why, with **Run in terminal**, then **Done** or **Skip**, and Claude carries on once you answer. On the phone, Run opens the terminal on the phone, and the home screen shows "Has a command for you to run" (#307)

## Bug Fixes

- Fixed named agents (teammates) showing as done in the Agents and tasks panel the moment they started. They now show as running while they work, done when they go idle, and running again when a message wakes them (#307)
