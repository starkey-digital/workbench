# Release v0.53.0

**Released:** 2026-10-13
**Previous version:** v0.52.4

You can now choose the font and text size of terminals and chats, on the desktop and the phone. Chats also refresh when you come back to them. A chat no longer stays on "Thinking" after its turn has ended, and agent cards now appear.

## New Features

- Added font and text size settings for terminals and chats (#293):
  - **Terminal fonts:** JetBrains Mono, Fira Code, Source Code Pro, IBM Plex Mono, Geist Mono, or the system font.
  - **Chat fonts:** Inter, IBM Plex Sans, Atkinson Hyperlegible, JetBrains Mono, or the system font.
  - **Where:** Settings → Fonts on the desktop, and the Settings sheet on the phone. Each device keeps its own choice.
  - **Native macOS terminals:** they keep Menlo and use a new size when they reopen.

## Bug Fixes

- Fixed chats showing an out-of-date view after you switched away and back, such as "Thinking" after the turn had ended or a missing agent card. A chat now gets a fresh copy from the server when its window or the phone app is shown again. The connection stays open, and text you were typing is kept (#292)
- Fixed reconnecting chats losing older messages. Messages already on screen now stay instead of being cut back to the newest ones (#292)
