---
name: claude-code-changelog
description: Review Claude Code's changelog since the CLI version Workbench was last tested against, and report what changes how the Workbench mod (plugins/workbench), the Claude launch/transcript code or the chat view interact with Claude Code — breakages to fix, and new features worth adopting. Use when asked to check the Claude Code changelog, what's new in Claude Code, whether a CLI update affects Workbench, or before bumping the tested CLI version.
---

# Claude Code changelog review

Workbench depends on Claude Code in more places than the mod. A CLI release can break any of them silently (a renamed event, a changed JSONL row, a flag that now means something else) or offer something we hand-rolled. This skill finds both.

It is read-only on code: it produces a report. Fixes are separate work, done only when asked.

## 1. Find the baseline and the range

- **Baseline:** the first line of `plugins/workbench/types/claude-code.d.ts` (`// Written by Claude Code X.Y.Z.`). That is the CLI version the mod's plugin API was last verified against. Also grep `docs/CHAT.md` and `crates/` for `CLI 2.1.` / `2.1.` mentions; those are behaviours pinned to a version.
- **Installed:** `claude --version`, if the CLI is on this machine. It is often newer than the baseline. Say so if it is.
- **Changelog:** fetch `https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md` with WebFetch (or `curl -sL`). Take every release **newer than the baseline**, up to the latest. If there are none, report that and stop.

Big ranges are fine: read every entry. Don't skim headings.

## 2. Know what we touch

Before judging entries, refresh this map from the code (it drifts). Each line is a surface plus where it lives:

- **Plugin API (the mod):** `plugins/workbench/hooks/*.ts`. List the events it subscribes to (`grep -ohE "on\('[a-zA-Z.:]+'" plugins/workbench/hooks/*`) and the `$.` APIs it calls (`grep -ohE '\$\.[a-z]+(\.[a-zA-Z]+)?' plugins/workbench/hooks/*`). Key ones: `turn.step`, `session.append`, `tool.check`, `tool.call`, `prompt.submit`, `command.run`, `session.measure`, the `classic.*` hooks, `$.prompt.submit`, `$.command.run/list`, `$.turn.abort`, `$.session.usage`, `$.tool.register`, `$.http.fetch`, `$.store`, `$.model.complete`.
- **Plugin manifest and loading:** `plugins/workbench/plugin.json`, `crates/workbench-core/src/claude_plugin.rs` (`--plugin-dir`/env wiring, `WORKBENCH_HOOK_SOCKET`).
- **Launch flags:** `crates/workbench-core/src/claude_launch.rs`: `--session-id`, `--resume`, `--resume-session-at`, `--permission-mode` (and its known modes), the sandbox-runtime wrapper, the trust-dialog detection (`shows_trust_prompt`, `TRUST_ACCEPT_KEYS`).
- **Session files:** `~/.claude/projects/<encoded>/<id>.jsonl`, read by `crates/workbench-core/src/claude_sessions.rs` and `claude_transcript/` (row `type`s, `message.content[]`, `api-request` rows and `cacheControl`, command rows `door: 'command'`, `<command-name>` / `<local-command-stdout>` tags).
- **stream-json shape the mod emits:** `claude_transcript/` parses it like `claude -p` output (`stream_event`, `system:init`, `result`, `rate_limit_event`, `can_use_tool`, `task_*`, `conversation_reset`).
- **Accounts and config:** `CLAUDE_CONFIG_DIR` per account (`claude_accounts`), `.claude.json` `mcpServers` (transfer), settings files edited by `crates/workbench-core/src/settings.rs` and the desktop settings pages (permissions, sandbox, hooks, plugins, skills).
- **Plan usage, models, plugins:** `/usage` limits, the `/config` model list, `claude plugin … --json` (`claude_plugins`).
- **Behaviours we lean on:** idle compaction timing (cache keep-warm in `agent/cache.rs`), prompt-cache TTLs, `/clear` and `/resume` re-keying, `/rewind`, AskUserQuestion and ExitPlanMode dialogs, background Bash task notifications, the folder trust dialog.

## 3. Classify every relevant entry

Skip entries that can't reach any surface above (pure TUI cosmetics, IDE-only, Bedrock-only and so on). For each one that can, decide:

- **Breaking / behaviour change:** something we rely on changed. Name the file(s) and the exact assumption it breaks. Rate it: *breaks now*, *breaks on some path*, or *harmless but stale doc*.
- **Opportunity:** a new event, API, flag, row or setting that replaces a workaround we carry, or enables a feature. Name the workaround (e.g. "the 1s `/goal` wait in `chat.ts`") or the feature, and the rough size of the change.
- **Watch:** experimental or ambiguous. Note what would confirm it.

Verify before claiming. If an entry might affect us, open the file and check the code really depends on that behaviour. Quote the line. Never report a match on keywords alone.

## 4. Report

Write the report to the scratchpad as `claude-code-changelog-<baseline>-to-<latest>.md` and give its full path. Lead with the verdict in one line: safe to bump or not, plus counts. Then:

1. **Breaking / behaviour changes**, most severe first. For each: version, the changelog line quoted, what it breaks in our code (file:line), and the fix.
2. **Opportunities**, most valuable first. For each: version, the changelog line, what it replaces or enables, where it would go, and its size (S/M/L).
3. **Watch list.**
4. **Bumping the tested version:** whether `types/claude-code.d.ts` needs regenerating (any plugin API change means yes; the `plugin-authoring` skill writes the full file) and which `CLI 2.1.x` notes in `docs/CHAT.md` / `CLAUDE.md` go stale.

Keep it scannable: one bullet per entry, no padding. Then offer to fix the breaking items or start an opportunity. Don't start without the go-ahead.
