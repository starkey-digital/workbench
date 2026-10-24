# Release v0.61.1

**Released:** 2026-10-24
**Previous version:** v0.61.0

A fix release for the chat's Agents and tasks panel. Background commands now show as finished when they end, and agents show their conversation even after Claude moves into a worktree.

## Bug Fixes

- Fixed background commands staying marked as running after they finished. They were only marked done when Claude's whole turn ended, so they kept spinning through long turns. They now finish as soon as Claude is told they're done (#326)
- Fixed agents showing "No conversation yet" after Claude moved into a worktree. This also affected other features that read the chat's history, such as rewind (#326)
- An agent's details now open on its conversation only. The Output view showed the agent's raw log file (#326)
- Agents started by another agent now show their activity on that agent's entry in the panel, and stopping the chat stops them too (#326)
