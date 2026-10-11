# Release v0.52.0

**Released:** 2026-10-11
**Previous version:** v0.51.0

The chat composer is simpler: mode, model, effort and account now share one options menu, and Send now moved onto the message you already sent. Questions from a chat you started on your phone now stay in chat, a new chat no longer looks stopped while Claude starts, and you get no "turn complete" alert while Claude waits for a background subagent.

## Improvements

- Mode, model, effort and account now live in one options menu in the chat composer. Its button shows the model, or the mode when it isn't the usual one (for example Plan or Bypass, in red when nothing asks first) (#281)
- Send now is a chip on the newest message Claude hasn't read yet, instead of a button beside the text box. It disappears once Claude reads the message, and background subagents keep running. Ctrl/⌘+Enter still sends now while typing on desktop (#281)
- Stop stays visible beside Send while you type, so a running turn can be stopped on the phone without clearing your draft (#281)
- A Claude chat that hands work to a background subagent no longer alerts the desktop and phone when its turn ends. Claude picks the subagent's result up in a new turn, and that turn's end sends the alert. Background shells, such as a dev server, don't hold back alerts (#280)
- Freeze reports now include the machine's swap-ins during the freeze instead of macOS's memory pressure level, which read "normal" even with swap nearly full (#280)

## Bug Fixes

- Fixed questions and approvals from a chat you started on your phone opening in the terminal once you left the chat; tapping Review now opens them in chat (#281)
- Fixed a new chat showing "This session isn't running" or "Reconnecting" while Claude was still starting; it now waits on the starting screen (#281)
