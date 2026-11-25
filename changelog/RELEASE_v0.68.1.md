# Release v0.68.1

**Released:** 2026-11-25
**Previous version:** v0.68.0

"Turn complete" alerts no longer pile up while Claude waits on background work.

## Bug Fixes

- "Turn complete" no longer fires several times for one request when Claude works in the background. While a background agent or a background command Claude just started is still running, the alert waits for its result to wake Claude and comes once, when Claude is done. A command that keeps running, like a dev server, delays it by at most 2 minutes, and only the first time (#353)
