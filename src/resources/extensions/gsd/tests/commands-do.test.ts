import test from "node:test";
import assert from "node:assert/strict";

import { matchRoute, ROUTES } from "../commands-do.ts";

// ─── Tests ──────────────────────────────────────────────────────────────

test("/gsd do: tests use the canonical route table", () => {
  const commands = new Set(ROUTES.map((route) => route.command));
  for (const command of [
    "export",
    "queue",
    "knowledge",
    "pr-branch",
    "migrate",
    "steer",
    "park",
    "widget",
  ]) {
    assert.ok(commands.has(command), `expected canonical route table to include ${command}`);
  }
});

test("/gsd do: routes exact progress intent to status", () => {
  const match = matchRoute("show me progress");
  assert.ok(match);
  assert.equal(match.command, "status");
});

test("/gsd do: routes bare auto intent to auto", () => {
  const match = matchRoute("run autonomously");
  assert.ok(match);
  assert.equal(match.command, "auto");
});

test("/gsd do: routes bare cleanup intent to cleanup", () => {
  const match = matchRoute("clean up");
  assert.ok(match);
  assert.equal(match.command, "cleanup");
  assert.equal(match.remainingArgs, "");
});

test("/gsd do: cleanup sentence stays a quick-task phrase instead of a partial cleanup command", () => {
  const match = matchRoute("clean up old branches");
  assert.equal(match, null);
});

test("/gsd do: routes 'create pr for milestone' to ship", () => {
  const match = matchRoute("create pr for milestone");
  assert.ok(match);
  assert.equal(match.command, "ship");
});

test("/gsd do: routes 'add tests for S03' to add-tests", () => {
  const match = matchRoute("add tests for S03");
  assert.ok(match);
  assert.equal(match.command, "add-tests");
});

test("/gsd do: routes 'what is next' to next", () => {
  const match = matchRoute("what's next");
  assert.ok(match);
  assert.equal(match.command, "next");
});

test("/gsd do: returns null for unrecognized input", () => {
  const match = matchRoute("florbinate the gizmo");
  assert.equal(match, null);
});

test("/gsd do: full progress sentence stays a quick-task phrase", () => {
  const match = matchRoute("How Far Along Are We on the mobile app");
  assert.equal(match, null);
});

test("/gsd do: prefers longer keyword match", () => {
  // "check health" (12 chars) should beat "health" (6 chars)
  const match = matchRoute("check health of the system");
  assert.ok(match);
  assert.equal(match.command, "doctor");
  assert.ok(match.score >= 12);
});

test("/gsd do: routes debug troubleshooting intent to debug", () => {
  const match = matchRoute("debug this flaky oauth callback");
  assert.ok(match);
  assert.equal(match.command, "debug");
});

test("/gsd do: keeps 'debug logs' routed to logs (longer keyword wins)", () => {
  const match = matchRoute("debug logs for today");
  assert.ok(match);
  assert.equal(match.command, "logs");
});

test("/gsd do: routes 'session report' to session-report", () => {
  const match = matchRoute("session report");
  assert.ok(match);
  assert.equal(match.command, "session-report");
});

test("/gsd do: routes 'diagnose issue' to debug (not doctor)", () => {
  // 'diagnose issue' is an explicit keyword on the debug route to distinguish
  // session-level issue diagnosis from /gsd doctor health checks.
  const match = matchRoute("diagnose issue with oauth callback");
  assert.ok(match);
  assert.equal(match.command, "debug");
});

test("/gsd do: routes 'investigate flaky test' to debug", () => {
  const match = matchRoute("investigate flaky test in CI");
  assert.ok(match);
  assert.equal(match.command, "debug");
});

test("/gsd do: 'debug logs' keyword wins over bare 'debug' (longer keyword precedence)", () => {
  // 'debug logs' (10 chars) > 'debug' (5 chars)
  const logsMatch = matchRoute("debug logs for the last run");
  assert.ok(logsMatch);
  assert.equal(logsMatch.command, "logs");
  assert.ok(logsMatch.score >= 10, `expected score >= 10, got ${logsMatch.score}`);

  // Bare 'debug' without 'logs' should still route to debug.
  const debugMatch = matchRoute("debug the payment timeout issue");
  assert.ok(debugMatch);
  assert.equal(debugMatch.command, "debug");
});

test("/gsd do: 'diagnose' alone routes to doctor (health check), not debug", () => {
  // 'diagnose' maps to the doctor route; 'diagnose issue' maps to debug.
  const match = matchRoute("diagnose my project");
  assert.ok(match);
  assert.equal(match.command, "doctor");
});

test("/gsd do: full task sentence falls back instead of token-routing to command", () => {
  const match = matchRoute("review tickets on linear and update the ticket status as you work");
  assert.equal(match, null);
});
