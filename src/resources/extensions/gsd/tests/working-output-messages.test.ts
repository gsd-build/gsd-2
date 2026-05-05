// GSD-2 + src/resources/extensions/gsd/tests/working-output-messages.test.ts - Regression coverage for user-facing working-state message quality.

import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateWorkingOutputMessage,
  evaluateWorkingOutputMessages,
  formatAutoUnitWorkingMessage,
} from "../working-output-messages.ts";

test("auto unit loader messages name the active work", () => {
  assert.equal(
    formatAutoUnitWorkingMessage("research-milestone", "M001"),
    "Researching M001: waiting for provider response",
  );
  assert.equal(
    evaluateWorkingOutputMessage({
      surface: "loader",
      message: formatAutoUnitWorkingMessage("research-milestone", "M001"),
      context: { unitType: "research-milestone", unitId: "M001", health: "waiting" },
    }).length,
    0,
  );
});

test("generic working messages are flagged", () => {
  const findings = evaluateWorkingOutputMessage({
    surface: "loader",
    message: "Working...",
    context: { health: "waiting" },
  });

  assert.deepEqual(findings.map(f => f.code), ["generic-working-message"]);
});

test("dashboard messages cannot claim healthy progress while recovering", () => {
  const findings = evaluateWorkingOutputMessage({
    surface: "dashboard",
    message: "GSD AUTO Progressing well",
    context: { health: "recovering", recoveryAttempts: 1 },
  });

  assert.deepEqual(findings.map(f => f.code), ["misleading-healthy-message"]);
});

test("pre-roadmap zero-slice counters are flagged", () => {
  const findings = evaluateWorkingOutputMessage({
    surface: "dashboard",
    message: "0/0 slices",
    context: { health: "waiting" },
  });

  assert.deepEqual(findings.map(f => f.code), ["fake-zero-progress"]);
});

test("stalled/provider-error/timeout messages need an action", () => {
  const noAction = evaluateWorkingOutputMessage({
    surface: "notification",
    message: "Provider stalled after 2m",
    context: { health: "stalled" },
  });
  assert.deepEqual(noAction.map(f => f.code), ["missing-action"]);

  const withAction = evaluateWorkingOutputMessage({
    surface: "notification",
    message: "Provider stalled after 2m. Type /gsd stop or wait for retry.",
    context: { health: "stalled" },
  });
  assert.equal(withAction.length, 0);
});

test("current fixed research working surfaces pass the audit", () => {
  const findings = evaluateWorkingOutputMessages([
    {
      surface: "loader",
      message: "Researching M001: waiting for provider response",
      context: { unitType: "research-milestone", unitId: "M001", health: "waiting" },
    },
    {
      surface: "dashboard",
      message: "Recovering\nretry 1 after idle stall",
      context: { unitType: "research-milestone", unitId: "M001", health: "recovering", recoveryAttempts: 1 },
    },
    {
      surface: "notification",
      message: "Auto-mode stopped - User requested stop.",
      context: { health: "stopped" },
    },
  ]);

  assert.equal(findings.length, 0);
});
