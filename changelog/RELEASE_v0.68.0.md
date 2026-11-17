# Release v0.68.0

**Released:** 2026-11-17
**Previous version:** v0.67.1

The Claude chat now shows the things that only the terminal can answer, instead of leaving them unseen: approvals on machines where Claude Code's security defaults are on, and feedback reports Claude drafts. Workbench is now tested against Claude Code 2.1.326.

## New Features

- When Claude drafts a feedback report about Claude Code, the chat says so and offers **Show terminal**, where `/feedback` reviews and sends it (#350)

## Bug Fixes

- On machines with managed settings, and in Team and Enterprise organizations, Claude Code's built-in security plugin keeps Workbench from answering approvals in the chat. A call waiting for approval now shows in the chat as waiting in the terminal, with **Show terminal** and a "needs you" alert on desktop and phone. Plan approvals and auto mode calls the classifier can't decide show the same way (#351)
- The context meter no longer reads five times too full on Opus 5.5 and Fable 5.2 before the session reports its window: it stays hidden until the real window is known (#349)
