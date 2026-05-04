// Project/App: GSD-2
// File Purpose: Tests for database open attempt and error state tracking.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDbOpenState } from "../db-open-state.ts";

describe("db-open-state", () => {
  test("starts with no attempt or error", () => {
    const state = createDbOpenState();

    assert.deepEqual(state.snapshot(), {
      attempted: false,
      lastError: null,
      lastPhase: null,
    });
  });

  test("tracks attempts and open errors", () => {
    const state = createDbOpenState();
    const error = new Error("cannot open");

    state.markAttempted();
    state.recordError("open", error);

    assert.equal(state.snapshot().attempted, true);
    assert.equal(state.snapshot().lastError, error);
    assert.equal(state.snapshot().lastPhase, "open");
  });

  test("normalizes non-Error values and clears errors without clearing attempts", () => {
    const state = createDbOpenState();

    state.markAttempted();
    state.recordError("initSchema", "schema failed");
    state.clearError();

    assert.equal(state.snapshot().attempted, true);
    assert.equal(state.snapshot().lastError, null);
    assert.equal(state.snapshot().lastPhase, null);
  });

  test("reset clears attempt and error state", () => {
    const state = createDbOpenState();

    state.markAttempted();
    state.recordError("vacuum-recovery", "vacuum failed");
    state.reset();

    assert.deepEqual(state.snapshot(), {
      attempted: false,
      lastError: null,
      lastPhase: null,
    });
  });
});
