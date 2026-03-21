import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ECOSYSTEM_CATALOG_ENTRIES,
  PUBLIC_ECOSYSTEM_CATALOG_REFERENCES,
  getInstallReferenceCompletions,
} from '../install-ecosystem-catalog.ts';

test('install reference completions expose the public gsd-build references', () => {
  const completions = getInstallReferenceCompletions();
  assert.deepEqual(
    completions.map((entry) => entry.cmd),
    PUBLIC_ECOSYSTEM_CATALOG_REFERENCES,
  );
  assert.ok(completions.every((entry) => entry.desc.includes(entry.cmd)));
});

test('workspace-scout entry is published under gsd-build namespace', () => {
  assert.deepEqual(ECOSYSTEM_CATALOG_ENTRIES, [
    {
      slug: 'workspace-scout',
      reference: 'gsd-build/workspace-scout',
      source: 'git:https://github.com/default-anton/pi-finder.git@da6f87b4d2f32c2a112a3cb8ea5c84220cddf955',
    },
  ]);
});
