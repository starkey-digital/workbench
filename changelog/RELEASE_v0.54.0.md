# Release v0.54.0

**Released:** 2026-10-14
**Previous version:** v0.53.0

A chat no longer gets stuck on "Thinking" or misses agent cards after you switch to the terminal and back. Chats now notice when they fall out of step with the server and fix themselves. You can also turn on extended diagnostics to help track down problems.

## New Features

- Added an opt-in **Share extended diagnostics** setting (Settings → General → Privacy, off by default). Error reports then include connection events for chats and terminals. They never include prompts, replies, titles, paths or tokens (#300)
- Added **Resync now** and **Copy diagnostics** to the chat menu, on the desktop and the phone (#298)
- Desktop warnings and errors from the app's interface are now written to `workbench.log` (#300)
- A view that fails to render now shows **Reload view** instead of a blank pane (#300)

## Bug Fixes

- Fixed a chat staying on "Thinking", or not showing agent cards, after you switched to its terminal and back (#296)
- Fixed chats drifting out of step with the server. A chat now checks itself when it resyncs, and resyncs on its own if it hears nothing for 60 seconds during a turn (#298)
- Fixed Stop not clearing "Thinking" when no turn was running, and other cases where a chat stayed busy (#299)
- Fixed a chat losing or repeating messages when Claude restarted inside its terminal (#299)
- Fixed Restart on a chat skipping the approval step (#298)
- Fixed terminals reconnecting by themselves after a dropped connection, which could make two devices take the terminal from each other. They now show "Connection lost" with a Reconnect button (#297)
- Fixed terminal output being repeated after a slow connection caught up, and native macOS terminals dropping output (#301)
- Fixed the saved workspace staying locked after Workbench quit unexpectedly (#301)
- Fixed a quick double Restart leaving a stray terminal or two `claude` processes running (#301)
- Fixed a new session on an unopened worktree starting before its workspace was open (#297)
- Fixed the GitHub sidebar emptying its pull requests when a fetch failed (#301)
- Fixed the freeze watchdog reporting a freeze after sleep or while it sampled threads (#301)
- Fixed a startup failure giving no message. It now shows a notification (#297)
