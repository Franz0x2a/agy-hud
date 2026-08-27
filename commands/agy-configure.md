---
description: Configure agy-hud profiles, language, layout, and native Antigravity fields
allowed-tools: Read, Write, AskUserQuestion
---

# Configure agy-hud

This legacy alias remains for older plugin loaders. On current Antigravity CLI,
prefer the native `/agy-hud-configure` skill and follow the same profile rules
below.

Read `~/.gemini/antigravity-cli/plugins/agy-hud/config.json` (or the equivalent
path under `ANTIGRAVITY_CONFIG_DIR`) when it exists. Preserve unknown and
advanced keys. Write valid UTF-8 JSON without a BOM.

Ask for profile, language, and layout. Show a compact preview before saving.

## Profiles

### Essential (recommended)

Use the package defaults. It shows the high-signal session data:

- model, native agent state, execution mode
- project and native VCS branch/dirty state
- context percentage plus token usage
- quota remaining plus reset countdown
- current tools, subagents, and Plan/task.md progress

Set these keys when writing an explicit Essential profile:

```json
{
  "display": {
    "showAgentState": true,
    "showExecutionMode": true,
    "showUsage": true,
    "showTools": true,
    "showAgents": true,
    "showTodos": true,
    "contextValue": "both",
    "usageValue": "remaining",
    "showSandbox": false,
    "showArtifacts": false,
    "showTaskCount": false,
    "showPendingInput": false,
    "showToolConfirmation": false,
    "showVimMode": false,
    "showPlanTier": false,
    "showAccount": false,
    "showAntigravityVersion": false,
    "showSkills": false,
    "showMcpActivity": false
  }
}
```

### Full

Start with Essential and enable every native runtime field:

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

Warn that `showAccount` displays the account email in the terminal and should
remain off for screen sharing unless explicitly requested.

### Minimal

Show only model, project/VCS, and context. Disable usage and all activity and
runtime-detail toggles.

## Other choices

- Language: `en` or `zh-Hans` (`zh` remains accepted as a compatibility alias).
- Layout: `expanded` (recommended) or `compact`.
- Native default line: preserve `statusLine.stack_with_default`; explain that
  setting it to `true` stacks Antigravity's own line with agy-hud.
- Git details: `showAheadBehind` and `showFileStats` may invoke `git`; the
  Essential branch/dirty view uses Antigravity's native VCS payload.

Do not invent fields. Valid display toggles are those in `src/config.ts`.
