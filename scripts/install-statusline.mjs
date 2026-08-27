import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function fail(message) {
  console.error(`[agy-hud] ${message}`);
  process.exit(1);
}

function expandHome(value) {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

const majorVersion = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
if (!Number.isFinite(majorVersion) || majorVersion < 18) {
  fail(`Node.js 18 or newer is required; found ${process.version}.`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDir, '..');
const entryPath = path.join(pluginRoot, 'dist', 'index.js');
if (!fs.existsSync(entryPath)) {
  fail(`Missing compiled entrypoint: ${entryPath}`);
}

const configuredDir = process.env.ANTIGRAVITY_CONFIG_DIR?.trim();
const configDir = path.resolve(expandHome(configuredDir || path.join(os.homedir(), '.gemini', 'antigravity-cli')));
const settingsPath = path.join(configDir, 'settings.json');
let settings = {};
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    fail(`Refusing to overwrite invalid JSON in ${settingsPath}: ${error instanceof Error ? error.message : 'parse error'}`);
  }
}
if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
  fail(`Refusing to overwrite non-object settings in ${settingsPath}.`);
}

fs.mkdirSync(configDir, { recursive: true });
const isWindows = process.platform === 'win32';
const wrapperPath = path.join(configDir, isWindows ? 'agy-hud-statusline.cmd' : 'agy-hud-statusline.sh');
if ([process.execPath, entryPath, wrapperPath].some(value => value.includes('"'))) {
  fail('Installation paths containing a double quote are not supported.');
}

const wrapper = isWindows
  ? `@echo off\r\n"${process.execPath}" "${entryPath}"\r\n`
  : `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(entryPath)}\n`;
const wrapperTemp = `${wrapperPath}.${process.pid}.tmp`;
fs.writeFileSync(wrapperTemp, wrapper, { encoding: 'utf8', mode: 0o755 });
fs.renameSync(wrapperTemp, wrapperPath);
if (!isWindows) fs.chmodSync(wrapperPath, 0o755);

const fixture = JSON.stringify({
  cwd: pluginRoot,
  model: { display_name: 'Gemini' },
  context_window: { context_window_size: 1000000, used_percentage: 1, remaining_percentage: 99 },
  terminal_width: 100,
});
const verification = spawnSync(wrapperPath, [], {
  input: fixture,
  encoding: 'utf8',
  shell: isWindows,
  timeout: 5000,
});
if (verification.status !== 0 || !verification.stdout.trim()) {
  fail(`Statusline verification failed: ${verification.stderr.trim() || `exit ${verification.status}`}`);
}

const currentStatusLine = settings.statusLine && typeof settings.statusLine === 'object' && !Array.isArray(settings.statusLine)
  ? settings.statusLine
  : {};
settings.statusLine = {
  ...currentStatusLine,
  type: 'command',
  command: isWindows ? `"${wrapperPath}"` : shellQuote(wrapperPath),
  stack_with_default: typeof currentStatusLine.stack_with_default === 'boolean'
    ? currentStatusLine.stack_with_default
    : false,
};

const settingsTemp = `${settingsPath}.${process.pid}.tmp`;
fs.writeFileSync(settingsTemp, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
fs.renameSync(settingsTemp, settingsPath);

console.log(`[agy-hud] Installed statusline wrapper: ${wrapperPath}`);
console.log(`[agy-hud] Updated settings without changing unrelated keys: ${settingsPath}`);
console.log('[agy-hud] Verification passed. Restart Antigravity CLI to activate the HUD.');
