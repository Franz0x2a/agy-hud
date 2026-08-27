---
name: agy-hud-configure
description: Configure agy-hud profiles, language, layout, fields, and colors.
---

# Configure agy-hud

Read the current config from
`~/.gemini/antigravity-cli/plugins/agy-hud/config.json`, or from the directory
set by `ANTIGRAVITY_CONFIG_DIR`. Preserve unknown keys and write valid UTF-8
JSON. If the file is malformed, report the error and do not overwrite it.

Offer these profiles:

- **Essential (recommended):** model/state/mode, project/VCS, context percentage
  and tokens, quota remaining/reset, active tools, subagents, and Plan progress.
- **Full:** Essential plus cost, duration, session tokens when a truthful full
  transcript aggregate is available, sandbox/network, artifact/task/input
  counts, confirmation state, Vim mode, plan tier, account, CLI version, Skills,
  and MCP activity.
- **Minimal:** model, project/VCS, and context only. Disable transcript/activity
  surfaces so the hot path avoids those file reads.

Use the typed defaults in `src/config.ts` as the source of truth. Warn before
enabling `display.showAccount`, because it prints the user's email. Explain
that Git-only extended details (`showAheadBehind`, `showFileStats`) may invoke
`git`; native git/jj/hg branch and dirty state do not.
