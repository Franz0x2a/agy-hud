# agy-hud

**See what Antigravity is doing before you have to ask.**

agy-hud is an Antigravity-native statusline that keeps context pressure, quota
remaining, reset time, agent state, tools, subagents, and Plan progress visible
under your prompt—in any terminal, with no separate window.

[![Version](https://img.shields.io/badge/version-0.2.1-7c3aed)](https://github.com/lllopic/agy-hud/releases)
[![Antigravity CLI](https://img.shields.io/badge/Antigravity_CLI-1.0.2%E2%80%931.1.22%2B-4285f4)](https://antigravity.google/docs/cli/statusline/)
[![Tests](https://img.shields.io/badge/tests-619_passing-22c55e)](#development)
[![License](https://img.shields.io/github/license/lllopic/agy-hud)](LICENSE)
[![Stars](https://img.shields.io/github/stars/lllopic/agy-hud)](https://github.com/lllopic/agy-hud/stargazers)

> English · [简体中文](README.zh.md)

```text
AGY · Gemini 3.5 Pro · READY · planning · agy-hud git:(main*)
Context █░░░░░░░░░ 14.2% (84k/1.0M) │ Quota █░░░░░░░░░ Remaining 93.8% (resets in 6d 11h)
◐ grep_search: normalizeStatusPayload │ ✓ run_command ×2
▸ Render native quota (2/5)
```

## Why agy-hud

- **Native context truth** — prefers Antigravity's own decimal percentage and
  reported window size instead of guessing.
- **Quota at a glance** — shows the wording that matters: `Remaining 93.8%`,
  plus the reset countdown.
- **Live work, not stale Claude logs** — understands Antigravity planner/action
  events, tool errors, `invoke_subagent`, Skills, and MCP calls.
- **Real Plan progress** — safely reads the active conversation's `task.md`
  checkboxes.
- **Modern CLI state** — supports agent state, execution mode, git/jj/hg VCS, sandbox,
  artifacts, task/input counts, confirmations, Vim mode, plan tier, account,
  CLI version, native cost, and subagents.
- **Fast and local** — no runtime dependencies, network calls, analytics, or
  telemetry. Input and artifact reads are bounded; transcript reads are cached
  and limited to the recent 2 MiB tail. Long sessions keep their real start
  time and hide cumulative tokens when a truthful full-session total is not available.

## Install

Requirements: Antigravity CLI and Node.js 18 or newer.

Install the native plugin from your shell:

```bash
agy plugin install https://github.com/lllopic/agy-hud
```

Then open Antigravity CLI and run:

```text
/agy-hud-setup
```

Restart Antigravity CLI after setup. The installer writes and verifies a stable
wrapper with resolved absolute paths, so shell variable expansion and versioned
cache paths cannot break the HUD after an upgrade.

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
- context percentage and token count
- quota remaining and reset countdown
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
| Context size, tokens, decimal usage | ✓ | ✓ | Native status payload |
| Quota remaining and reset | ✓ | ✓ | Native status payload |
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

Manual configuration lives at:

```text
~/.gemini/antigravity-cli/plugins/agy-hud/config.json
```

Useful options:

| Option | Default | Purpose |
|---|---:|---|
| `language` | `en` | `en`, `zh`, or `zh-Hans` |
| `lineLayout` | `expanded` | `expanded` or `compact` |
| `display.contextValue` | `both` | `percent`, `tokens`, `remaining`, or `both` |
| `display.usageValue` | `remaining` | Quota/rate-limit value semantics |
| `display.showTools` | `true` | Recent and running tools |
| `display.showAgents` | `true` | Running/recent subagents |
| `display.showTodos` | `true` | Current Plan task and progress |
| `display.timeFormat` | `relative` | `relative`, `absolute`, or `both` reset time |
| `gitStatus.showAheadBehind` | `false` | Adds local Git lookup for remote divergence |
| `gitStatus.showFileStats` | `false` | Adds local Git lookup for changed files |
| `maxWidth` / `forceMaxWidth` | `null` / `false` | Width fallback or hard override |

The complete typed option list and defaults are in
[`src/config.ts`](src/config.ts). Existing `showClaudeCodeVersion` and
`CLAUDE_CONFIG_DIR` settings remain accepted as migration aliases, including a
fallback to the old `plugins/claude-hud/config.json` location.

Antigravity also supports `statusLine.stack_with_default`. Set it to `true` in
the CLI `settings.json` if you want agy-hud stacked with Antigravity's built-in
statusline.

## How it works

```text
Antigravity status JSON ─┐
Transcript JSONL ────────┼─> normalize ─> RenderContext ─> terminal HUD
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
   `agy-hud-statusline.sh` or `.cmd` wrapper.
4. Fully restart Antigravity CLI.

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

The test suite covers native 1.1.22-style payloads, older compatibility paths,
transcript/activity matching, artifact isolation, terminal-width behavior,
security sanitization, and English/Chinese rendering.

## Credits

agy-hud began as an Antigravity adaptation of
[claude-hud](https://github.com/jarrodwatts/claude-hud). Its mature rendering,
configuration, and statusline ideas remain an important foundation; the 0.2.0
line replaces the old Claude-oriented data path with Antigravity-native status,
quota, transcript, and artifact support.

MIT licensed. Contributions and issue reports are welcome.
