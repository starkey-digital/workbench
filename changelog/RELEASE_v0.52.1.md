# Release v0.52.1

**Released:** 2026-10-13
**Previous version:** v0.52.0

Chats now stay current: "Thinking" clears when a turn ends, and the Agents and tasks panel follows subagents and background commands as they run, with no need to switch to the terminal and back. A Codex chat whose CLI stops responding now ends cleanly instead of hanging.

## Bug Fixes

- Fixed a chat that kept showing "Thinking" after Claude finished, and an Agents and tasks panel that stopped updating, until you switched to Terminal and back to Chat (#283)
- Fixed a Codex chat that could hang instead of ending when its CLI stopped reading input; it now ends and is removed straight away (#284)

## Improvements

- Updated the app's dependencies, including Svelte, Tauri and its plugins, Vite and Sentry (#283, #284)
