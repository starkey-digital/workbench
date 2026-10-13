# Release v0.52.2

**Released:** 2026-10-13
**Previous version:** v0.52.1

Long Claude chats keep every reply. When Claude Code reloaded the Workbench plugin mid-session, for example after switching worktree, new replies could replace older messages further up the chat, and finished background commands and subagents could stay "running" in the Agents and tasks panel.

## Bug Fixes

- Fixed replies in a long Claude chat that showed in the terminal but not in chat; each was replacing an older message higher up (#286)
- Fixed background commands and subagents that stayed "running" in the Agents and tasks panel after they finished (#286)
