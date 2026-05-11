import test from "node:test";
import assert from "node:assert/strict";

import {
  autoSession,
  clearToolInvocationError,
  getAutoRuntimeSnapshot,
} from "../auto-runtime-state.ts";

test("getAutoRuntimeSnapshot includes orchestration phase when available", () => {
  autoSession.reset();
  autoSession.active = true;
  autoSession.basePath = "/tmp/project";
  autoSession.orchestration = {
    async start() { return { kind: "advanced" as const }; },
    async advance() { return { kind: "advanced" as const }; },
    async resume() { return { kind: "advanced" as const }; },
    async stop() { return { kind: "stopped" as const }; },
    getStatus() {
      return { phase: "running" as const, transitionCount: 3, lastTransitionAt: 123 };
    },
  };

  const snap = getAutoRuntimeSnapshot();

  assert.equal(snap.active, true);
  assert.equal(snap.basePath, "/tmp/project");
  assert.equal(snap.orchestrationPhase, "running");
  assert.equal(snap.orchestrationTransitionCount, 3);
  assert.equal(snap.orchestrationLastTransitionAt, 123);

  autoSession.reset();
});

test("clearToolInvocationError clears stale tool error state for active auto sessions", () => {
  autoSession.reset();
  autoSession.active = true;
  autoSession.lastToolInvocationError = "gsd_task_complete: simulated transient tool error";

  clearToolInvocationError();

  assert.equal(autoSession.lastToolInvocationError, null);
  autoSession.reset();
});

test("getAutoRuntimeSnapshot omits orchestration phase when seam not wired", () => {
  autoSession.reset();

  const snap = getAutoRuntimeSnapshot();

  assert.equal(snap.orchestrationPhase, undefined);
  assert.equal(snap.orchestrationTransitionCount, undefined);
  assert.equal(snap.orchestrationLastTransitionAt, undefined);
});
