import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EcosystemCatalogInstallError,
  PUBLIC_ECOSYSTEM_CATALOG_REFERENCES,
  installEcosystemCatalog,
} from '../install-ecosystem-catalog.ts';

test('public catalog references include workspace-scout under gsd-build namespace', () => {
  assert.deepEqual(PUBLIC_ECOSYSTEM_CATALOG_REFERENCES, [
    'gsd-build/workspace-scout',
  ]);
});

test('installEcosystemCatalog rejects references outside gsd-build namespace', async () => {
  await assert.rejects(
    installEcosystemCatalog('npm:latchkey', { scope: 'project-local' }),
    (error: unknown) => {
      assert.ok(error instanceof EcosystemCatalogInstallError);
      assert.equal(error.phase, 'reference');
      assert.equal(error.code, 'catalog/invalid-reference');
      return true;
    },
  );
});

test('installEcosystemCatalog rejects unknown slugs', async () => {
  await assert.rejects(
    installEcosystemCatalog('gsd-build/unknown', { scope: 'project-local' }),
    (error: unknown) => {
      assert.ok(error instanceof EcosystemCatalogInstallError);
      assert.equal(error.phase, 'reference');
      assert.equal(error.code, 'catalog/unknown-slug');
      return true;
    },
  );
});

test('project-local installs map to package-manager local installs and project settings', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const settingsCalls: string[] = [];

  const result = await installEcosystemCatalog('gsd-build/workspace-scout', {
    scope: 'project-local',
    cwd: '/tmp/project',
    agentDir: '/tmp/agent',
    packageManager: {
      async install(source: string, options?: { local?: boolean }) {
        calls.push({ method: 'install', args: [source, options] });
      },
      getInstalledPath(source: string, scope: 'user' | 'project') {
        calls.push({ method: 'getInstalledPath', args: [source, scope] });
        return '/tmp/project/.gsd/git/github.com/default-anton/pi-finder';
      },
      addSourceToSettings(source: string, options?: { local?: boolean }) {
        calls.push({ method: 'addSourceToSettings', args: [source, options] });
        return true;
      },
    } as any,
    settingsManager: {
      async flush() {
        settingsCalls.push('flush');
      },
    } as any,
  });

  assert.equal(result.slug, 'workspace-scout');
  assert.equal(result.chosenScope, 'project-local');
  assert.equal(result.installerScope, 'project');
  assert.equal(result.actualManagedPath, '/tmp/project/.gsd/git/github.com/default-anton/pi-finder');
  assert.equal(result.settingsPath, '/tmp/project/.gsd/settings.json');
  assert.equal(result.settingsEntryAdded, true);
  assert.match(result.resolvedSource, /^git:https:\/\/github\.com\/default-anton\/pi-finder\.git@/);
  assert.deepEqual(calls, [
    { method: 'install', args: [result.resolvedSource, { local: true }] },
    { method: 'getInstalledPath', args: [result.resolvedSource, 'project'] },
    { method: 'addSourceToSettings', args: [result.resolvedSource, { local: true }] },
  ]);
  assert.deepEqual(settingsCalls, ['flush']);
});

test('user-global installs map to package-manager user installs and agent settings', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const settingsCalls: string[] = [];

  const result = await installEcosystemCatalog('gsd-build/workspace-scout', {
    scope: 'user-global',
    cwd: '/tmp/project',
    agentDir: '/tmp/agent',
    packageManager: {
      async install(source: string, options?: { local?: boolean }) {
        calls.push({ method: 'install', args: [source, options] });
      },
      getInstalledPath(source: string, scope: 'user' | 'project') {
        calls.push({ method: 'getInstalledPath', args: [source, scope] });
        return '/tmp/agent/git/github.com/default-anton/pi-finder';
      },
      addSourceToSettings(source: string, options?: { local?: boolean }) {
        calls.push({ method: 'addSourceToSettings', args: [source, options] });
        return true;
      },
    } as any,
    settingsManager: {
      async flush() {
        settingsCalls.push('flush');
      },
    } as any,
  });

  assert.equal(result.slug, 'workspace-scout');
  assert.equal(result.chosenScope, 'user-global');
  assert.equal(result.installerScope, 'user');
  assert.equal(result.settingsPath, '/tmp/agent/settings.json');
  assert.deepEqual(calls, [
    { method: 'install', args: [result.resolvedSource, { local: false }] },
    { method: 'getInstalledPath', args: [result.resolvedSource, 'user'] },
    { method: 'addSourceToSettings', args: [result.resolvedSource, { local: false }] },
  ]);
  assert.deepEqual(settingsCalls, ['flush']);
});

test('installEcosystemCatalog surfaces install failures with named phase and code', async () => {
  const packageManager = {
    async install() {
      throw new Error('git clone failed');
    },
  };

  await assert.rejects(
    installEcosystemCatalog('gsd-build/workspace-scout', {
      scope: 'project-local',
      packageManager: packageManager as any,
      settingsManager: { async flush() {} } as any,
    }),
    (error: unknown) => {
      assert.ok(error instanceof EcosystemCatalogInstallError);
      assert.equal(error.phase, 'install');
      assert.equal(error.code, 'catalog/install-failed');
      assert.match(error.message, /git clone failed/);
      return true;
    },
  );
});
