# Release v0.59.1

**Released:** 2026-10-20
**Previous version:** v0.59.0

The chat view fits its window again: a long first message no longer pushes the chat off the right edge, and the chat narrows when you make the window smaller.

## Bug Fixes

- Fixed the chat view growing far wider than the window when the chat's title (its first message) was long, which cut off the header and the transcript on the right. The chat now also shrinks with the window instead of staying at its widest (#317)
