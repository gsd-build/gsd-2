// Project/App: GSD-2
// File Purpose: Regression tests for workspace package test file selection.

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { selectPackageTestFiles } = require('../run-package-tests.cjs');

function withTempPackage(callback) {
  const root = mkdtempSync(join(tmpdir(), 'gsd-run-package-tests-'));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function touch(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, 'test("placeholder", () => {});\n', 'utf-8');
}

test('selectPackageTestFiles prefers compiled src tests over copied package dist tests', () => {
  withTempPackage((root) => {
    const distTestPkg = join(root, 'dist-test-package');
    const pkgDist = join(root, 'package-dist');
    const srcTest = join(distTestPkg, 'src', 'workflow-tools.test.js');
    const copiedDistTest = join(distTestPkg, 'dist', 'workflow-tools.test.js');
    touch(srcTest);
    touch(copiedDistTest);

    assert.deepEqual(selectPackageTestFiles(distTestPkg, pkgDist), [srcTest]);
  });
});

test('selectPackageTestFiles falls back to copied dist-test package files when no compiled src tests exist', () => {
  withTempPackage((root) => {
    const distTestPkg = join(root, 'dist-test-package');
    const pkgDist = join(root, 'package-dist');
    const copiedDistTest = join(distTestPkg, 'dist', 'legacy.test.js');
    touch(copiedDistTest);

    assert.deepEqual(selectPackageTestFiles(distTestPkg, pkgDist), [copiedDistTest]);
  });
});

test('selectPackageTestFiles falls back to package-local dist when test:compile has no package output', () => {
  withTempPackage((root) => {
    const distTestPkg = join(root, 'missing-dist-test-package');
    const pkgDist = join(root, 'package-dist');
    const packageDistTest = join(pkgDist, 'package-script.test.js');
    touch(packageDistTest);

    assert.deepEqual(selectPackageTestFiles(distTestPkg, pkgDist), [packageDistTest]);
  });
});
