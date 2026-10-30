# Release v0.62.0

**Released:** 2026-10-30
**Previous version:** v0.61.1

You can now copy a project to another Workbench server, with your Claude setup if you want it, which makes moving to a new machine much easier. Cloning from GitHub now lists your organizations' repositories too.

## New Features

- Added **Copy to Server…** to a project's menu (shown once a remote server is connected). The whole project folder goes across, including uncommitted work, stashes, local branches and `.env` files, and is added as a project on the other machine. Rebuildable output such as `node_modules`, `target` and `dist` is left behind, and an existing folder is never overwritten (#330)
- Optionally copy your Claude config with a project: CLAUDE.md, settings, keybindings, skills, agents, commands, hooks and your user MCP servers. Files already on the other machine are never overwritten, and paths under your home folder are moved to its home folder (#330)
- Optionally copy your extra Claude accounts and their config. Logins don't travel, so run `claude /login` once per account on the new machine (#330)

## Improvements

- Removed the chat's "Compact before it expires" option. Claude Code now compacts long idle conversations itself, just before the prompt cache expires. Keep-warm and Refresh now still keep the cache warm (#328)

## Bug Fixes

- Fixed Clone from GitHub listing only your own repositories. It now also lists repositories from your organizations and ones you collaborate on, and no longer stops at 100 (#329)
- Fixed the default Claude account picking up another account's settings when Workbench was started from a terminal that had `CLAUDE_CONFIG_DIR` set. Plan usage, sign-in status and new terminals for the default account now always use `~/.claude` (#330)

## Security

- Copying a project sends `.env` files, settings and MCP server definitions, which can hold secrets, over the server's plain-HTTP connection. Connect to the other machine through its Tailscale address (#330)
