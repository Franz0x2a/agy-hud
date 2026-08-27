import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const installerPath = new URL('../scripts/install-statusline.mjs', import.meta.url);

test('statusline installer preserves settings and writes a verified absolute wrapper', async () => {
  const configDir = await mkdtemp(path.join(tmpdir(), 'agy-hud-installer-'));
  const settingsPath = path.join(configDir, 'settings.json');
  await writeFile(settingsPath, JSON.stringify({ theme: 'dark', statusLine: { stack_with_default: true } }), 'utf8');

  try {
    const run = spawnSync(process.execPath, [installerPath.pathname], {
      env: { ...process.env, ANTIGRAVITY_CONFIG_DIR: configDir },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
    assert.equal(settings.theme, 'dark');
    assert.equal(settings.statusLine.type, 'command');
    assert.equal(settings.statusLine.stack_with_default, true);
    assert.ok(path.isAbsolute(settings.statusLine.command.replace(/^['"]|['"]$/g, '')));
    assert.ok(!settings.statusLine.command.includes('${extensionPath}'));
    assert.match(run.stdout, /Verification passed/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('statusline installer refuses to overwrite invalid settings JSON', async () => {
  const configDir = await mkdtemp(path.join(tmpdir(), 'agy-hud-installer-invalid-'));
  const settingsPath = path.join(configDir, 'settings.json');
  await writeFile(settingsPath, '{ invalid', 'utf8');

  try {
    const run = spawnSync(process.execPath, [installerPath.pathname], {
      env: { ...process.env, ANTIGRAVITY_CONFIG_DIR: configDir },
      encoding: 'utf8',
    });
    assert.notEqual(run.status, 0);
    assert.equal(await readFile(settingsPath, 'utf8'), '{ invalid');
    assert.match(run.stderr, /Refusing to overwrite invalid JSON/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});
