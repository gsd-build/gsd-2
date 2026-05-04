#!/usr/bin/env node
/**
 * Project/App: GSD-2
 * File Purpose: Compile source and test files into reusable dist-test artifacts.
 *
 * Compile all TypeScript source + test files to dist-test/ using esbuild.
 * Run compiled JS directly with node --test (no per-file TS overhead).
 *
 * Usage: node scripts/compile-tests.mjs
 */

import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const DIST_TEST_DIR = join(ROOT, 'dist-test');
const CACHE_FILE = join(DIST_TEST_DIR, '.compile-tests-cache.json');
const CACHE_SCHEMA_VERSION = 1;

const require = createRequire(import.meta.url);
const esbuild = require(join(ROOT, 'node_modules/esbuild'));

// Recursively collect files by extension (skip node_modules, templates, etc.)
// Directories to skip during file collection
const SKIP_DIRS = new Set(['node_modules', 'templates', 'integration']);

async function collectFiles(dir, exts = ['.ts', '.mjs']) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectFiles(full, exts));
    } else if (
      exts.some(ext => entry.name.endsWith(ext)) &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(full);
    }
  }
  return results;
}

async function collectAllFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (ASSET_SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectAllFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

// Dirs to skip when copying assets (node_modules are never useful in dist-test)
const ASSET_SKIP_DIRS = new Set(['node_modules', 'integration']);

/**
 * Recursively copy files from srcDir to destDir.
 * Skips node_modules only. Copies everything: .ts/.tsx originals (for jiti),
 * .mjs helpers, .md/.yaml/.json assets, etc.
 * esbuild compiled .js output already lands in dist-test, so we just
 * overlay the asset files on top.
 */
async function copyAssets(srcDir, destDir) {
  let entries;
  try {
    entries = await readdir(srcDir, { withFileTypes: true });
  } catch {
    return; // directory doesn't exist, nothing to copy
  }
  for (const entry of entries) {
    if (ASSET_SKIP_DIRS.has(entry.name)) continue;
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyAssets(srcPath, destPath);
    } else {
      await mkdir(destDir, { recursive: true });
      await cp(srcPath, destPath, { force: true });
    }
  }
}

export function buildCompileFingerprint(entries) {
  const normalized = entries
    .map(entry => ({
      path: entry.path,
      size: entry.size,
      mtimeMs: Math.trunc(entry.mtimeMs),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    hash,
    fileCount: normalized.length,
    bytes: normalized.reduce((total, entry) => total + entry.size, 0),
  };
}

export function isCompileCacheFresh(cache, fingerprint, distTestExists) {
  return Boolean(
    distTestExists &&
    cache &&
    cache.schemaVersion === CACHE_SCHEMA_VERSION &&
    cache.hash === fingerprint.hash,
  );
}

async function collectInputEntries(root, files) {
  const unique = [...new Set(files.map(file => resolve(file)))].sort();
  const entries = [];
  for (const file of unique) {
    let info;
    try {
      info = await stat(file);
    } catch {
      continue;
    }
    if (!info.isFile()) continue;
    entries.push({
      path: relative(root, file).replaceAll('\\', '/'),
      size: info.size,
      mtimeMs: info.mtimeMs,
    });
  }
  return entries;
}

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function writeCache(fingerprint, metrics) {
  await mkdir(DIST_TEST_DIR, { recursive: true });
  await writeFile(
    CACHE_FILE,
    `${JSON.stringify({
      ...fingerprint,
      generatedAt: new Date().toISOString(),
      metrics,
    }, null, 2)}\n`,
    'utf8',
  );
}

function logMetrics(metrics) {
  console.log(`[test:compile] ${JSON.stringify(metrics)}`);
}

async function main() {
  const start = Date.now();

  // Collect entry points from src/ and packages/*/src/
  const srcFiles = await collectFiles(join(ROOT, 'src'));

  const packagesDir = join(ROOT, 'packages');
  const pkgEntries = await readdir(packagesDir, { withFileTypes: true });
  const packageFiles = [];
  for (const entry of pkgEntries) {
    if (!entry.isDirectory()) continue;
    const pkgSrc = join(packagesDir, entry.name, 'src');
    packageFiles.push(...await collectFiles(pkgSrc));
  }

  // Also compile web/lib/ — some tests import from ../../web/lib/
  const webLibFiles = await collectFiles(join(ROOT, 'web', 'lib'));

  // Compile extracted extension workspace packages (extensions/*/) — tests in
  // src/tests/ import from ../../extensions/<name>/index.ts.
  const extensionsDir = join(ROOT, 'extensions');
  const extEntries = existsSync(extensionsDir)
    ? await readdir(extensionsDir, { withFileTypes: true })
    : [];
  const extensionFiles = [];
  for (const entry of extEntries) {
    if (!entry.isDirectory()) continue;
    extensionFiles.push(...await collectFiles(join(extensionsDir, entry.name)));
  }

  // Compile vscode-extension/src/ — the security regression test imports
  // ../../vscode-extension/src/trusted-config.ts (a vscode-API-free helper)
  // so the trust predicate can be exercised outside the VS Code host.
  // esbuild with bundle:false + packages:external just transpiles syntax,
  // so files that import the `vscode` module compile fine without running.
  const vscodeExtensionSrc = join(ROOT, 'vscode-extension', 'src');
  const vscodeExtensionFiles = existsSync(vscodeExtensionSrc)
    ? await collectFiles(vscodeExtensionSrc)
    : [];

  const entryPoints = [...srcFiles, ...packageFiles, ...webLibFiles, ...extensionFiles, ...vscodeExtensionFiles];

  const inputFiles = [
    ...await collectAllFiles(join(ROOT, 'src')),
    ...await collectAllFiles(packagesDir),
    ...await collectAllFiles(join(ROOT, 'web', 'lib')),
    ...await collectAllFiles(join(ROOT, 'web', 'components')),
    ...await collectAllFiles(extensionsDir),
    ...await collectAllFiles(vscodeExtensionSrc),
    ...await collectAllFiles(join(ROOT, 'scripts')),
    ...await collectAllFiles(join(ROOT, 'dist')),
    join(ROOT, 'package.json'),
  ];
  const inputEntries = await collectInputEntries(ROOT, inputFiles);
  const fingerprint = buildCompileFingerprint(inputEntries);
  const cache = await readCache();
  const distTestExists = existsSync(DIST_TEST_DIR);
  if (isCompileCacheFresh(cache, fingerprint, distTestExists)) {
    const elapsedMs = Date.now() - start;
    logMetrics({
      cacheHit: true,
      fileCount: fingerprint.fileCount,
      bytesCopied: 0,
      inputBytes: fingerprint.bytes,
      wallMs: elapsedMs,
    });
    console.log(`dist-test is fresh; skipped compile in ${(elapsedMs / 1000).toFixed(2)}s`);
    return;
  }

  console.log(`Compiling ${entryPoints.length} files to dist-test/...`);

  // bundle:false transforms TypeScript but keeps import specifiers verbatim.
  // We post-process the output to rewrite .ts → .js in import strings.
  await esbuild.build({
    entryPoints,
    outdir: DIST_TEST_DIR,
    outbase: ROOT,
    bundle: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: 'inline',
    packages: 'external',
    logLevel: 'warning',
  });

  // Copy non-compiled assets from src/ to dist-test/src/ maintaining structure.
  // Tests use import.meta.url to resolve sibling .md, .yaml, .json, .ts etc.
  // Also copy original .ts files — jiti-based imports load .ts source directly.
  const srcDir = join(ROOT, 'src');
  const distSrcDir = join(DIST_TEST_DIR, 'src');
  await copyAssets(srcDir, distSrcDir);
  console.log('Copied non-TS assets and .ts source files to dist-test/src/');

  // Copy packages/*/src/ assets as well
  for (const entry of pkgEntries) {
    if (!entry.isDirectory()) continue;
    const pkgSrc = join(packagesDir, entry.name, 'src');
    const pkgDistSrc = join(DIST_TEST_DIR, 'packages', entry.name, 'src');
    await copyAssets(pkgSrc, pkgDistSrc);
    // Workspace package symlinks may resolve through dist-test/node_modules on
    // Windows, so the mirrored package tree also needs built package entrypoints.
    await copyAssets(
      join(packagesDir, entry.name, 'dist'),
      join(DIST_TEST_DIR, 'packages', entry.name, 'dist'),
    );
    const pkgJsonPath = join(packagesDir, entry.name, 'package.json');
    if (existsSync(pkgJsonPath)) {
      await cp(pkgJsonPath, join(DIST_TEST_DIR, 'packages', entry.name, 'package.json'), { force: true });
    }
  }

  // Copy extensions/*/ assets + package.json so tests in dist-test/src/tests/
  // can resolve ../../extensions/<name>/index.js after the .ts→.js rewrite.
  for (const entry of extEntries) {
    if (!entry.isDirectory()) continue;
    const extSrc = join(extensionsDir, entry.name);
    const extDist = join(DIST_TEST_DIR, 'extensions', entry.name);
    await copyAssets(extSrc, extDist);
    const extPkgJson = join(extSrc, 'package.json');
    if (existsSync(extPkgJson)) {
      await cp(extPkgJson, join(extDist, 'package.json'), { force: true });
    }
  }

  // Copy web/lib/ assets (tests import from ../../web/lib/ relative to dist-test/src/tests/)
  await copyAssets(join(ROOT, 'web', 'lib'), join(DIST_TEST_DIR, 'web', 'lib'));

  // Copy web/components/ assets (xterm-theme test reads shell-terminal.tsx via import.meta.dirname)
  await copyAssets(join(ROOT, 'web', 'components'), join(DIST_TEST_DIR, 'web', 'components'));

  // Copy scripts/ non-TS files (.cjs etc) — some tests require() scripts directly
  await copyAssets(join(ROOT, 'scripts'), join(DIST_TEST_DIR, 'scripts'));

  // Copy root package.json — some tests read it to check version/engines fields
  await cp(join(ROOT, 'package.json'), join(DIST_TEST_DIR, 'package.json'), { force: true });

  // Copy root dist/ into dist-test/dist/ — some tests compute projectRoot as
  // 3 levels up from dist-test/src/tests/ which lands at dist-test/, then
  // import from dist/mcp-server.js etc.
  const rootDistDir = join(ROOT, 'dist');
  const distTestDistDir = join(DIST_TEST_DIR, 'dist');
  await copyAssets(rootDistDir, distTestDistDir);

  // Post-process: rewrite .ts import specifiers to .js in all compiled JS files.
  // esbuild with bundle:false preserves original specifiers; Node can't load .ts.
  const compiledJsFiles = await collectFiles(DIST_TEST_DIR, ['.js']);
  // Regex matches .ts in from/import() strings but not sourceMappingURL comments
  const tsImportRe = /(from\s+["'])(\.\.?\/[^"']*?)\.ts(["'])/g;
  const tsDynImportRe = /(import\(["'])(\.\.?\/[^"']*?)\.ts(["'])\)/g;

  let rewritten = 0;
  await Promise.all(compiledJsFiles.map(async (file) => {
    const src = await readFile(file, 'utf-8');
    const out = src
      .replace(tsImportRe,   (_, a, b, c) => `${a}${b}.js${c}`)
      .replace(tsDynImportRe, (_, a, b, c) => `${a}${b}.js${c})`);
    if (out !== src) {
      await writeFile(file, out, 'utf-8');
      rewritten++;
    }
  }));
  if (rewritten > 0) {
    console.log(`Rewrote .ts → .js imports in ${rewritten} files`);
  }

  // Remove stale compiled test files: dist-test entries whose source no longer exists
  // in a non-integration source directory (e.g. test moved to integration/).
  // Only cleans *.test.js and *.test.ts files to avoid touching non-test outputs.
  const { rm } = await import('node:fs/promises');
  const testDirsToClean = [
    [join(DIST_TEST_DIR, 'src', 'tests'), join(ROOT, 'src', 'tests')],
    [join(DIST_TEST_DIR, 'src', 'resources', 'extensions', 'gsd', 'tests'),
     join(ROOT, 'src', 'resources', 'extensions', 'gsd', 'tests')],
  ];
  let staleCleaned = 0;
  for (const [distDir, srcDir] of testDirsToClean) {
    let distEntries;
    try { distEntries = await readdir(distDir, { withFileTypes: true }); } catch { continue; }
    for (const entry of distEntries) {
      if (!entry.isFile()) continue;
      if (!entry.name.match(/\.test\.(js|ts)$/)) continue;
      const stem = entry.name.replace(/\.(js|ts)$/, '');
      // Source could be .ts or .mjs (esbuild compiles both to .js)
      const hasTsSrc = existsSync(join(srcDir, stem + '.ts'));
      const hasMjsSrc = existsSync(join(srcDir, stem + '.mjs'));
      if (!hasTsSrc && !hasMjsSrc) {
        await rm(join(distDir, entry.name));
        staleCleaned++;
      }
    }
  }
  if (staleCleaned > 0) {
    console.log(`Removed ${staleCleaned} stale compiled test files from dist-test/`);
  }

  // Ensure dist-test/node_modules exists so resource-loader.ts (which computes
  // packageRoot from import.meta.url) resolves gsdNodeModules to a real path.
  // Without this, initResources creates dangling symlinks in test environments.
  const distNodeModules = join(DIST_TEST_DIR, 'node_modules');
  if (!existsSync(distNodeModules)) {
    symlinkSync(join(ROOT, 'node_modules'), distNodeModules);
  }

  const elapsedMs = Date.now() - start;
  await writeCache(fingerprint, {
    cacheHit: false,
    fileCount: fingerprint.fileCount,
    bytesCopied: fingerprint.bytes,
    inputBytes: fingerprint.bytes,
    wallMs: elapsedMs,
  });
  logMetrics({
    cacheHit: false,
    fileCount: fingerprint.fileCount,
    bytesCopied: fingerprint.bytes,
    inputBytes: fingerprint.bytes,
    wallMs: elapsedMs,
  });
  const elapsed = (elapsedMs / 1000).toFixed(2);
  console.log(`Done in ${elapsed}s`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
