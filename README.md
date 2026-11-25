# agy-hud

**See what Antigravity is doing before you have to ask.**

agy-hud is an Antigravity-native statusline that keeps context pressure,
model-matched quota remaining, reset time, agent state, tools, subagents, and
Plan progress visible under your prompt—in any terminal, with no separate
window.

[![Version](https://img.shields.io/badge/version-0.2.1-7c3aed)](https://github.com/Franz0x2a/agy-hud/releases)
[![Antigravity CLI](https://img.shields.io/badge/Antigravity_CLI-1.0.2%E2%80%931.5%2B-4285f4)](https://antigravity.google/docs/cli/statusline/)
[![CI](https://github.com/Franz0x2a/agy-hud/actions/workflows/ci.yml/badge.svg)](https://github.com/Franz0x2a/agy-hud/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Franz0x2a/agy-hud)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Franz0x2a/agy-hud)](https://github.com/Franz0x2a/agy-hud/stargazers)

> English · [简体中文](README.zh.md)

```text
AGY · Gemini 4 Neon (XHigh) · READY · planning · agy-hud git:(main*)
Context ░░░░░░░░░░ 1.83% (14k/1.0M) │ Quota gemini 5h ██░░░░░░░░ Remaining 82% (resets in 2h 30m) | gemini weekly █░░░░░░░░░ Remaining 91% (resets in 5d)
◐ grep_search: normalizeStatusPayload │ ✓ run_command ×2
▸ Render native quota (2/5)
```

## Why agy-hud

- **Native context truth** — uses Antigravity's own context percentage and
  reported window size instead of guessing, formatting fractional percentages
  cleanly to at most 2 decimal places (stripping `.00` on integers, e.g.
  `1.83%` instead of raw floats like `1.82952880859375%`).
- **Model-matched quota at a glance** — automatically matches Antigravity's
  quota buckets to the active model family and variant (`gemini-5h` /
  `gemini-weekly` / `gemini-pro-*` / `gemini-flash-*` / `gemini-argon-*` when
  using Gemini models; `3p-5h` / `3p-weekly` when using third-party Claude/GPT
  models), filters out `disabled: true` buckets, orders short windows (`5h`)
  before long windows (`weekly`), and shows `Remaining X%` with the reset
  countdown.
- **Live work, not stale Claude logs** — understands Antigravity planner/action
  events, tool errors, `invoke_subagent`, Skills, and MCP calls.
- **Real Plan progress** — safely reads the active conversation's `task.md`
  checkboxes.
- **Modern CLI state** — supports agent state, execution mode, git/jj/hg VCS,
  sandbox, artifacts, task/input counts, confirmations, Vim mode, plan tier,
  account, CLI version, native cost, and subagents.
- **Fast and local** — no runtime dependencies, network calls, analytics, or
  telemetry. Input and artifact reads are bounded; transcript reads are cached
  and limited to the recent 2 MiB tail. Long sessions keep their real start
  time and hide cumulative tokens when a truthful full-session total is not
  available.

## Install

Requirements: Antigravity CLI and Node.js 18 or newer.

Install the native plugin from your shell:

```bash
agy plugin install https://github.com/Franz0x2a/agy-hud
```

Then open Antigravity CLI and run:

```text
/agy-hud-setup
```

Restart Antigravity CLI after setup. The installer writes and verifies a stable
wrapper (`agy-hud-statusline.sh` on macOS/Linux or `agy-hud-statusline.cmd` on
Windows) with resolved absolute paths, so shell variable expansion and
versioned cache paths cannot break the HUD after an upgrade.

Upgrading from a pre-v2 configuration is automatic: setup saves the original as
`~/.gemini/antigravity-cli/plugins/agy-hud/config.v1.backup.json`, enables the
Essential context/quota semantics, and preserves language, colors, advanced
options, and unknown keys. Once marked v2, later reinstalls preserve your
explicit choices.

To adjust the profile, language, or layout later:

```text
/agy-hud-configure
```

## Profiles

### Essential — the default

Essential is intentionally high-signal. With no config file it enables:

- model, agent state, execution mode
- project and native branch/dirty state
- context percentage (up to 2 decimal places) and token count
- model-matched quota remaining (`5h` / `weekly`) and reset countdown
- tools, subagents, and Plan progress when active

Before the first model response, context renders as `-- / 1.0M · awaiting first
response` instead of claiming that the initialized session uses exactly 0%.

### Full — every current native field

Choose **Full** in `/agy-hud-configure`, or merge this into
`~/.gemini/antigravity-cli/plugins/agy-hud/config.json`:

```json
{
  "display": {
    "showCost": true,
    "showDuration": true,
    "showSessionTokens": true,
    "showSandbox": true,
    "showArtifacts": true,
    "showTaskCount": true,
    "showPendingInput": true,
    "showToolConfirmation": true,
    "showVimMode": true,
    "showPlanTier": true,
    "showAccount": true,
    "showAntigravityVersion": true,
    "showSkills": true,
    "showMcpActivity": true
  }
}
```

`showAccount` is off by default because it prints your account email—leave it
off while streaming or screen sharing.

### Minimal

Minimal keeps only model, project/VCS, and context. It also skips transcript,
artifact, and legacy config-count reads when those surfaces are disabled.

## Native field coverage

| Antigravity data | Essential | Full | Source |
|---|:---:|:---:|---|
| Model, workspace, VCS | ✓ | ✓ | Native status payload |
| Context size, tokens, 2-decimal usage % | ✓ | ✓ | Native status payload |
| Model-matched quota remaining & reset | ✓ | ✓ | Native status payload |
| Agent state and execution mode | ✓ | ✓ | Native status payload |
| Tools, errors, subagents | When active | ✓ | Transcript + native count |
| Plan progress | When active | ✓ | Conversation `task.md` |
| Native cost | — | ✓ | Native status payload |
| Sandbox and network access | — | ✓ | Native status payload |
| Artifact, task, pending-input counts | — | ✓ | Native status payload |
| Tool confirmation and Vim mode | — | ✓ | Native status payload |
| Plan tier, account, CLI version | — | ✓ | Native status payload |
| Skills and MCP activity | — | ✓ | Transcript events |

Unknown future fields are ignored safely. Optional fields appear only when the
running Antigravity version supplies them, so the same build works across older
and newer releases without brittle version checks.

## Configuration

The guided command is the easiest path:

```text
/agy-hud-configure
```

Manual configuration lives at (creating the file is optional; missing keys fall
back to defaults in [`src/config.ts`](src/config.ts)):

```text
~/.gemini/antigravity-cli/plugins/agy-hud/config.json
```

(Or `<ANTIGRAVITY_CONFIG_DIR>/plugins/agy-hud/config.json` when
`ANTIGRAVITY_CONFIG_DIR` is set.)

Example `config.json`:

```json
{
  "language": "en",
  "lineLayout": "expanded",
  "display": {
    "contextValue": "both",
    "showUsage": true,
    "usageBarEnabled": true,
    "timeFormat": "relative",
    "showResetLabel": true
  }
}
```

Common options:

| Option | Default | Purpose |
|---|---:|---|
| `language` | `en` | `en`, `zh`, or `zh-Hans` |
| `lineLayout` | `expanded` | Multi-line `expanded` or single-line `compact` |
| `display.contextValue` | `both` | `percent`, `tokens`, `remaining`, or `both` (percentages formatted to at most 2 decimals) |
| `display.showUsage` | `true` | Show or hide quota/usage display |
| `display.usageBarEnabled` | `true` | Show or hide quota bar (bar fills by used ratio; text shows remaining %) |
| `display.usageValue` | `remaining` | `remaining` or `percent` for legacy rate-limit payloads (native Antigravity quota always shows `Remaining X%`) |
| `display.showTools` | `true` | Recent and running tools |
| `display.showAgents` | `true` | Running/recent subagents |
| `display.showTodos` | `true` | Current Plan task and progress |
| `display.timeFormat` | `relative` | `relative`, `absolute`, or `both` reset time |
| `display.showResetLabel` | `true` | Show or hide the `resets in` / `resets` label |
| `gitStatus.showAheadBehind` | `false` | Adds local Git lookup for remote divergence |
| `gitStatus.showFileStats` | `false` | Adds local Git lookup for changed files |
| `maxWidth` / `forceMaxWidth` | `null` / `false` | Width fallback or hard override |

The complete typed option list and defaults are in
[`src/config.ts`](src/config.ts). Existing `showClaudeCodeVersion` and
`CLAUDE_CONFIG_DIR` settings remain accepted as migration aliases, including a
fallback to the old `plugins/claude-hud/config.json` location.

### Stacking with Antigravity's built-in statusline

Antigravity supports `statusLine.stack_with_default` in
`~/.gemini/antigravity-cli/settings.json`. Set it to `true` if you want agy-hud
rendered below the built-in statusline instead of replacing it:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.gemini/antigravity-cli/agy-hud-statusline.sh",
    "stack_with_default": true
  }
}
```

## How it works

```text
Antigravity status JSON ─┐
Transcript JSONL ────────┼─> normalize ─> model-match & format ─> terminal HUD
Conversation task.md ────┘
```

The native status payload is authoritative for context, quota, VCS, cost, and
runtime state. Transcript and artifact data only enrich live activity and Plan
progress. Nothing is uploaded.

## Troubleshooting

**HUD does not appear**

1. Confirm `node --version` is 18+.
2. Run `/agy-hud-setup` again.
3. Check that `settings.json` points to the generated absolute
   `agy-hud-statusline.sh` or `agy-hud-statusline.cmd` wrapper.
4. Fully restart Antigravity CLI.

**Quota shows `3p 5h` / `3p weekly` or looks different from expectations**

- `3p` stands for **third-party models** (such as Claude / GPT), tracked
  separately from Google Gemini quotas (`gemini-5h` / `gemini-weekly` /
  `gemini-pro-*` / `gemini-flash-*` / `gemini-argon-*`).
- The progress bar reflects **used** quota (`100% - remaining`), so an empty
  bar `░░░░░░░░░░ Remaining 100%` means 0% used / 100% remaining.
- agy-hud automatically selects the quota buckets matching your active model
  and skips `disabled: true` buckets. It only falls back to other available
  buckets if the current Antigravity status payload does not expose a matching
  `remaining_fraction` bucket for the active model.
- Run `/usage` (or `/quota`) in Antigravity CLI at any time to inspect the full
  official **Models & Quota** breakdown.

**Quota or a Full field is missing**

agy-hud does not invent unavailable values. Update Antigravity CLI and verify
that its current status payload exposes that field. Older releases continue to
render the fields they support.

**Old appearance remains after upgrading**

Your existing `config.json` intentionally overrides the new Essential defaults.
Run `/agy-hud-configure` and select Essential, or move the config aside to test
the new defaults.

## Development

```bash
npm install
npm test
```

The test suite covers native status payloads, 2-decimal context formatting,
model-matched quota bucket selection, disabled-bucket filtering, older
compatibility paths, transcript/activity matching, artifact isolation,
terminal-width behavior, security sanitization, and English/Chinese rendering.

## Credits

This fork builds on [lllopic/agy-hud](https://github.com/lllopic/agy-hud) (which
originally adapted [claude-hud](https://github.com/jarrodwatts/claude-hud) to
Antigravity's native status, quota, transcript, and artifact data), adding
2-decimal context percentage formatting, active-model quota bucket matching,
and disabled quota bucket filtering.

MIT licensed. Contributions and issue reports are welcome.
