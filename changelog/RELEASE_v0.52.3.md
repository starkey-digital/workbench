# Release v0.52.3

**Released:** 2026-10-13
**Previous version:** v0.52.2

Workbench now opts out of macOS App Nap, the likely cause of the app pausing for up to a minute while its window was in the background, which also stalled a connected phone. Closing a busy terminal no longer reports an error, and the phone no longer flags normal battery-saving pauses as problems.

## Bug Fixes

- Workbench opts out of App Nap on macOS, the likely cause of background pauses of up to a minute that also froze terminals and chats on a connected phone (#288)
- Fixed an error when closing a terminal pane while it was still printing output (#288)
- Fixed the Android app reporting a stalled connection when the phone was only in battery-saving Doze (#288)
