# Release v0.56.0

**Released:** 2026-10-15
**Previous version:** v0.55.0

Workbench is now ready for Claude Code 2.1.300. Chats that use subagents keep track of their turn correctly again, keeping a chat's cache warm works alongside Claude Code's new idle compaction, and a chat now shows the right cache lifetime from its first reply.

## Improvements

- A chat now knows how long its prompt cache lasts from the first reply, instead of assuming 5 minutes until the turn ends. Claude Code 2.1.300 records each request's cache settings, and Workbench reads them (#305)
- Opening a chat's history skips the large request records Claude Code 2.1.300 adds to session files, so long sessions load as fast as before (#305)

## Bug Fixes

- Fixed chats that run subagents losing track of their own turn on Claude Code 2.1.299 and later, which could end the chat's wait early or leave it stuck on busy (#305)
- Fixed "keep warm" not working for conversations over 200K tokens: Claude Code now compacts them after about 54 idle minutes, so Workbench refreshes a 1-hour cache 10 minutes before it expires instead of 2 (#305)
