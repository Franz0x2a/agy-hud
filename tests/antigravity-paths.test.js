import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  getAntigravityConfigDir,
  getAntigravitySettingsPath,
  getHudPluginDir,
} from '../dist/antigravity-config-dir.js';
import { _parseAntigravityVersion } from '../dist/version.js';

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('uses the Antigravity CLI config directory without requiring it to exist', () => {
  const original = process.env.ANTIGRAVITY_CONFIG_DIR;
  delete process.env.ANTIGRAVITY_CONFIG_DIR;
  try {
    assert.equal(
      getAntigravityConfigDir('/home/me'),
      path.join('/home/me', '.gemini', 'antigravity-cli'),
    );
    assert.equal(
      getAntigravitySettingsPath('/home/me'),
      path.join('/home/me', '.gemini', 'antigravity-cli', 'settings.json'),
    );
    assert.equal(
      getHudPluginDir('/home/me'),
      path.join('/home/me', '.gemini', 'antigravity-cli', 'plugins', 'agy-hud'),
    );
  } finally {
    restoreEnv('ANTIGRAVITY_CONFIG_DIR', original);
  }
});

test('respects ANTIGRAVITY_CONFIG_DIR and expands a home-relative path', () => {
  const original = process.env.ANTIGRAVITY_CONFIG_DIR;
  process.env.ANTIGRAVITY_CONFIG_DIR = '~/.agy-alt';
  try {
    assert.equal(getAntigravityConfigDir('/home/me'), path.join('/home/me', '.agy-alt'));
  } finally {
    restoreEnv('ANTIGRAVITY_CONFIG_DIR', original);
  }
});

test('parses Antigravity CLI semantic versions', () => {
  assert.equal(_parseAntigravityVersion('1.1.22\n'), '1.1.22');
  assert.equal(_parseAntigravityVersion('agy 1.2.0-beta.1+abc123'), '1.2.0-beta.1+abc123');
  assert.equal(_parseAntigravityVersion(''), undefined);
});
