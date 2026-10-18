# Release v0.58.0

**Released:** 2026-10-18
**Previous version:** v0.57.0

Sessions that need your answer are now hard to miss on desktop. Any workspace or Claude tab with a question or approval waiting turns red with a pulsing alert, even when it isn't selected, and a "waiting on you" button jumps straight to it. This release also brings the Workbench plugin up to Claude Code 2.1.302.

## New Features

- Workspace and Claude/Codex tabs waiting on you now show a red tint, a red top bar and a pulsing alert icon, whether or not they're selected. Before, a background workspace with a question showed nothing (#310)
- Added a "N waiting on you" button to the workspace tab strip. Each click takes you to the next session with a question or approval (#310)
- A question that arrives while Workbench is in front now shows an in-app alert with a **Show** button, which closes on its own once the question is answered. In the background you still get the system notification, and on macOS the Dock icon bounces once (#310)

## Improvements

- Updated the Workbench plugin for Claude Code 2.1.302 (#311)

## Bug Fixes

- Fixed chats on Claude Code 2.1.301 or later where a blocked environment write could make Workbench treat the session as restarted, reloading its history and ending the running turn (#309)
