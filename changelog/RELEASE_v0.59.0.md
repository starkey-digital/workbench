# Release v0.59.0

**Released:** 2026-10-19
**Previous version:** v0.58.0

Manage your Claude Code plugins without leaving the chat: type `/plugin` to switch plugins on or off, update or remove them, and install new ones from your marketplaces. Picking a slash command or skill on the phone no longer sends it straight away, and menus, tooltips and dialogs open and close more crisply.

## New Features

- Type `/plugin` in a Claude chat, on desktop or phone, to open a Plugins panel: switch each installed plugin on or off, update or uninstall it, and search your marketplaces to install new ones. It works for the chat's own account and folder, including project plugins, and offers a one-tap chat restart to load your changes (#314)

## Improvements

- Menus, dropdowns, selects, popovers, tooltips and dialogs now open with a snappier ease-out and close faster. Moving along a toolbar no longer replays each tooltip's animation (#313)
- With reduced motion turned on in your system settings, menus and dialogs fade in and out without zooming or sliding, and progress bars no longer animate (#313)
- Smoother progress bars in the plan card and the update dialog (#313)

## Bug Fixes

- On the phone, tapping a command or skill in the `/` menu, or picking it with the keyboard, now fills it into the message box instead of sending it, so you can add arguments before tapping Send. Desktop is unchanged (#313)
