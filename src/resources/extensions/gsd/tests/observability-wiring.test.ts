// GSD — Test: observability wiring for silent catch blocks
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  enableDebug,
  disableDebug,
  debugLog,
} from '../debug-logger.ts';

import {
  logWarning,
  logError,
  drainLogs,
  _resetLogs,
  type LogComponent,
} from '../workflow-logger.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTempGsdDir(): string {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-observability-test-'));
  mkdirSync(join(tmp, '.gsd'), { recursive: true });
  return tmp;
}

// ─── Error serialization pattern ──────────────────────────────────────────────
// Tests the inline pattern used in every wired catch block:
//   err instanceof Error ? err.message : String(err)

describe('error serialization pattern', () => {
  test('extracts message from Error objects', () => {
    const err = new Error('disk full');
    const result = err instanceof Error ? err.message : String(err);
    assert.equal(result, 'disk full');
  });

  test('converts plain string errors via String()', () => {
    const err: unknown = 'ENOENT: no such file';
    const result = err instanceof Error ? err.message : String(err);
    assert.equal(result, 'ENOENT: no such file');
  });

  test('converts undefined to string "undefined"', () => {
    const err: unknown = undefined;
    const result = err instanceof Error ? err.message : String(err);
    assert.equal(result, 'undefined');
  });

  test('converts null to string "null"', () => {
    const err: unknown = null;
    const result = err instanceof Error ? err.message : String(err);
    assert.equal(result, 'null');
  });

  test('converts numeric error codes to string', () => {
    const err: unknown = 128;
    const result = err instanceof Error ? err.message : String(err);
    assert.equal(result, '128');
  });

  test('handles Error subclasses (TypeError, RangeError)', () => {
    const err = new TypeError('invalid argument');
    const result = err instanceof Error ? err.message : String(err);
    assert.equal(result, 'invalid argument');
  });

  test('handles Error with empty message', () => {
    const err = new Error('');
    const result = err instanceof Error ? err.message : String(err);
    assert.equal(result, '');
  });
});

// ─── debugLog: error-context pattern ──────────────────────────────────────────
// Verifies the primary pattern: debugLog("source", { action, error }) does not
// throw, and is a no-op when debug is disabled.

describe('debugLog error-context pattern (disabled)', () => {
  // Debug is disabled by default — these must be silent no-ops

  test('accepts { action, error } payload without throwing', () => {
    assert.doesNotThrow(() => {
      debugLog('WorktreeResolver', { action: 'resolve-path-failed', error: 'ENOENT' });
    });
  });

  test('accepts { action, error, extra context } without throwing', () => {
    assert.doesNotThrow(() => {
      debugLog('reconcile', { action: 'worktree-remove-failed', worktree: 'feat/foo', error: 'exit 128' });
    });
  });

  test('accepts no-data call without throwing', () => {
    assert.doesNotThrow(() => {
      debugLog('auto-recovery');
    });
  });
});

describe('debugLog error-context pattern (enabled)', () => {
  let tmp: string;

  before(() => {
    tmp = createTempGsdDir();
    enableDebug(tmp);
  });

  after(() => {
    disableDebug();
  });

  test('WorktreeResolver source with action+error payload does not throw', () => {
    assert.doesNotThrow(() => {
      debugLog('WorktreeResolver', {
        action: 'resolve-path-failed',
        error: 'ENOENT: no such file or directory',
      });
    });
  });

  test('reconcile source with action+error+branch context does not throw', () => {
    assert.doesNotThrow(() => {
      debugLog('reconcile', {
        action: 'remove-worktree-failed',
        worktree: 'feat/my-branch',
        error: new Error('exit code 128').message,
      });
    });
  });

  test('auto-recovery source with action+error does not throw', () => {
    assert.doesNotThrow(() => {
      debugLog('auto-recovery', {
        action: 'reset-failed',
        error: 'fatal: not a git repository',
      });
    });
  });

  test('checkGitHealth source matches doctor-git-checks.ts pattern', () => {
    assert.doesNotThrow(() => {
      debugLog('checkGitHealth', {
        action: 'stale-branch-list-failed',
        error: 'permission denied',
      });
    });
  });

  test('getWorktreeHealth source matches worktree-health.ts pattern', () => {
    assert.doesNotThrow(() => {
      debugLog('getWorktreeHealth', {
        action: 'dirty-check-failed',
        worktree: 'feat/foo',
        error: 'git status failed',
      });
    });
  });

  test('error string from serialization pattern is accepted as payload value', () => {
    const err = new Error('conflict detected');
    const serialized = err instanceof Error ? err.message : String(err);
    assert.doesNotThrow(() => {
      debugLog('reconcile', { action: 'merge-abort-failed', error: serialized });
    });
  });
});

// ─── logWarning: component+message+context pattern ────────────────────────────
// Verifies the logWarning call signature used throughout the PR and that entries
// are buffered with correct structure.

describe('logWarning component+message+context pattern', () => {
  beforeEach(() => {
    _resetLogs();
  });

  after(() => {
    _resetLogs();
  });

  test('accepts reconcile component with message and context without throwing', () => {
    assert.doesNotThrow(() => {
      logWarning('reconcile', 'Failed to resolve worktree path from git worktree list', {
        worktree: 'feat/my-branch',
        error: 'ENOENT',
      });
    });
  });

  test('accepts state component without throwing', () => {
    assert.doesNotThrow(() => {
      logWarning('state', 'merge abort failed during reconciliation', {
        error: 'exit 1',
      });
    });
  });

  test('accepts engine component without throwing', () => {
    assert.doesNotThrow(() => {
      logWarning('engine', 'Failed to persist event log entry', {
        path: '/tmp/project/.gsd/events.jsonl',
        error: 'EACCES',
      });
    });
  });

  test('accepts tool component without throwing', () => {
    assert.doesNotThrow(() => {
      logWarning('tool', 'Tool handler encountered unexpected error', {
        tool: 'Write',
        error: 'disk full',
      });
    });
  });

  test('accepts compaction component without throwing', () => {
    assert.doesNotThrow(() => {
      logWarning('compaction', 'Event compaction write failed', {
        error: 'EROFS: read-only file system',
      });
    });
  });

  test('buffers entries after call', () => {
    logWarning('reconcile', 'worktree remove failed', { worktree: 'feat/test', error: 'exit 128' });
    const entries = drainLogs();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].severity, 'warn');
    assert.equal(entries[0].component, 'reconcile');
    assert.equal(entries[0].message, 'worktree remove failed');
    assert.deepEqual(entries[0].context, { worktree: 'feat/test', error: 'exit 128' });
  });

  test('buffered entry has ts field', () => {
    logWarning('state', 'hard reset failed', { error: 'fatal: not a git repository' });
    const entries = drainLogs();
    assert.equal(entries.length, 1);
    assert.ok(entries[0].ts, 'entry should have a ts field');
    assert.ok(new Date(entries[0].ts).getTime() > 0, 'ts should be a valid ISO date');
  });

  test('multiple warnings accumulate in buffer', () => {
    logWarning('reconcile', 'first warning', { error: 'err1' });
    logWarning('state', 'second warning', { error: 'err2' });
    logWarning('engine', 'third warning', { error: 'err3' });
    const entries = drainLogs();
    assert.equal(entries.length, 3);
    assert.equal(entries[0].component, 'reconcile');
    assert.equal(entries[1].component, 'state');
    assert.equal(entries[2].component, 'engine');
  });

  test('accepts context omitted (optional)', () => {
    assert.doesNotThrow(() => {
      logWarning('reconcile', 'worktree remove failed with no context');
    });
    const entries = drainLogs();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].context, undefined);
  });
});

// ─── logWarning with serialized Error values ──────────────────────────────────
// The PR pattern is: error: err instanceof Error ? err.message : String(err)
// Confirm the resulting string is accepted cleanly in context.

describe('logWarning with serialized Error in context', () => {
  beforeEach(() => {
    _resetLogs();
  });

  after(() => {
    _resetLogs();
  });

  test('Error object message is accepted as context error value', () => {
    const err = new Error('git worktree remove: exit 128');
    assert.doesNotThrow(() => {
      logWarning('reconcile', 'Initial worktree remove attempt failed', {
        worktree: 'feat/branch',
        force: 'false',
        error: err instanceof Error ? err.message : String(err),
      });
    });
    const entries = drainLogs();
    assert.equal(entries[0].context?.error, 'git worktree remove: exit 128');
  });

  test('non-Error thrown value (string) is accepted as context error value', () => {
    const err: unknown = 'ENOENT: no such file or directory';
    assert.doesNotThrow(() => {
      logWarning('state', 'Failed to read .git file for gitdir resolution', {
        path: '/some/path/.git',
        error: err instanceof Error ? err.message : String(err),
      });
    });
    const entries = drainLogs();
    assert.equal(entries[0].context?.error, 'ENOENT: no such file or directory');
  });

  test('undefined thrown value is coerced to "undefined" string', () => {
    const err: unknown = undefined;
    const serialized = err instanceof Error ? err.message : String(err);
    assert.doesNotThrow(() => {
      logWarning('engine', 'Unexpected undefined thrown in catch', {
        error: serialized,
      });
    });
    const entries = drainLogs();
    assert.equal(entries[0].context?.error, 'undefined');
  });
});
