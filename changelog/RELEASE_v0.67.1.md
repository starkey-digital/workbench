# Release v0.67.1

**Released:** 2026-11-06
**Previous version:** v0.67.0

The sidebar now keeps its width when you switch between this Mac and a remote server, and after a restart. The remote server's sidebar is less cluttered, and text sizes are more consistent across the app.

## Improvements

- The remote server's sidebar header matches the local one: **+ Add** for new projects and an icon button for Refresh, so the server name is no longer cut off (#347)
- A remote project's Claude account shows as a small icon, tinted when the project has its own account and visible on hover otherwise. The account name is in its tooltip instead of crowding the project name (#347)
- Text sizes are more consistent across the sidebar, tabs, git and GitHub panels, settings and chat tasks (#347)
- Pane widths are remembered after a restart (#346)

## Bug Fixes

- Switching between this Mac and a remote server no longer resets the sidebar to its default width. Opening your first workspace or closing your last one no longer resets it either (#346)
