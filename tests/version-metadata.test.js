import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readJson(relativePath) {
  const url = new URL(`../${relativePath}`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

test('all published package manifests use the package version', async () => {
  const packageJson = await readJson('package.json');
  const packageLock = await readJson('package-lock.json');
  const plugin = await readJson('.antigravity-plugin/plugin.json');
  const marketplace = await readJson('.antigravity-plugin/marketplace.json');

  assert.equal(packageLock.version, packageJson.version, 'package-lock root version');
  assert.equal(packageLock.packages[''].version, packageJson.version, 'package-lock package version');
  assert.equal(plugin.version, packageJson.version, 'plugin manifest version');
  assert.equal(marketplace.metadata.version, packageJson.version, 'marketplace metadata version');
});
