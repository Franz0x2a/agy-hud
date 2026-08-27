import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

test('statusline installer migrates a legacy HUD config to Essential v2 and writes an exact backup', async () => {
  const configDir = await mkdtemp(path.join(tmpdir(), 'agy-hud-installer-legacy-'));
  const pluginConfigDir = path.join(configDir, 'plugins', 'agy-hud');
  const configPath = path.join(pluginConfigDir, 'config.json');
  const backupPath = path.join(pluginConfigDir, 'config.v1.backup.json');
  const legacyConfig = {
    language: 'zh-Hans',
    display: {
      showUsage: false,
      contextValue: 'percent',
      usageValue: 'percent',
      showCost: true,
    },
    colors: { context: '#12ab34' },
    futurePreference: { keep: true },
  };
  await writeFile(path.join(configDir, 'settings.json'), '{}', 'utf8');
  await mkdir(pluginConfigDir, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(legacyConfig, null, 2)}\n`, 'utf8');

  try {
    const run = spawnSync(process.execPath, [installerPath.pathname], {
      env: { ...process.env, ANTIGRAVITY_CONFIG_DIR: configDir },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);

    const migrated = JSON.parse(await readFile(configPath, 'utf8'));
    assert.equal(migrated.configVersion, 2);
    assert.equal(migrated.display.showUsage, true);
    assert.equal(migrated.display.contextValue, 'both');
    assert.equal(migrated.display.usageValue, 'remaining');
    assert.equal(migrated.display.showAgentState, true);
    assert.equal(migrated.display.showExecutionMode, true);
    assert.equal(migrated.display.showCost, true);
    assert.equal(migrated.language, 'zh-Hans');
    assert.equal(migrated.colors.context, '#12ab34');
    assert.deepEqual(migrated.futurePreference, { keep: true });
    assert.deepEqual(JSON.parse(await readFile(backupPath, 'utf8')), legacyConfig);
    assert.match(run.stdout, /Migrated legacy config to Essential v2/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('statusline installer preserves explicit v2 display choices on reinstall', async () => {
  const configDir = await mkdtemp(path.join(tmpdir(), 'agy-hud-installer-v2-'));
  const pluginConfigDir = path.join(configDir, 'plugins', 'agy-hud');
  const configPath = path.join(pluginConfigDir, 'config.json');
  const currentConfig = {
    configVersion: 2,
    display: {
      showUsage: false,
      contextValue: 'remaining',
      usageValue: 'percent',
    },
  };
  await writeFile(path.join(configDir, 'settings.json'), '{}', 'utf8');
  await mkdir(pluginConfigDir, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(currentConfig, null, 2)}\n`, 'utf8');

  try {
    const run = spawnSync(process.execPath, [installerPath.pathname], {
      env: { ...process.env, ANTIGRAVITY_CONFIG_DIR: configDir },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), currentConfig);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});
