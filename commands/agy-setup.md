---
description: Install and verify agy-hud as the Antigravity CLI statusline
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# Set up agy-hud

This is the legacy command alias. Locate the installed agy-hud plugin root and
run its safe installer:

```bash
node <plugin-root>/scripts/install-statusline.mjs
```

The installer resolves absolute Node/plugin paths, writes a stable wrapper,
verifies a native payload, and merges `statusLine` without touching unrelated
settings. It refuses to overwrite invalid JSON. Show its output, then ask the
user to fully restart Antigravity CLI.

For current Antigravity CLI releases, prefer the native `/agy-hud-setup` skill.
Never write a literal `${extensionPath}` statusline command and never delete
the plugin registry or other plugins.
