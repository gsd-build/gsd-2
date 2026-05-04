// Project/App: GSD-2
// File Purpose: Unit tests for custom workflow verification retry persistence.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  customVerifyRetryStatePath,
  hydrateCustomVerifyRetryCounts,
  saveCustomVerifyRetryCounts,
} from "../auto/custom-verify-retry-store.ts";

function makeSession(activeRunDir: string): {
  activeRunDir: string;
  basePath: string;
  verificationRetryCount: Map<string, number>;
} {
  return {
    activeRunDir,
    basePath: activeRunDir,
    verificationRetryCount: new Map<string, number>(),
  };
}

test("hydrateCustomVerifyRetryCounts loads positive finite counts from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "gsd-verify-retries-"));
  try {
    const session = makeSession(dir);
    mkdirSync(join(dir, "runtime"));
    writeFileSync(customVerifyRetryStatePath(session), JSON.stringify({
      counts: {
        "execute-task/M001/S001/T001": 2.8,
        "execute-task/M001/S001/T002": 1,
        zero: 0,
        negative: -1,
        infinite: Number.POSITIVE_INFINITY,
        string: "3",
      },
    }));

    const logged: unknown[] = [];
    const counts = hydrateCustomVerifyRetryCounts(session, {
      logFailure: err => logged.push(err),
    });

    assert.equal(counts, session.verificationRetryCount);
    assert.deepEqual([...counts.entries()], [
      ["execute-task/M001/S001/T001", 2],
      ["execute-task/M001/S001/T002", 1],
    ]);
    assert.deepEqual(logged, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hydrateCustomVerifyRetryCounts keeps existing in-memory counts", () => {
  const dir = mkdtempSync(join(tmpdir(), "gsd-verify-retries-"));
  try {
    const session = makeSession(dir);
    session.verificationRetryCount.set("existing", 4);

    const counts = hydrateCustomVerifyRetryCounts(session, {
      logFailure: () => assert.fail("logFailure should not be called"),
    });

    assert.deepEqual([...counts.entries()], [["existing", 4]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hydrateCustomVerifyRetryCounts logs read failures and returns the existing map", () => {
  const dir = mkdtempSync(join(tmpdir(), "gsd-verify-retries-"));
  try {
    const session = makeSession(dir);
    const logged: unknown[] = [];

    const counts = hydrateCustomVerifyRetryCounts(session, {
      logFailure: err => logged.push(err),
    });

    assert.equal(counts, session.verificationRetryCount);
    assert.equal(counts.size, 0);
    assert.equal(logged.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saveCustomVerifyRetryCounts writes counts with an updated timestamp", () => {
  const dir = mkdtempSync(join(tmpdir(), "gsd-verify-retries-"));
  try {
    const session = makeSession(dir);
    session.verificationRetryCount.set("execute-task/M001/S001/T001", 3);

    saveCustomVerifyRetryCounts(session, {
      logFailure: () => assert.fail("logFailure should not be called"),
    });

    const saved = JSON.parse(readFileSync(customVerifyRetryStatePath(session), "utf-8"));
    assert.deepEqual(saved.counts, {
      "execute-task/M001/S001/T001": 3,
    });
    assert.equal(typeof saved.updatedAt, "string");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saveCustomVerifyRetryCounts deletes empty retry files and ignores missing files", () => {
  const dir = mkdtempSync(join(tmpdir(), "gsd-verify-retries-"));
  try {
    const session = makeSession(dir);
    session.verificationRetryCount.set("execute-task/M001/S001/T001", 1);
    saveCustomVerifyRetryCounts(session, {
      logFailure: () => assert.fail("logFailure should not be called"),
    });

    session.verificationRetryCount.clear();
    saveCustomVerifyRetryCounts(session, {
      logFailure: () => assert.fail("logFailure should not be called"),
    });
    saveCustomVerifyRetryCounts(session, {
      logFailure: () => assert.fail("logFailure should not be called"),
    });

    const logged: unknown[] = [];
    hydrateCustomVerifyRetryCounts(session, {
      logFailure: err => logged.push(err),
    });
    assert.equal(logged.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
