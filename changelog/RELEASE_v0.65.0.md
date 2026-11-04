# Release v0.65.0

**Released:** 2026-11-04
**Previous version:** v0.64.0

Connected servers can now be edited after they're added. Each server remembers where projects get copied to. Server mode lets you choose which address it listens on and shows the full URLs to give another machine. Restarting a Claude session now works on hosts whose shell profile sets `CLAUDE_CONFIG_DIR`.

## New Features

- Added editing for connected servers. A pencil next to each server in the instance switcher opens its name, URL, token and copy folder. A new URL or token reconnects to the server; renaming doesn't interrupt anything (#340)
- Added a default copy folder for each server. **Copy to server** starts in that server's folder and switches when you pick another server. When you use a different folder, a **Make this the default** checkbox saves it once the copy succeeds. You can also set the folder in the server's edit dialog (#340)
- Added a **Listen on** choice to server mode. It can listen on every interface (the default), on one of this machine's addresses such as its Tailscale IP, or on `127.0.0.1` only. Changing it restarts the server (#340)
- Added the server's full addresses to server mode settings. Each `http://ip:port` it answers on has a copy button, ready to paste into **Connect instance** on another machine. **Pair phone** only offers addresses the server is listening on (#340)

## Improvements

- **Test connection** no longer shows a stale "reachable" after you change the URL or token (#340)
- When a saved listen address has gone, for example after a network change or before Tailscale is up, server mode settings say the server isn't listening. It never falls back to listening on every interface (#340)

## Bug Fixes

- Fixed "Session ID … is already in use" when restarting a Claude session on a host whose shell profile exports `CLAUDE_CONFIG_DIR`. The same profile line also no longer overrides the Claude account Workbench picked for a session (#339)
