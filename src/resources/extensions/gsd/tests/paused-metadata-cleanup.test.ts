import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { cleanupPausedMetadataAfterResumeLock } from "../auto/paused-metadata-cleanup.ts";

function makeTmpBase(): string {
  return join(tmpdir(), `gsd-paused-cleanup-${randomUUID()}`);
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
}

test("cleanupPausedMetadataAfterResumeLock keeps paused metadata when lock was not acquired", (t) => {
  const base = makeTmpBase();
  const pausedPath = join(base, ".gsd", "runtime", "paused-session.json");
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  writeFileSync(pausedPath, "{}", "utf-8");
  t.after(() => cleanup(base));

  cleanupPausedMetadataAfterResumeLock(false, base, null, pausedPath);

  assert.equal(
    existsSync(pausedPath),
    true,
    "paused-session metadata must be preserved when resume lock acquisition fails",
  );
});

test("cleanupPausedMetadataAfterResumeLock deletes explicit paused metadata path after lock acquisition", (t) => {
  const base = makeTmpBase();
  const pausedPath = join(base, ".gsd", "runtime", "paused-session.json");
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  writeFileSync(pausedPath, "{}", "utf-8");
  t.after(() => cleanup(base));

  cleanupPausedMetadataAfterResumeLock(true, base, null, pausedPath);

  assert.equal(
    existsSync(pausedPath),
    false,
    "paused-session metadata should be deleted once resume lock is acquired",
  );
});

test("cleanupPausedMetadataAfterResumeLock deletes derived paused metadata path when explicit path is absent", (t) => {
  const base = makeTmpBase();
  const pausedPath = join(base, ".gsd", "runtime", "paused-session.json");
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  writeFileSync(pausedPath, "{}", "utf-8");
  t.after(() => cleanup(base));

  cleanupPausedMetadataAfterResumeLock(true, base, null, null);

  assert.equal(
    existsSync(pausedPath),
    false,
    "derived paused-session metadata path should be cleaned up after lock acquisition",
  );
});

test("cleanupPausedMetadataAfterResumeLock logs warning when unlink fails", () => {
  const warnings: string[] = [];

  cleanupPausedMetadataAfterResumeLock(
    true,
    "/tmp/project",
    null,
    "/tmp/project/.gsd/runtime/paused-session.json",
    {
      existsSyncFn: () => true,
      unlinkSyncFn: () => {
        throw new Error("EACCES");
      },
      logWarningFn: (_scope, message) => {
        warnings.push(message);
      },
    },
  );

  assert.equal(warnings.length, 1, "cleanup failures should be logged");
  assert.match(
    warnings[0],
    /pause file cleanup failed: EACCES/,
    "cleanup warning should include underlying unlink error",
  );
});
