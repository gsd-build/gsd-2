// Project/App: GSD-2
// File Purpose: Git-fixture integration tests for verify-changed-src-tests --since codepath.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The production script anchors `cwd` to its own ROOT (resolve(__dirname, '..')).
// To exercise the real `git diff` codepath against a controlled repo, we copy the
// script into a tmpdir that we initialize as a git repo. The script then runs
// `git diff` inside the tmpdir, just as it would in CI. We invoke via `node` and
// assert on `--list` stdout (which avoids triggering `npm run test:compile`).

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_SCRIPT = resolve(__dirname, '..', 'verify-changed-src-tests.mjs');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

function configureRepo(repo) {
  git(repo, ['config', '--local', 'user.email', 'fixture@example.test']);
  git(repo, ['config', '--local', 'user.name', 'Fixture User']);
  git(repo, ['config', '--local', 'commit.gpgsign', 'false']);
  git(repo, ['config', '--local', 'tag.gpgsign', 'false']);
}

function makeFixtureRepo() {
  // realpath because macOS $TMPDIR is a /var/folders symlink to /private/var/folders;
  // the script's `import.meta.url` resolves to the real path and its
  // `process.argv[1] === fileURLToPath(import.meta.url)` guard would otherwise fail.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'verify-changed-src-tests-')));
  // Layout the script inside the fixture so its ROOT === fixture root.
  mkdirSync(join(root, 'scripts'), { recursive: true });
  copyFileSync(SOURCE_SCRIPT, join(root, 'scripts', 'verify-changed-src-tests.mjs'));
  git(root, ['init', '-q', '-b', 'main']);
  configureRepo(root);
  return root;
}

function runScript(repo, args) {
  const scriptPath = join(repo, 'scripts', 'verify-changed-src-tests.mjs');
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, '--list', ...args], {
      cwd: repo,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: typeof err.stdout === 'string' ? err.stdout : (err.stdout?.toString() ?? ''),
      stderr: typeof err.stderr === 'string' ? err.stderr : (err.stderr?.toString() ?? ''),
    };
  }
}

function writeFile(repo, relPath, body) {
  const abs = join(repo, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

describe('verify-changed-src-tests --since git integration', () => {
  describe('happy path', () => {
    let repo;
    let baseSha;

    before(() => {
      repo = makeFixtureRepo();
      writeFile(repo, 'src/foo.ts', 'export const foo = 1;\n');
      writeFile(repo, 'src/foo.test.ts', "import './foo.ts';\n");
      writeFile(repo, '.gitignore', 'scripts/\n');
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-q', '-m', 'initial']);
      baseSha = git(repo, ['rev-parse', 'HEAD']).trim();
      writeFile(repo, 'src/foo.ts', 'export const foo = 2;\n');
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-q', '-m', 'modify foo']);
    });

    after(() => rmSync(repo, { recursive: true, force: true }));

    test('selects the companion test for a modified source file', () => {
      const { status, stdout, stderr } = runScript(repo, ['--since', baseSha]);
      assert.equal(status, 0, `stderr: ${stderr}`);
      const lines = stdout.split('\n').map(line => line.trim()).filter(Boolean);
      assert.ok(
        lines.includes('src/foo.test.ts'),
        `expected src/foo.test.ts in selected tests, got:\n${stdout}`,
      );
    });
  });

  describe('no changes', () => {
    let repo;

    before(() => {
      repo = makeFixtureRepo();
      writeFile(repo, 'src/foo.ts', 'export const foo = 1;\n');
      writeFile(repo, 'src/foo.test.ts', "import './foo.ts';\n");
      writeFile(repo, '.gitignore', 'scripts/\n');
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-q', '-m', 'initial']);
    });

    after(() => rmSync(repo, { recursive: true, force: true }));

    test('--since HEAD with no diff produces "No focused src tests" message (NOT run-everything)', () => {
      const { status, stdout, stderr } = runScript(repo, ['--since', 'HEAD']);
      assert.equal(status, 0, `stderr: ${stderr}`);
      // Documented behavior: empty diff => "no tests selected" message, gate is a no-op.
      assert.match(stdout, /No focused src tests found for changed files\./);
      // Must not include the test file in the list output.
      assert.ok(!/^src\/foo\.test\.ts$/m.test(stdout), `unexpected test selection in: ${stdout}`);
    });
  });

  describe('shallow clone', () => {
    let origin;
    let shallow;
    let priorSha;

    before(() => {
      origin = makeFixtureRepo();
      writeFile(origin, 'src/foo.ts', 'export const foo = 1;\n');
      writeFile(origin, 'src/foo.test.ts', "import './foo.ts';\n");
      writeFile(origin, '.gitignore', 'scripts/\n');
      git(origin, ['add', '-A']);
      git(origin, ['commit', '-q', '-m', 'initial']);
      priorSha = git(origin, ['rev-parse', 'HEAD']).trim();
      writeFile(origin, 'src/foo.ts', 'export const foo = 2;\n');
      git(origin, ['add', '-A']);
      git(origin, ['commit', '-q', '-m', 'modify']);

      // Shallow clone (depth=1) — only the latest commit is reachable.
      const shallowParent = realpathSync(mkdtempSync(join(tmpdir(), 'verify-changed-src-tests-shallow-')));
      shallow = join(shallowParent, 'clone');
      execFileSync(
        'git',
        ['clone', '--depth', '1', '--no-local', `file://${origin}`, shallow],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      configureRepo(shallow);
      // Re-copy the script — clone does not bring untracked fixtures.
      mkdirSync(join(shallow, 'scripts'), { recursive: true });
      copyFileSync(SOURCE_SCRIPT, join(shallow, 'scripts', 'verify-changed-src-tests.mjs'));
    });

    after(() => {
      rmSync(origin, { recursive: true, force: true });
      rmSync(shallow, { recursive: true, force: true });
    });

    test('shallow clone with unreachable --since exits non-zero (fails closed)', () => {
      // FINDING: the script throws when `git diff` returns non-zero, which is the
      // safer "fail closed" outcome for shallow clones. If a future change starts
      // swallowing this error, the gate would silently fail open in CI. Pin
      // current behavior so any regression to fail-open is caught here.
      const { status, stderr } = runScript(shallow, ['--since', priorSha]);
      assert.notEqual(status, 0, 'expected non-zero exit when base sha is unreachable in shallow clone');
      assert.match(stderr, /git|bad|unknown|diff/i, `stderr should mention git error, got: ${stderr}`);
    });
  });

  describe('renamed file', () => {
    let repo;
    let baseSha;

    before(() => {
      repo = makeFixtureRepo();
      writeFile(repo, 'src/foo.ts', 'export const foo = 1;\n');
      writeFile(repo, 'src/foo.test.ts', "import './foo.ts';\n");
      writeFile(repo, 'src/bar.test.ts', "import './bar.ts';\n");
      writeFile(repo, '.gitignore', 'scripts/\n');
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-q', '-m', 'initial']);
      baseSha = git(repo, ['rev-parse', 'HEAD']).trim();
      git(repo, ['mv', 'src/foo.ts', 'src/bar.ts']);
      git(repo, ['commit', '-q', '-m', 'rename foo to bar']);
    });

    after(() => rmSync(repo, { recursive: true, force: true }));

    test('rename surfaces the new path; companion test is selected if it exists', () => {
      // The script invokes `git diff --name-only` without -M, so renames
      // appear as the new path (and possibly the old path). We assert that
      // when a companion test exists for the new path, it is selected.
      const { status, stdout, stderr } = runScript(repo, ['--since', baseSha]);
      assert.equal(status, 0, `stderr: ${stderr}`);
      const lines = stdout.split('\n').map(line => line.trim()).filter(Boolean);
      assert.ok(
        lines.includes('src/bar.test.ts'),
        `expected src/bar.test.ts to be selected for renamed source, got:\n${stdout}`,
      );
    });
  });
});
