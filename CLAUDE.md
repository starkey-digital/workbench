# CLAUDE.md

## Project Overview

Workbench is a Tauri v2 + Svelte 5 desktop terminal manager. Users add local project folders, and each project gets a tabbed workspace with real shell terminals (server terminals via `workbench_core::pty` + `xterm.js`). Config persisted to `~/.workbench/projects.json`; workspaces are the embedded server's (`~/.workbench/workspaces.v2.json`).

It is a **monorepo** (Cargo workspace + bun/Turborepo workspace). Beyond the desktop app it ships a **headless control-plane server** (`workbench-server`) that can run on any machine — and the desktop app can host the same server in "server mode". The server lets another device (phone/desktop) list/create worktrees and run terminals and Claude/Codex chats on its machine (HTTP control plane + terminal/chat WebSockets).

### Monorepo layout

```
Cargo.toml / package.json / turbo.json   # workspace roots (repo root)
apps/
  desktop/      # the Tauri app: src/ (Svelte frontend) + src-tauri/ (Rust, crate `workbench`)
  server/       # workbench-server: headless axum control plane (lib + bin), NO tauri
  mobile/       # Tauri Android client: chat-first home, chat + terminal views (see docs/MOBILE.md)
crates/
  workbench-core/   # shared pure Rust logic (no tauri): config, git, sessions, settings, types
packages/
  types/             # @workbench/types: shared TS types (mirror of workbench-core serde types)
  transport/         # @workbench/transport: ControlPlaneTransport (Tauri/Http/mock impls), typed via @workbench/types
  ui/                # @workbench/ui: shadcn-svelte primitives + cn(); subpath exports (@workbench/ui/button …)
  theme/             # @workbench/theme: theme.css — design tokens, accent presets, Tailwind v4 @theme mappings
  control-plane-ui/  # @workbench/control-plane-ui: transport-driven ControlPlaneStore + ControlPlaneSidebar (desktop-remote)
  telemetry/         # @workbench/telemetry: Sentry setup + reporting shared by both webviews (see Observability)
  chat-ui/           # @workbench/chat-ui: Claude chat view (AgentChat, agentClient, ChatTranscript, composer, cards) for desktop + mobile
plugins/workbench/    # Claude Code plugin (mod) reporting session activity to the hook bridge; injected only (no marketplace), so `plugin.json` is all it keeps of `.claude-plugin/`. Workspace package @workbench/claude-plugin: `test` = bun test (`test/`, the link's timeouts and retries against a fake fetch), `check` = tsc against types/claude-code.d.ts (the plugin API Claude Code 2.1.309 writes; replace it whole when bumping the tested CLI: the `plugin-authoring` skill writes the full file, built-in tool types included, to its own folder's `types/claude-code.d.ts`), `lint` = eslint; `claude plugin validate plugins/workbench` locally (no CLI in CI)
docs/                # SIGNING, SANDBOX_RUNTIME, MOBILE, LANDING_PAGE deep dives
.design-sync/        # claude.ai/design sync inputs (tokens-only; see its NOTES.md)
```

`@workbench/ui` owns the shadcn primitives (`@workbench/ui/<component>`) and `cn`/type-helpers (`@workbench/ui` root). `@workbench/theme` (`packages/theme/theme.css`) holds every token, the accent presets, the `@theme inline` utility mappings, the base layer and the `@source` lines that make Tailwind v4 scan `packages/ui`, `packages/control-plane-ui` and `packages/chat-ui`; each app's `app.css` imports it after `tailwindcss`. `@workbench/control-plane-ui` is a clean, transport-driven shared sidebar (list projects, view/create worktrees and their GitHub links, no terminal IO) — consumed by the desktop's **remote-client mode** (ActivityRail "Remote server" → `RemoteServerDialog`, `HttpTransport`). The mobile app uses its `ControlPlaneStore` but has its own home screen. `@workbench/chat-ui` holds everything platform-neutral about the chat view; hosts call `setChatPlatform` for what differs (link opening: desktop the `open_url` command, mobile `plugin-opener`; OS file drops: desktop only) and pass an `AgentApi` (`agentClient(() => ({ baseUrl, token }))`).

Not yet extracted (deferred; desktop keeps its own terminal-coupled `ProjectSidebar`/stores): splitting the desktop `ClaudeSessions`/`Workspace` stores into shared core slices. The desktop's rich sidebar is intentionally NOT shared — it's coupled to terminals/git/github; the shared `ControlPlaneSidebar` is the lean cross-platform one.

Three Cargo crates: `workbench` (desktop, depends on core + server), `workbench-core` (pure logic), `workbench-server` (lib+bin). `workbench-core` and `workbench-server` must **never** depend on `tauri` — verify with `cargo tree -p workbench-server | grep -i tauri` (must be empty). Tauri deps live only in `apps/desktop/src-tauri/Cargo.toml`.

## Release

- **GitHub releases:** created automatically by GitHub Actions (`tauri-action`) when a `v*` tag is pushed. **Do not** run `gh release create` manually — it causes duplicate/empty releases.
- **Issue/PR linking:** enabled — append `(#N)` references to changelog entries so GitHub auto-links them.
- **Tag format:** `v`-prefixed semver (e.g. `v0.18.0`).
- **Changelog location:** `changelog/RELEASE_{version}.md`.
- **Release flow:** write changelog → commit → tag → push commit + tag → let CI publish the release.
- **Android APK:** the `android` job in `release.yml` (ubuntu, NDK r29, `aarch64` only) builds `apps/mobile` in parallel with desktop, signs it from the `ANDROID_*` secrets (hard failure when empty; see `docs/SIGNING.md` §Android) and uploads `workbench-android-<version>.apk` + `.sha256` as an artifact; `publish` attaches them to the draft (which `build`'s tauri-action creates, so no race) before un-drafting. `workflow_dispatch` runs only the Android build (artifact, no release). Mobile `tauri.conf.json` `version` is synced from the tag like desktop; Tauri derives `versionCode = major*1_000_000 + minor*1_000 + patch`. Release builds allow cleartext (the server is plain HTTP/WS).
- **Windows signing:** Azure Artifact Signing via the `starkey-digital` org's `AZURE_*` secrets; `signCommand` is in `apps/desktop/src-tauri/tauri.windows-sign.json`, merged with `--config` only by the release job, and the job verifies both signatures (`docs/SIGNING.md` §Windows).
- **macOS signing/notarization:** see `docs/SIGNING.md`. Driven by `APPLE_*` GitHub secrets; the release workflow fails when any is empty, unless the repo variable `ALLOW_UNSIGNED_RELEASE=true`. Local signed builds: `bun run --cwd apps/desktop build:signed` + a `signing.env` at the repo root.

## Workflow

**Default flow for all non-trivial work** — never commit directly to `main`:

1. **Branch:** create a feature branch off `main` (e.g. `feat/...`, `fix/...`). `main` has force-push protection.
2. **Commit:** Conventional Commits format. Commit/push only when the change is complete or the user asks.
3. **PR:** open a PR with `gh pr create`. Reference issues/PRs with `(#N)` so GitHub auto-links.
4. **Auto-merge:** add the `automerge` label (`gh pr create --label automerge`, or `gh pr edit N --add-label automerge`) — don't sit and babysit checks unless asked. **Kodiak** (GitHub App, `.kodiak.toml`) acts as the merge queue: it keeps labelled PRs up to date with `main` (branch protection requires up-to-date branches, so without it every merge to `main` strands the other PRs as BEHIND) and squash-merges once `frontend`/`rust`/`rust-windows`/`rust-macos`/`e2e` pass. It keys off the label (`require_automerge_label`), not GitHub's native `gh pr merge --auto`. Titles matching `WIP`/`DRAFT`/`DO NOT MERGE` or labels `wip`/`do-not-merge` block it. GitHub's built-in merge queue isn't available — it's org-only and this repo is user-owned.
5. **Cleanup:** Kodiak deletes the branch after merge (`delete_branch_on_merge`).

The `github-pr` / `prep-pr` skills automate this; prefer them over hand-running `gh`.

**CI scope** (`.github/workflows/ci.yml`): a `changes` job (`dorny/paths-filter`) decides what a diff needs. Docs-only changes (`**/*.md`, `docs/`, `changelog/`, `site/`, `.design-sync/`) run only the prettier check; Rust suites run only when Rust inputs change (`*.rs`, `Cargo.*`, `crates/`, `apps/server/`, `apps/*/src-tauri/`, `ci.yml`). The required checks (`frontend`/`rust`/`rust-windows`/`rust-macos`/`e2e`) always report: gate them with job- or step-level `if:`, never workflow-level `paths`/`paths-ignore`, or a filtered-out required check blocks the PR forever. If `changes` fails, every suite runs. Rust jobs run from the repo root (`cargo test --workspace`, which also runs `workbench-core`, `workbench-server` and `apps/server/tests`). `e2e` installs WebKit deps with plain `apt-get` (`cache-apt-pkgs-action`'s `.debs` from an older runner image mixed Mesa versions and broke WebKit). Leave `swatinem/rust-cache` on its default `target/`: the Cargo workspace is the repo root, so pointing `workspaces:` at a member dir caches nothing.

## Commands

Run from the repo root. JS tasks go through Turborepo (the local `turbo` binary — invoke via `bun run`, not a global `turbo`).

- **Install:** `bun install` (bun workspaces link `@workbench/*` into the consuming app's `node_modules`)
- **Dev:** `bun run dev` (`turbo run dev --filter=@workbench/desktop` → `tauri dev`, Vite on 1420). `tauri dev` is its own instance: config in `~/.workbench-dev` (`tauri::is_dev()` → `paths::set_workbench_config_dir`, not inherited by its shells; the first run copies `projects.json`), so it runs beside the installed app without touching its settings or plugin copy
- **Build:** `bun run build` (`turbo run build`)
- **Typecheck:** `bun run check` (`turbo run check` — svelte-check on desktop, tsc on packages)
- **Lint:** `bun run lint` (root `prettier --check .` then `turbo run lint` — eslint per package)
- **Format:** `bun run format` (`prettier --write .`)
- **Rust:** `cargo build` / `cargo test` / `cargo clippy` operate on the whole workspace; scope with `-p workbench|workbench-core|workbench-server`.
- **Android (mobile):** `cd apps/mobile && bun run tauri android build --apk --target aarch64` (`--debug` for debug; `bun --cwd apps/mobile run tauri …` does not work). Needs `ANDROID_HOME`, `NDK_HOME`, `JAVA_HOME` (JDK 21). Launcher icons: `bunx tauri icon app-icon/manifest.json` from `apps/mobile` (adaptive foreground/background SVGs live in `app-icon/`).
- **Server (standalone):** `cargo run -p workbench-server -- --port 4317 --token <32+ chars>` (flags: `--bind`, `--port`, `--token`, `--insecure-no-token`; envs `WORKBENCH_BIND/PORT/TOKEN`). Refuses to start on a non-loopback bind without a token unless `--insecure-no-token`; a token shorter than 32 chars is always refused.

### Tests

Maps onto Tauri v2's three testing layers (https://v2.tauri.app/develop/tests/): **(1)** mock the frontend IPC boundary, **(2)** test Rust `#[tauri::command]`s under the mock runtime, **(3)** WebDriver e2e for the GUI.

- **Layer 1 — frontend IPC.** Control-plane code depends on the `ControlPlaneTransport` abstraction, so tests **inject `createMockTransport()`** (dependency inversion — preferred over monkey-patching `mockIPC`). Direct `@tauri-apps/api` paths (native terminal IO, events) are intercepted by `apps/desktop/src/test/tauri-mocks.ts` (`vi.mock('@tauri-apps/api/{core,event}')` exposing `listenSpy` / `emitMockEvent` / `clearListeners`) — our hand-rolled equivalent of `@tauri-apps/api/mocks`.
- **Layer 2 — Rust commands via the mock runtime.** `tauri::test` (`mock_builder().manage(state).build(mock_context(noop_assets()))`) drives `#[tauri::command]`s with no webview. Enabled by `tauri = { features = ["test"] }` declared as a **dev-dependency** (`apps/desktop/src-tauri/Cargo.toml`) so feature unification keeps `test` out of release builds. Example: `server_control.rs`'s `lan_start_status_stop_cycle` exercises the start/stop/status commands (a repeat start with the same token is a no-op; a different token restarts); `rotating_the_token_restarts_a_running_lan_listener` asserts the old token is rejected after rotation; `listeners_share_terminals_across_lan_restarts` proves both listeners see one terminal set. Thin wrapper commands (`commands.rs` etc.) stay untested at this layer — their logic lives in `workbench-core` (unit-tested).
- **Layer 3 — WebDriver e2e: smoke only** (`apps/desktop/e2e`). WebdriverIO's `@wdio/tauri-service` with the **embedded** provider: `tauri-plugin-wdio-webdriver` runs a W3C WebDriver server inside the app, so it works on macOS (WKWebView), where `tauri-driver` doesn't. The plugin is behind the opt-in cargo feature `e2e` and a `compile_error!` blocks it in release: it's an unauthenticated server on `127.0.0.1:4445`, and sandboxed sessions can reach loopback, so it must never be in `tauri dev` or shipped builds. `bun run --cwd apps/desktop build:e2e` (`tauri build --debug --no-bundle --features e2e`, with an empty `VITE_SENTRY_DSN` so CI runs never report to Sentry) then `test:e2e`. `wdio.conf.ts` points `WORKBENCH_CONFIG_DIR` at a temp dir seeded with the repo as the only project. Specs check boot, sidebar, the Scripts tab and the settings window; the `e2e` CI job (Ubuntu + xvfb) is a required check. `tauri-plugin-wdio` (mocking/log capture) is not installed: its `execute` permission runs arbitrary JS.
- **Suite contents** (Rust and JS, per package): `docs/TESTING.md`.
- **Test env knobs** (read by the server/core at runtime): `WORKBENCH_CLAUDE_BIN` (fake `claude`; also what a chat's terminal runs, so chat tests point it at `tests/support`'s Python plugin bridge, which runs the stream-json stand-in named by `WORKBENCH_FAKE_CLAUDE` and talks `/mod/*` for it), `WORKBENCH_CONFIG_DIR` (isolate `~/.workbench`; write a `projects.json` so the **cwd allowlist** accepts the test dir — see `register_project()`), `WORKBENCH_MAX_TERMINALS` (low cap for the cap test). These mutate **process-global** env, so env-mutating tests hold the module `ENV_LOCK` mutex (`env_guard()`) and only one test may depend on a given value at a time.
- **Desktop vitest projects:** `bun run --cwd apps/desktop test:unit` (`*.test.ts`, node) / `test:component` (`*.test.svelte.ts`, jsdom: rune stores, not rendering).
- **Cross-language integration** (`packages/transport/src/http.integration.test.ts`): drives the real `HttpTransport` against the real `workbench-server` binary (`list_projects` round-trip, `git_status` rejecting an unknown worktree; registers its project dir via `WORKBENCH_CONFIG_DIR`). Auto-**skips** unless `target/debug/workbench-server` exists, so build it first (`cargo build -p workbench-server`); otherwise `turbo test` silently skips it.
- **Deliberately not unit-tested — this is the WebDriver layer's job:** rendered `.svelte` component interaction. Our components are thin context-coupled views that delegate to the thoroughly-tested stores, and they wrap Bits UI / shadcn primitives (dialog portals, focus traps) that are friction-prone and flaky under jsdom. So the policy is: **push real logic out of components into stores/helpers and unit-test that** (e.g. `MobileClient`, `terminalWsUrl`), rather than render-test the views. Rendering is smoke-checked by the WebDriver layer; keep new component behaviour in stores/helpers anyway.
- Also not covered: the `terminal.rs` attach lock-ordering reattach race (timing-only) and the `spawn_blocking` offloading (behavior-preserving — no observable change to assert).

Use **Bun** exclusively — do not introduce npm/yarn/pnpm lockfiles. Prettier runs at the root (single pass, keeps prettier-before-eslint ordering); eslint runs per package via turbo.

## Architecture

### Tauri v2 model

- **Rust backend** (`apps/desktop/src-tauri/src/`): Window management, native macOS terminals, Tauri commands, embedded server control. Crate `workbench` (lib name `workbench_lib`).
- **Frontend** (`apps/desktop/src/`): Plain Svelte 5 + Vite (no SvelteKit). Dev: `http://localhost:1420`; prod: `apps/desktop/dist/index.html` (tauri `frontendDist` is `../dist` relative to `src-tauri/`).

### Shared core crate (`crates/workbench-core/src/`)

Pure, non-Tauri logic reused by desktop and server (config, git, worktrees, the cwd allowlist, session discovery and transcripts, Claude/Codex launch commands, settings, the workspace model, pty, shell). All serde types are `camelCase`; all fns return `anyhow::Result`. Every Claude terminal command is built here (`claude_launch`), so no client can skip the sandbox or permission mode. Module map: `crates/workbench-core/CLAUDE.md`.

Desktop re-exports every core module at its crate root (`pub use workbench_core::{config, git, types, …}` in `lib.rs`) so `crate::config`, `crate::types`, etc. resolve unchanged across the desktop code — only the re-export line changes when moving logic to core.

### Desktop-only Rust (`apps/desktop/src-tauri/src/`)

`main.rs`/`lib.rs` (entry, `build_invoke_handler!`), thin `*_commands.rs` shells over `workbench_core`, `server_control.rs` (one `Managers` shared by the loopback and LAN listeners; the only updater). Module map: `apps/desktop/src-tauri/CLAUDE.md`.

### Server crate (`apps/server/src/`)

`workbench-server` (lib + bin): axum control plane, **no tauri**. Module map (routes, chat sessions, workspace service, attention feed, auth): `apps/server/CLAUDE.md`, which loads when you work in `apps/server`. Binds `0.0.0.0` with a required token over plaintext HTTP, so keep it on a private network (Tailscale). CORS allows any origin only because auth is a bearer header, never a cookie.

### Frontend IPC & transport abstraction

Control-plane stores call `invoke`/`listen` imported from **`$lib/transport`** (not `@tauri-apps/api` directly). That module holds the active `ControlPlaneTransport` (`@workbench/transport`): `createTauriTransport()` (default, local IPC) or `createHttpTransport()` (remote server). The shims keep Tauri-compatible signatures so call sites are unchanged. xterm panes talk to the loopback server's terminal WS; **native (macOS) terminal IO**, native dialogs, window/menu, and hook/terminal events stay on **direct `@tauri-apps/api`** — desktop-local, never routed remotely. `transport().capabilities.terminalIO` feature-detects local vs remote. `HttpTransport` and `agentClient` requests run under `withTimeout` (`@workbench/transport`; a timer + `AbortController`, since macOS 10.15 WebKit lacks `AbortSignal.timeout`; 10s default; routes that wait server-side get more: chat starts 90s, worktree add/remove 120s, usage 60s), so a stalled server can't pile requests up in the WebView's connection pool. `HttpTransport.subscribe` is a no-op (the server has no stream for those events); the server's one event stream is the SSE `GET /events/workspace`, which both apps follow through `subscribeWorkspace`.

`@workbench/transport` is the only place `@tauri-apps/api` may be imported among shared packages (in `tauri.ts`, an optional peer dep). Events from Rust→frontend: `terminal:data`, `terminal:activity`, `terminal:exit` (native terminals); `project:refresh-requested`, `codex:notify`, `agent:attention`.

### Frontend structure

**Stores** (`src/lib/stores/`): Context-based (`createContext` pairs in `context.ts`). Classes with `$state` runes. App.svelte creates instances and sets context sequentially; children use `getXxxStore()` getters. Stores created later in the sequence can call `getXxxStore()` in field initializers instead of receiving constructor params — avoids argument drilling.

**Features** (`src/lib/features/`):

- `projects/` — Sidebar, project dialog, project manager
- `workspaces/` — Workspace tabs, landing page
- `terminal/` — Terminal tabs, grid layout, terminal pane (xterm.js, attach-only), `PaneState` (starting / trust / exited + Restart)
- `claude/` — Session resume menu
- `chat/` — Chat view of a Claude or Codex pane (`SessionChat` hosting `@workbench/chat-ui`; Terminal | Chat toggle in `TerminalGrid`). `AgentChat` only attaches by id; starting and ending are workspace commands. Assistant text renders as plain text, never `{@html}`. Details (reconnect, drift diagnostics, attachments, rewind, tasks, artifacts): `docs/CHAT.md` §Chat view.
- `worktrees/` — Worktree creation dialog, worktree manager
- `instances/` — Local/remote instance switcher (see Gotchas)
- `projects/` sidebar layout: project row → branch tree (main checkout first, then worktrees), sessions nested under the branch they run on; row actions show on hover. Settings and collapse live only in the `ActivityRail`.
- `chrome/` — `ActivityRail`, `StatusBar`
- `agent-actions/` — Agent actions menu
- `sidebar/` — Tabbed right sidebar: `git/` (status, branches, log, stash) | `github/` (PRs, runs, checks) | `scripts/` (root `package.json` install + scripts, each run in a new terminal tab via `runTaskInWorkspace`) | `trello/` (boards)

**Manager stores** (`src/lib/features/*/`): `ProjectManagerStore` and `WorktreeManagerStore` own dialog UI state and multi-step workflows (picker → dialog → validate → save). Data stores handle CRUD; manager stores orchestrate UI flows. Both are in context and use `ConfirmAction<T>` from `$lib/utils/confirm-action.svelte.ts` for confirm-before-delete flows.

**Components** (`src/lib/components/`):

- `ConfirmDialog`, `EmptyState`, `UpdateDialog`, `IntegrationApprovalDialog`
- `settings/` — rendered in a separate OS window (`utils/settings-window.ts`; `index.html?view=settings`, mounted by `main.ts`). `SettingsContent` is the shell (nav, page header, scope switch, Save footer); `settings-pages.ts` is the page registry (nav groups, titles, which store a page saves to — `immediate` pages like Remote access have no Save). One component per page (`SettingsGeneral`, `SettingsClaudeSessions`, `SettingsCodexSessions`, `SettingsServerMode`, `SettingsPermissions`, `SettingsBashSandbox`, …), built from `SettingsSection` (titled card) + `SettingsRow` (label/description left, compact control right, `stack` for wide controls); `SettingsToggle`/`SettingsSelect` wrap `SettingsRow`; `SettingsToggle` is controlled (a function binding), so a change its `onCheckedChange` refuses or fails springs back. Workbench-owned launch settings (`--permission-mode`, sandbox runtime, Codex `approval_policy`/`sandbox_mode`) live on the Sessions pages; the `settings.json` pages edit Claude Code's own files.
- shadcn primitives live in `@workbench/ui`, not here

**Types**: `src/types/workbench.ts`, `src/types/claude-settings.ts` (typed settings with union literals for enums)

### Path aliases (in `apps/desktop/vite.config.ts`)

Aliases live in `apps/desktop/vite.config.ts` and `vitest.config.ts`. `$types` points at `../../packages/types/src` (the `@workbench/types` package), so `$types/workbench` imports work unchanged. Cross-package imports use the package name, not `$`-aliases.

### Styling

Tailwind CSS v4 via `@tailwindcss/vite`. shadcn-svelte components (`components.json`, base color: slate). Light, dark or system theme, per device: `themePrefs` (`@workbench/chat-ui` `theme-prefs.svelte.ts`, localStorage `workbench.theme`, default dark) puts `.dark` and `color-scheme` on the root: an inline script in each `index.html` for the first frame, then `themePrefs.follow()` in each `main.ts` (desktop also sets the native titlebar with `setTheme`). Desktop: Settings → Appearance; phone: its Settings sheet. Every `--wb-*` token and accent preset has a light value (`:root`, `:root:not(.dark)[data-accent]`), so new chrome must use tokens, never `white/black` utilities. Terminals take `TERMINAL_PALETTES[theme]`: xterm via `options.theme`, native SwiftTerm panes via a palette string (`nativeColors`) given to `swift_term_create` and `swift_term_set_colors` on change.

- Pro chrome tokens: `--wb-*` CSS vars in `packages/theme/theme.css` (`bg`/`panel`/`panel2`/`rail`/`ink`/`hair` + session colors `claude`/`codex`/`shell`/`ok`/`warn`/`err`), exposed as Tailwind utilities (`bg-wb-panel`, `text-wb-claude`). Use these for new chrome instead of shadcn surface tokens (keeps dialogs/inputs unbroken).
- Accent is theme-selectable: `:root[data-accent='violet|tideline|ember|moss|iris']` presets in `theme.css` drive `--wb-accent` + shadcn `--primary`; the attribute is set from `workbenchSettingsStore.accentColor`. Add new presets in `theme.css` AND the swatch list in `SettingsGeneral.svelte`.
- Window chrome components live in `src/lib/features/chrome/` (`ActivityRail` 44px left rail, `StatusBar` 22px bottom). App uses the native titlebar (`decorations: true`) — no custom traffic-light bar.
- The theme is synced to claude.ai/design as a tokens-only design system (Svelte components can't sync; Claude Design renders React). Changing tokens or `packages/ui` class strings means re-running `/design-sync`; `.design-sync/NOTES.md` lists what drifts.

### Terminal persistence

All TerminalGrids render simultaneously, hidden via `class:hidden` when inactive (keeps xterm.js mounted and PTY alive). The `active` prop triggers `fitAddon.fit()` via `$effect` + `requestAnimationFrame` (ResizeObserver doesn't fire on `display:none`).

**PTY IO never blocks a shared thread.** Each terminal writes on its own thread from a bounded input queue; native terminals queue keystrokes and pump output once per 33 ms frame; every server WS send goes through `state::ws_send`/`ws_close` with a deadline. Details: `docs/TERMINALS.md` §PTY IO.

**Workspaces are the server's.** The workspace → tab → pane model lives in the embedded server (`WorkspaceService`, `docs/WORKSPACE_MODEL.md`); desktop and phone render its snapshot (`GET /events/workspace`), and every change is one `workspaceCommand`. Nothing in the desktop creates a process: panes attach to `terminalId` / `sessionId`. The server allows ONE terminal attacher: a new attach sends `takeover` and the old pane shows "Take control" (never auto-reattach). Details: `docs/TERMINALS.md` §Workspace rendering.

### Claude CLI integration

- Every Claude pane gets its session UUID from core `ops` at `newSession`, and the server builds its command (`claude_launch`, `--resume` when `agent::claude_history_exists`, else `--session-id`; an agent action's `prompt` is sent with exactly one spawn). Codex TUI commands come from core `codex_launch` and the saved Workbench settings (`-c approval_policy=…` / `-c sandbox_mode=…` keys, `default` writes nothing).
- Commands typed into shell (not executed directly) — CLI errors don't trigger `terminal:exit`.
- Session data: `~/.claude/projects/<encoded-path>/<session-id>.jsonl` (path encoding: `/` → `-`)
- JSONL format: JSON objects with `type` ("user"/"assistant"), `message.content[]`, `sessionId`, `timestamp`. First user message = session label.
- A pane's title, busy, waiting and session id come from its runtime in the workspace snapshot (`ClaudeSessionStore.panesInProgress`/`panesAwaitingInput` derive from it; an AI tab shows its title as its label). A Codex TUI's busy is its terminal's output activity, on the server; its tab label is its thread's first message, saved with a `rename` (`codex:notify` → session discovery). JSONL discovery is on-demand for resume/history.
- **Notifications ("needs you") are event-driven:** `AgentSession` publishes transitions to `AgentManager.attention` (`attention_feed.rs`); the desktop gets `agent:attention`, Android long-polls `GET /agent/attention?cursor=…`. No session polling. Details: `docs/CHAT.md` §Notifications.
- Codex session ids come from the CLI and the server folds them in (`sessionAttached`); a pane follows its `claude` onto another session (`/resume` in the TUI) or a `/clear` re-key the same way.
- **Multiple Claude accounts** (`workbench_core::claude_accounts`): each extra account is a `CLAUDE_CONFIG_DIR`. Only the host picks a launch's account (`claude_accounts::for_launch`); clients send an id, never a path, and an unknown id is an error. A mid-chat switch moves (never copies) the session JSONL. Details (resolution order, plan usage, models cache): `docs/CHAT.md` §Accounts.
- **Sandbox runtime** (opt-in, `sandboxRuntimeEnabled`): wraps every Claude command as `npx --yes @anthropic-ai/sandbox-runtime@0.0.76 --settings <file> -- claude …`, chat included (a Claude chat is a terminal `claude`). Never Codex, never Windows. The `--` is required and the npm version is pinned (not srt's self-reported one). Settings file `~/.workbench/sandbox-runtime.json` comes from `workbench_core::sandbox_runtime::refresh`, which every Claude launch runs (so a standalone server writes its own; the desktop only supplies its hook-bridge address via `set_hook_socket`); `~/.claude` is a write **allowlist** and `projects` in it is load-bearing. Every control-plane listener requires a token because of this. **Read `docs/SANDBOX_RUNTIME.md` before touching any of it** — it records the path, allowlist and residual-risk decisions.

### Git worktree support

- Workspaces have optional `worktreePath` and `branch`. Main workspaces resolve branch from `gitStore.branchByProject` at read time (no sync needed). Worktree workspaces get `branch` set at creation time. When `worktreePath` is set, terminals and Claude sessions use it as cwd.
- `effectivePath(ws)` returns `ws.worktreePath ?? ws.projectPath` — use everywhere a workspace cwd is needed.
- Multiple workspaces share the same `projectPath` (one main + N worktrees). `getByProjectPath()` returns only main workspace.
- Sidebar nests worktrees under parent project. Git state lives in `GitStore` (`branchByProject`, `worktreesByProject`), accessed via context.
- `closeAllForProject()` closes main + all worktree workspaces.
- Worktree location strategy (workbench setting): `"sibling"` creates `<parent>/<repo>-<branch>`, `"inside"` creates `<repo>/.worktrees/<branch>` (auto-adds to `.gitignore`); `/` in the branch becomes `-`, and a taken folder gets `-2`, `-3`, ….
- `WorkbenchSettingsStore` manages `~/.workbench/settings.json` — single-scope store (vs multi-scope `ClaudeSettingsStore`).

### GitHub CI integration

- `GitHubStore` polls project status (PRs, workflow runs, PR checks) on 90s cycle, 15s fast-poll when pending. A failed PR listing (`github::project_status` → `false`) keeps the PR state the poller saw last and emits nothing over it (backing off to the slow interval), so a network blip neither empties the sidebar nor loses a merge transition.
- Polling is scoped to projects with active Claude/Codex sessions (`activeSessionsByProject`), not all open workspaces.
- `get_project_status()` batches all data in one IPC call: PRs, workflow runs grouped by branch, and pre-fetched PR checks for open PRs.
- `gh run list` returns `databaseId` (not `id`) — use `#[serde(alias = "databaseId")]` for deserialization.
- `gh repo list --json` valid fields include `name,nameWithOwner,description,isPrivate,isFork,url,sshUrl` — `httpCloneUrl` does **not** exist and causes `gh` to exit with an error. The `url` (web URL) also works as an HTTP clone URL.
- `gh pr checks` returns empty string `""` for `completedAt` on pending checks — validate parsed dates before computing durations.

### Observability (Sentry)

- **Self-hosted Sentry** at `sentry.starkeydigital.com`. Manage via the `sentry` skill / `sentry-admin` CLI.
  - **Org:** `starkey-digital`
  - **Project:** `workbench` (numeric id `20`)
  - Example: `sentry-admin issues starkey-digital -p workbench`
- **Errors only** on both ends (no tracing — sample rate `0`). Same DSN/project for frontend + backend.
- **Frontend:** `@sentry/svelte` via `@workbench/telemetry` (`packages/telemetry`, the one place both webviews' Sentry code lives); prod-gated; chat-ui never imports Sentry. Details: `docs/OBSERVABILITY.md` §Frontend.
- **Frontend log file:** desktop webview code logs through `$lib/log` (`log.warn('Target', 'message', detail)`), never bare `console.warn/error`: it prints to the console and sends the line to the `log_frontend` command (skipped under tests), which writes it under `frontend::<target>` to `workbench.log` (one line, control characters flattened, 2000 chars, 20 lines/s with a dropped count; `observability::frontend`). Those lines never go to Sentry from Rust (the webview's own Sentry has them). Never log tokens, URLs or prompt text. Not `tauri-plugin-log`: it installs its own global logger, which `observability.rs` already owns. Mobile has no such file: breadcrumbs only.
- **Close Sentry issues as they're fixed.** A PR that fixes a Sentry issue names it in its body on a line of its own starting `Fixes WORKBENCH-X` (one line per issue; `Closes`/`Resolves` work too; mid-sentence mentions don't count); Kodiak's squash keeps the body in the commit, and the release workflow's `publish` job resolves every issue named since the previous tag once the release is out, as resolved in that release (`workbench@<version>`), so only an event from that release or later reopens it as a regression. Before opening a fix PR, look the error up in Sentry (`sentry-admin issues starkey-digital -p workbench`) and name the issue. Something fixed outside a release (stale, not ours, already gone): resolve or ignore it by hand with `sentry-admin resolve|ignore starkey-digital WORKBENCH-X`, so the open list only holds live problems.
- **Backend logging:** `observability::init` installs a global `log` logger (stderr + `<config dir>/logs/workbench.log`, wrapped by Sentry: `error!` → event, `warn!`/`info!` → breadcrumb). Use `log::warn!`/`log::error!`, **not** `eprintln!`; never log text, titles or tokens. Details (watchdog, accept loop, heartbeats, fd limit): `docs/OBSERVABILITY.md` §Backend logging.
- **More:** extended diagnostics, backend panics, mobile, source maps and prod gating: `docs/OBSERVABILITY.md`.

### Svelte 5 reactivity

**`$derived` is king** — use for all computed state. `$derived.by` for complex expressions. Writable `$derived` (Svelte 5.25+) for computed values that can be temporarily overridden.

**`$effect` is an escape hatch** — only for external side effects like network requests, DOM manipulation, and analytics. Per the Svelte docs: "In general, `$effect` is best considered something of an escape hatch — useful for things like analytics and direct DOM manipulation — rather than a tool you should use frequently. In particular, avoid using it to synchronise state."

**Never use `$effect` to sync state.** Don't read reactive values in an effect and write them to other reactive state. Instead, use `$derived` or `$derived.by`. If you need a computed value that can be reassigned (optimistic UI), use writable `$derived` instead of an effect.

**`runed` is available** — for unavoidable side effects prefer `watch(() => dep, (v) => {…})` (tracked dependency getter, untracked callback) over `$effect`. Don't refactor pre-existing `$effect`s unless asked.

**Cross-component reactive state:** Derive in the store (where the data lives), not via effects in components. If multiple components need the same derived value, put the `$derived` on the store class, not in each component.

**Cross-store derived state:** Put the `$derived` on the store that owns the concept (e.g., `activeBranches` on `GitHubStore`), not as an `$effect` in a component that reads one store and writes to another.

## Gotchas

### Monorepo

- **Pure logic goes in `workbench-core`, not desktop.** When adding shared logic (git, config, sessions, settings), put it in `crates/workbench-core` and (if it needs a Tauri command) add a thin wrapper in `apps/desktop/src-tauri/src/commands.rs`. Never add `tauri` to core or server; re-export new core modules at the desktop crate root in `lib.rs`.
- **Adding a server endpoint** = add the route in `apps/server/src/routes.rs` calling a `workbench_core` fn, reuse a `types.rs` struct for the body/response (camelCase so it matches frontend), and (if the desktop/mobile client should call it) add the command name to `ControlPlaneCommands` + the route mapping in `packages/transport/src/http.ts`. Exception: the chat-session routes (`/agent…`) have no Tauri IPC twin and pair with a WebSocket, so both apps reach them through `agentClient` in `@workbench/chat-ui`; add new agent routes there.
- **Control-plane stores import `invoke`/`listen` from `$lib/transport`**, not `@tauri-apps/api`. Native terminal IO / dialogs / window APIs stay on direct `@tauri-apps/api`; xterm IO goes over the server's terminal WS. Never route terminal IO through the transport.
- `@tauri-apps/api` must not be imported in `packages/*` except `transport/src/tauri.ts` (optional peer dep) — keeps shared packages buildable by the mobile app.
- bun workspaces nest `@workbench/*` symlinks under the **consumer's** `node_modules` (e.g. `apps/desktop/node_modules/@workbench/transport`), not hoisted to root. A new workspace dep needs declaring in the consumer's `package.json` (`"workspace:*"`) + `bun install`.
- `TauriTransport` uses **static** imports of `@tauri-apps/api` (not dynamic) so call timing/arg-shape match what stores/tests expect; it omits the args object when undefined.
- UI primitives import from `@workbench/ui/<component>` and `cn` from `@workbench/ui` (NOT `$lib/components/ui` / `$lib/utils` anymore). `components.json` (shadcn CLI) aliases still say `$lib/...`; if you `shadcn add` a component it lands in the app — move it into `packages/ui/src/ui/` and fix its `$lib/utils` import to `../../utils`.
- `WORKBENCH_CLAUDE_BIN` (default `claude`) names the CLI that chat and terminal launches run (`claude_launch`) — set it to a fake script in tests, or to point at an alternative CLI.
- **Left sidebar is instance-aware** (`$features/instances/`): `InstancesStore` holds the implicit local instance ("This Mac") plus persisted remote servers (localStorage), each remote owning a `ControlPlaneStore` (HttpTransport) + health-polled status. `InstanceSwitcher` (dropdown in the sidebar header) sets `activeId`; `App.svelte` renders the rich terminal-coupled `ProjectSidebar` when local, else `RemoteInstanceSidebar` (sidebar chrome + shared `ControlPlaneSidebar`). `ConnectInstanceDialog` adds a server (name/URL/token + `/health` test). So: control-plane features that should work on remote instances belong in the shared `ControlPlaneSidebar`, not `ProjectSidebar`.
- **Server-mode token UX** lives in `components/settings/SettingsServerMode.svelte`: first enable calls `WorkbenchSettingsStore.ensureServerToken()` (Rust `rotate_server_token`), the token is shown masked with reveal/copy, and Regenerate (`ConfirmDialog`) calls `rotate_server_token` so old clients are cut off. The mobile app refuses to connect without a token and verifies it on `/remote/terminals` (`/health` is unauthenticated).
- **QR pairing** (`workbench://pair?v=1&url=…&token=…`, only via `buildPairingUri`/`parsePairingUri` in `@workbench/transport`) and the **Android in-app updater** (`apk-updater` plugin) have many platform traps (custom-scheme parsing, scanner cancel never settling, background activity starts). **Read `docs/MOBILE.md` before changing either.**
- `ProjectConfig.startupCommand` / `tasks` are legacy: no UI edits or runs them (the Scripts tab replaced tasks), but Rust keeps them and `ProjectManagerStore.save` spreads the saved project so an edit doesn't drop them from `projects.json`.
- Adding a `WorkbenchSettings` field touches 5 places: Rust `crates/workbench-core/src/types.rs` (field + `default_*` fn + `Default` impl), TS `apps/desktop/src/types/workbench.ts` interface, store `workbench-settings.svelte.ts` (field decl + `load()` + `toSettings()`), and `workbench-settings.test.svelte.ts` — two exact `toHaveBeenCalledWith('save_workbench_settings', …)` assertions list every field, so both break until updated.
- **A desktop command that blocks (git, gh, file or process work) is `#[tauri::command] pub async fn` wrapping its body in `crate::blocking(move || …).await`**, never `#[tauri::command(async)]` on a sync fn: Tauri runs those on its runtime's workers, so a burst held up every other command and event. The embedded server listeners run on their own runtime (`server_control::server_runtime`), so nothing a command does can starve the phone's or the panes' connections.
- Rust modules use `anyhow::Result` internally. `commands.rs` converts to `Result<_, String>` for Tauri IPC via `.map_err(|e| e.to_string())`.
- Config/settings writes use `paths::atomic_write()` (temp file + rename) to prevent corruption.
- **`window.confirm` is broken under Tauri and cannot be fixed with a capability.** `tauri-plugin-dialog` injects an init script into every webview that replaces `window.confirm` with an async `invoke('plugin:dialog|confirm')` — but the plugin only registers `open`/`save`/`message`, so that command does not exist and no permission grants it (`dialog:allow-confirm` is a deprecated alias for `allow-message`). Any bare `confirm()` therefore rejects with "not allowed by ACL", and its return value is a Promise (always truthy) even when it doesn't. Never call `confirm()`; use `ConfirmDialog`/`ConfirmAction`. This is why `TerminalPane` must pass an explicit `linkHandler` to `new Terminal()` — xterm core's OscLinkProvider falls back to `confirm()` + `window.open()` for OSC 8 hyperlinks, which silently swallowed every such link click.
- **Never spawn a child process with `Command::new` — use `workbench_core::shell::command()`.** Release builds link `windows_subsystem = "windows"`, so the app owns no console and Windows pops a visible blank console window for every console child (`git`, `gh`, `taskkill`, …). `shell::command` sets `CREATE_NO_WINDOW`. Same module owns `default_shell()` / `login_args()` / `inherited_env()` — the per-platform shell setup shared by the desktop's native terminals and the server's `TerminalManager` (`-l` is Unix-only; passing it to `cmd.exe`/`powershell.exe` fails the spawn). **No `pre_exec`, ever, and no `fork`:** std forks instead of `posix_spawn` when a command has a `pre_exec` (or uid/gid/groups/chroot, or a bare program with PATH changed — see `shell::tool`), and a fork in this many-threaded app holds macOS's allocator locks long enough to freeze every thread, embedded servers included. So never call portable-pty's `slave.spawn_command` (its `pre_exec` setsids) — use `workbench_core::pty::spawn` — and never `open::that_detached` (it setsids in a `pre_exec`) outside Windows: links go through `shell::open_url` (`/usr/bin/open` / `xdg-open` in its own group via `posix_spawn`; http(s), mailto and tel only; Linux tries `xdg-open`, `gio open`, `gnome-open`, `kde-open`, `wslview`), from the frontend via the `open_url` command (`$lib/utils/open-url`). `tauri-plugin-shell` was removed for this; don't re-add it.
- Mutex locks use `.unwrap_or_else(|e| e.into_inner())` to recover from poisoning.
- `tauri.conf.json` must have `beforeDevCommand` set or `tauri dev` hangs waiting for Vite.
- `.prettierignore` (at root) excludes lockfiles, `.claude/`, build output, generated Tauri dirs and `*.rs`. `tailwindStylesheet` in `.prettierrc` points at `./apps/desktop/src/app.css`. eslint config reads `../../.gitignore`.
- Rust types use `#[serde(rename_all = "camelCase")]` to match frontend field names.
- Store constructors run at import time. Side effects like `listen()` are fine — Tauri event system is available immediately.
- `ConfirmDialog` delegates close behavior to the bound `ConfirmAction.open` — don't auto-close on confirm (allows async error display + retry).
- Svelte 5 `$state` with union types: use `$state<'a' | 'b'>('a')` not `let x: 'a' | 'b' = $state('a')` — the latter narrows to the initial value's literal type.
- `$derived` on class fields is lazy — the callback runs on first read, not at field initialization time. Safe to reference constructor params that are set after field initializers run.
- **Context init order in App.svelte is load-bearing.** Stores that call `getXxxStore()` in field initializers will crash at runtime (`missing_context`) if the dependency hasn't been `setXxxStore()`'d yet. `GitHubStore` depends on `WorkspaceStore`, `GitStore`, `ClaudeSessionStore`, `ProjectStore`. Always verify the full dependency graph before reordering.
- **Never call `getXxxStore()` from runtime methods** (async handlers, callbacks, non-init code paths). It uses `hasContext()` which only works during component initialisation → `lifecycle_outside_component` error. Instead, cache the store as a field initializer (`private settingsStore = getWorkbenchSettingsStore()`) and use `this.settingsStore` in methods.
- When making a sync store method async, grep for all callers in `*.test.svelte.ts` — tests that don't `await` the call silently pass without verifying behavior.
- When gating a code path (e.g., adding approval before session launch), trace **all** callers of the underlying method — sidebar context menus, landing pages, terminal tabs, etc. may bypass the new gate.
- Dialogs using `bind:open` let X/Escape/outside-click close without resolving pending promises. Use `onOpenChange` to intercept dismissal when the dialog controls async flow.
- Every frontend `invoke('command_name')` call needs three things: (1) the `async fn` in a `_commands.rs` file, (2) registration in `lib.rs`'s `invoke_handler`, and (3) matching `#[serde(rename_all = "camelCase")]` types. Missing any one silently fails at runtime.
- Per-project config (like `TrelloProjectConfig`) must be loaded at startup in `App.svelte`'s `onMount`, not only from settings UI. Otherwise features depending on that config (sidebar panels, merge automation) won't work until settings is opened.
- Dialog pre-fill from props: `$state(prop)` captures only the initial value, and bits-ui calls `onOpenChange` only on user interaction, never when `open` is set from code. A dialog its store opens (e.g. `WorktreeDialog`) is remounted per open with `{#key store.dialogSession}` and seeds its `$state` once from the props; one the user opens can apply them in `onOpenChange`.
- `ScrollArea` internal viewport uses `size-full` (`h-full`) — `max-h-N` on the root doesn't constrain it. Use a fixed `h-N` for scroll areas that must stay bounded.
