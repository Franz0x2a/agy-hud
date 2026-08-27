---
name: agy-hud-setup
description: Install or repair the agy-hud Antigravity CLI statusline safely.
---

# Set up agy-hud

Locate this skill's plugin root (two directories above this file), then run:

```bash
node <plugin-root>/scripts/install-statusline.mjs
```

The installer checks Node.js 18+, creates a stable statusline wrapper with
absolute runtime paths, verifies it against a native payload, and merges the
`statusLine` block into Antigravity's `settings.json`. It refuses to overwrite
invalid JSON and preserves unrelated settings plus an existing
`stack_with_default` preference.

Show the installer output to the user. On success, ask them to fully restart
Antigravity CLI. Never delete the plugin registry, settings, or other plugins.
