# Release v0.55.0

**Released:** 2026-10-15
**Previous version:** v0.54.0

Workbench now has a light theme. Each device picks Dark, Light or System on its own, so a phone can go light outdoors while the desktop stays dark. Dark is still the default.

## New Features

- Added **Light** and **System** themes beside Dark. On the desktop, find them in Settings → Appearance (formerly Fonts); on the phone, in the Settings sheet. System follows the light or dark setting of the OS (#303)
- Terminals follow the theme too. The light palette uses darker colours that stay readable on the pale background, in both xterm and native macOS terminals, and changes apply at once without reopening the pane (#303)

## Improvements

- Every accent colour has a darker light-theme version, so buttons and highlights keep strong contrast on white (#303)
- Toasts, PR and CI status badges, and the update dialog now follow the theme. On macOS the window title bar matches it as well (#303)
- The app opens in the chosen theme, with no flash of the other one at launch (#303)
