# Changelog

All notable changes to agy-hud will be documented in this file.

## [0.2.0] - 2026-08-27

### Added
- Antigravity 1.1.22 native status payload support, including decimal context
  usage, quota remaining/reset, agent state, execution mode, git/jj/hg VCS,
  sandbox, artifacts, tasks, confirmations, Vim mode, plan/account, and CLI data.
- Antigravity transcript activity for tools, errors, subagents, Skills, MCP, and
  conversation `task.md` Plan progress.
- Essential, Full, and Minimal display profiles with English and Simplified
  Chinese documentation.
- Native root `plugin.json`, install/configure skills, and a verified stable
  statusline installer for current Antigravity CLI plugin packaging.

### Changed
- Replaced legacy Claude-first context and usage behavior with Antigravity-native
  data, while retaining migration fallbacks for existing configuration.
- Bounded and cached transcript/artifact processing and strengthened terminal
  control sanitization.

## [0.1.0] - 2026-05-24

### Added
- Rebrand the project to `agy-hud` as a real-time statusline HUD for Antigravity CLI.
- Adapt installer and configure command (`/agy-hud:setup` and `/agy-hud:configure`).
- Read and write configuration under `~/.gemini/antigravity-cli/` instead of `~/.claude/` for first-class Antigravity CLI compatibility.
- Fully clean and rebrand README assets, workflows, and changelogs.
- Ensure 100% test coverage with all 587 tests passing flawlessly.
