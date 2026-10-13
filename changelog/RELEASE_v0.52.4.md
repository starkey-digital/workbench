# Release v0.52.4

**Released:** 2026-10-13
**Previous version:** v0.52.3

Workbench on macOS now keeps running while the display is asleep. Before this, the whole app could pause for minutes once the screen turned off, which left a connected phone with no answer until someone woke the Mac.

## Bug Fixes

- Fixed Workbench on macOS pausing while the display slept, which stopped terminals and chats on a connected phone until the Mac was woken. The Info.plist opt-out added in v0.52.3 didn't prevent it; Workbench now uses Apple's documented API to stay scheduled. The Mac can still sleep on its own (#290)
