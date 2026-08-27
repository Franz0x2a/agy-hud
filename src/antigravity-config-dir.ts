import * as path from 'node:path';

function expandHomeDirPrefix(inputPath: string, homeDir: string): string {
  if (inputPath === '~') {
    return homeDir;
  }
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(homeDir, inputPath.slice(2));
  }
  return inputPath;
}

export function getAntigravityConfigDir(homeDir: string): string {
  const envConfigDir = (process.env.ANTIGRAVITY_CONFIG_DIR || process.env.CLAUDE_CONFIG_DIR)?.trim();
  if (envConfigDir) {
    return path.resolve(expandHomeDirPrefix(envConfigDir, homeDir));
  }

  return path.join(homeDir, '.gemini', 'antigravity-cli');
}

export function getAntigravitySettingsPath(homeDir: string): string {
  return path.join(getAntigravityConfigDir(homeDir), 'settings.json');
}

export function getHudPluginDir(homeDir: string): string {
  return path.join(getAntigravityConfigDir(homeDir), 'plugins', 'agy-hud');
}

/** Legacy Claude config discovery retained only for migrated config counters. */
export function getClaudeConfigDir(homeDir: string): string {
  const envConfigDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  return envConfigDir
    ? path.resolve(expandHomeDirPrefix(envConfigDir, homeDir))
    : path.join(homeDir, '.claude');
}

/** Legacy Claude sidecar path retained only for migrated config counters. */
export function getClaudeConfigJsonPath(homeDir: string): string {
  const configDir = getClaudeConfigDir(homeDir);
  return process.env.CLAUDE_CONFIG_DIR?.trim()
    ? `${configDir}.json`
    : path.join(homeDir, '.claude.json');
}
