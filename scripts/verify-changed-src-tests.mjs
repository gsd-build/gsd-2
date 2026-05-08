#!/usr/bin/env node
// Project/App: GSD-2
// File Purpose: Run focused source tests for changed src files.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TEST_FILE_RE = /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.(?:ts|mjs|js)$/;
const SOURCE_RE = /\.(?:ts|tsx|mjs|js)$/;

export function normalizeRepoPath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isSourceCandidate(path) {
  const normalized = normalizeRepoPath(path);
  return (
    normalized.startsWith('src/') &&
    SOURCE_RE.test(normalized) &&
    !normalized.endsWith('.d.ts') &&
    !normalized.includes('/integration/')
  );
}

export function isTestFile(path) {
  return TEST_FILE_RE.test(normalizeRepoPath(path));
}

export function candidateTestsForSource(path) {
  const normalized = normalizeRepoPath(path);
  if (!isSourceCandidate(normalized)) return [];
  if (isTestFile(normalized)) return [normalized];

  const dir = dirname(normalized).replaceAll('\\', '/');
  const extless = basename(normalized).replace(/\.(?:ts|tsx|mjs|js)$/, '');
  const candidates = new Set();

  candidates.add(`${dir}/tests/${extless}.test.ts`);
  candidates.add(`${dir}/tests/${extless}.test.mjs`);
  candidates.add(`${dir}/${extless}.test.ts`);
  candidates.add(`${dir}/${extless}.test.mjs`);

  if (normalized.startsWith('src/resources/extensions/')) {
    const [, , , extensionName] = normalized.split('/');
    candidates.add(`src/resources/extensions/${extensionName}/tests/${extless}.test.ts`);
    candidates.add(`src/resources/extensions/${extensionName}/tests/${extless}.test.mjs`);
  }

  candidates.add(`src/tests/${extless}.test.ts`);
  candidates.add(`src/tests/${extless}.test.mjs`);

  return [...candidates];
}

export function selectChangedSrcTests(changedFiles, exists = existsSync) {
  const selected = new Set();
  const uncovered = [];

  for (const file of changedFiles.map(normalizeRepoPath)) {
    if (!isSourceCandidate(file)) continue;
    const candidates = candidateTestsForSource(file);
    const matches = candidates.filter(candidate => exists(resolve(ROOT, candidate)));
    for (const match of matches) selected.add(match);
    if (matches.length === 0 && !isTestFile(file)) uncovered.push(file);
  }

  return {
    tests: [...selected].sort(),
    uncovered: uncovered.sort(),
  };
}

export function buildNodeTestArgs(testFiles) {
  return [
    '--import',
    './src/resources/extensions/gsd/tests/resolve-ts.mjs',
    '--experimental-strip-types',
    '--test',
    ...testFiles,
  ];
}

export function parseArgs(argv) {
  const options = {
    files: [],
    list: false,
    base: 'HEAD',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') {
      options.list = true;
    } else if (arg === '--base' || arg === '--since') {
      options.base = argv[++i] ?? options.base;
    } else if (arg.startsWith('--base=')) {
      options.base = arg.slice('--base='.length);
    } else if (arg.startsWith('--since=')) {
      options.base = arg.slice('--since='.length);
    } else if (arg === '--files') {
      options.files.push(...splitFileList(argv[++i] ?? ''));
    } else if (arg.startsWith('--files=')) {
      options.files.push(...splitFileList(arg.slice('--files='.length)));
    } else {
      options.files.push(arg);
    }
  }

  return options;
}

function splitFileList(value) {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function changedFilesFromGit(base) {
  const result = spawnSync('git', ['diff', '--name-only', base, '--', 'src'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git diff failed with exit ${result.status}`);
  }
  return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function toDistTestPath(path) {
  const normalized = normalizeRepoPath(path);
  if (normalized.endsWith('.ts')) return `dist-test/${normalized.slice(0, -3)}.js`;
  if (normalized.endsWith('.mjs')) return `dist-test/${normalized}`;
  if (normalized.endsWith('.js')) return `dist-test/${normalized}`;
  return `dist-test/${normalized}`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const changedFiles = options.files.length > 0 ? options.files : changedFilesFromGit(options.base);
  const selection = selectChangedSrcTests(changedFiles);

  if (selection.tests.length === 0) {
    process.stdout.write('No focused src tests found for changed files.\n');
    if (selection.uncovered.length > 0) {
      process.stdout.write(`Uncovered changed source files:\n${selection.uncovered.map(file => `- ${file}`).join('\n')}\n`);
    }
    return;
  }

  if (options.list) {
    process.stdout.write(`${selection.tests.join('\n')}\n`);
    if (selection.uncovered.length > 0) {
      process.stdout.write(`\nUncovered changed source files:\n${selection.uncovered.map(file => `- ${file}`).join('\n')}\n`);
    }
    return;
  }

  const distTests = selection.tests.map(toDistTestPath);
  const compile = spawnSync('npm', ['run', 'test:compile'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if ((compile.status ?? 1) !== 0) process.exit(compile.status ?? 1);

  const result = spawnSync(process.execPath, buildNodeTestArgs(distTests), {
    cwd: ROOT,
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main();
}
