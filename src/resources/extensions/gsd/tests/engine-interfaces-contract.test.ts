/**
 * engine-interfaces-contract.test.ts — Contract tests for S01 interface files.
 *
 * Validates that the new engine abstraction files (T01, T02) are well-formed,
 * importable under --experimental-strip-types, and compose correctly.
 *
 * Since interfaces are erased at runtime by --experimental-strip-types, we
 * use two strategies:
 * 1. Dynamic import() to verify module resolution succeeds (no syntax errors,
 *    no broken imports, no circular dependencies).
 * 2. Source-level assertions to verify interface shapes, field names, and
 *    method signatures — same pattern as auto-session-encapsulation.test.ts.
 * 3. Runtime assertions for AutoSession.activeEngineId (a real class property).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(join(SRC_DIR, relativePath), "utf-8");
}

// ─── 1. Import smoke tests ──────────────────────────────────────────────────
// Dynamic import() verifies that each module resolves and parses cleanly under
// --experimental-strip-types. If any file has a broken import path or syntax
// error, this fails immediately.

test("engine-types.ts is importable", async () => {
  const mod = await import("../engine-types.ts");
  assert.ok(mod, "engine-types.ts should resolve as a module");
});

test("workflow-engine.ts is importable", async () => {
  const mod = await import("../workflow-engine.ts");
  assert.ok(mod, "workflow-engine.ts should resolve as a module");
});

test("execution-policy.ts is importable", async () => {
  const mod = await import("../execution-policy.ts");
  assert.ok(mod, "execution-policy.ts should resolve as a module");
});

test("loop-deps-groups.ts is importable", async () => {
  const mod = await import("../loop-deps-groups.ts");
  assert.ok(mod, "loop-deps-groups.ts should resolve as a module");
});

// ─── 2. EngineState shape ────────────────────────────────────────────────────

test("EngineState has required fields: phase, currentMilestoneId, isComplete, raw", () => {
  const source = readSource("engine-types.ts");

  // Extract the EngineState interface body
  const match = source.match(/export interface EngineState \{([\s\S]*?)\n\}/);
  assert.ok(match, "EngineState interface not found in engine-types.ts");
  const body = match![1]!;

  const requiredFields = ["phase", "currentMilestoneId", "isComplete", "raw"];
  const missing = requiredFields.filter(field => !body.includes(`${field}:`));

  assert.equal(
    missing.length,
    0,
    `EngineState is missing required fields: ${missing.join(", ")}`,
  );
});

test("EngineState.raw is typed as unknown (leaf-node constraint)", () => {
  const source = readSource("engine-types.ts");
  assert.ok(
    /raw:\s*unknown/.test(source),
    "EngineState.raw must be typed as `unknown` to avoid coupling the leaf module to GSDState",
  );
});

// ─── 3. EngineDispatchAction discriminated union ─────────────────────────────

test("EngineDispatchAction has dispatch, stop, and skip variants", () => {
  const source = readSource("engine-types.ts");

  // Extract the EngineDispatchAction type — it spans multiple lines with
  // union members separated by `|`. The type ends at a line starting with
  // `\n\n` or the next top-level declaration.
  const match = source.match(/export type EngineDispatchAction\s*=([\s\S]*?)(?=\n\n\/\/|\nexport )/);
  assert.ok(match, "EngineDispatchAction type not found in engine-types.ts");
  const body = match![1]!;

  const variants = ["dispatch", "stop", "skip"];
  const missing = variants.filter(v => !body.includes(`action: "${v}"`));

  assert.equal(
    missing.length,
    0,
    `EngineDispatchAction is missing variants: ${missing.join(", ")}`,
  );
});

test("EngineDispatchAction dispatch variant carries a StepContract", () => {
  const source = readSource("engine-types.ts");
  const match = source.match(/action: "dispatch";\s*step:\s*StepContract/);
  assert.ok(
    match,
    'EngineDispatchAction "dispatch" variant must carry a `step: StepContract` field',
  );
});

// ─── 4. WorkflowEngine method names ─────────────────────────────────────────

test("WorkflowEngine has deriveState, resolveDispatch, reconcile, getDisplayMetadata, and engineId", () => {
  const source = readSource("workflow-engine.ts");

  // Extract the WorkflowEngine interface body
  const match = source.match(/export interface WorkflowEngine \{([\s\S]*?)\n\}/);
  assert.ok(match, "WorkflowEngine interface not found in workflow-engine.ts");
  const body = match![1]!;

  const requiredMembers = [
    "engineId",
    "deriveState",
    "resolveDispatch",
    "reconcile",
    "getDisplayMetadata",
  ];
  const missing = requiredMembers.filter(m => !body.includes(m));

  assert.equal(
    missing.length,
    0,
    `WorkflowEngine is missing members: ${missing.join(", ")}`,
  );
});

test("WorkflowEngine.engineId is readonly", () => {
  const source = readSource("workflow-engine.ts");
  assert.ok(
    /readonly engineId:\s*string/.test(source),
    "WorkflowEngine.engineId must be declared as `readonly`",
  );
});

// ─── 5. ExecutionPolicy method names ─────────────────────────────────────────

test("ExecutionPolicy has prepareWorkspace, selectModel, verify, recover, closeout", () => {
  const source = readSource("execution-policy.ts");

  // Extract the ExecutionPolicy interface body
  const match = source.match(/export interface ExecutionPolicy \{([\s\S]*?)\n\}/);
  assert.ok(match, "ExecutionPolicy interface not found in execution-policy.ts");
  const body = match![1]!;

  const requiredMembers = [
    "prepareWorkspace",
    "selectModel",
    "verify",
    "recover",
    "closeout",
  ];
  const missing = requiredMembers.filter(m => !body.includes(m));

  assert.equal(
    missing.length,
    0,
    `ExecutionPolicy is missing members: ${missing.join(", ")}`,
  );
});

// ─── 6. AutoSession.activeEngineId ───────────────────────────────────────────

test("AutoSession.activeEngineId defaults to null", async () => {
  const { AutoSession } = await import("../auto/session.ts");
  const session = new AutoSession();
  assert.equal(
    session.activeEngineId,
    null,
    "activeEngineId should default to null",
  );
});

test("AutoSession.reset() clears activeEngineId to null", async () => {
  const { AutoSession } = await import("../auto/session.ts");
  const session = new AutoSession();

  // Set to a non-null value, then reset
  session.activeEngineId = "test-engine";
  assert.equal(session.activeEngineId, "test-engine");

  session.reset();
  assert.equal(
    session.activeEngineId,
    null,
    "activeEngineId should be null after reset()",
  );
});

test("AutoSession.toJSON() includes activeEngineId", async () => {
  const { AutoSession } = await import("../auto/session.ts");
  const session = new AutoSession();

  const snapshot = session.toJSON();
  assert.ok(
    "activeEngineId" in snapshot,
    "toJSON() output must include activeEngineId key",
  );
  assert.equal(
    snapshot.activeEngineId,
    null,
    "toJSON().activeEngineId should be null for a fresh session",
  );

  // Verify it reflects mutations
  session.activeEngineId = "custom-engine";
  const snapshot2 = session.toJSON();
  assert.equal(
    snapshot2.activeEngineId,
    "custom-engine",
    "toJSON().activeEngineId should reflect the current value",
  );
});

// ─── 7. Sub-interface group count ────────────────────────────────────────────

test("loop-deps-groups.ts exports at least 8 sub-interfaces", () => {
  const source = readSource("loop-deps-groups.ts");
  const interfaces = source.match(/^export interface \w+/gm) ?? [];

  assert.ok(
    interfaces.length >= 8,
    `Expected at least 8 exported interfaces, found ${interfaces.length}: ${interfaces.join(", ")}`,
  );
});

test("loop-deps-groups.ts exports the composite LoopDeps interface", () => {
  const source = readSource("loop-deps-groups.ts");
  assert.ok(
    /export interface LoopDeps/.test(source),
    "loop-deps-groups.ts must export a composite LoopDeps interface",
  );
});

test("LoopDeps composite interface references all sub-interface groups", () => {
  const source = readSource("loop-deps-groups.ts");

  // Extract LoopDeps body
  const match = source.match(/export interface LoopDeps \{([\s\S]*?)\n\}/);
  assert.ok(match, "LoopDeps interface not found");
  const body = match![1]!;

  // These are the required dependency group keys
  const requiredKeys = [
    "git",
    "state",
    "dispatch",
    "modelAndBudget",
    "verification",
    "recovery",
    "supervision",
    "postUnit",
    "session",
    "observability",
  ];
  const missing = requiredKeys.filter(key => !body.includes(`${key}:`));

  assert.equal(
    missing.length,
    0,
    `LoopDeps is missing group keys: ${missing.join(", ")}`,
  );
});

// ─── 8. engine-types.ts leaf-node constraint ─────────────────────────────────

test("engine-types.ts has zero local imports (leaf-node constraint)", () => {
  const source = readSource("engine-types.ts");
  const localImports = (source.match(/from ['"]\.\/|from ['"]\.\.\//g) ?? []);

  assert.equal(
    localImports.length,
    0,
    `engine-types.ts must not import from local modules to prevent import cycles. ` +
    `Found ${localImports.length} local import(s).`,
  );
});

// ─── 9. engine-types.ts exports the expected type count ──────────────────────

test("engine-types.ts exports all 8 engine-polymorphic types", () => {
  const source = readSource("engine-types.ts");
  const expectedExports = [
    "EngineState",
    "StepContract",
    "DisplayMetadata",
    "EngineDispatchAction",
    "ReconcileResult",
    "RecoveryAction",
    "CloseoutResult",
    "CompletedStep",
  ];

  const missing = expectedExports.filter(name =>
    !new RegExp(`export (interface|type) ${name}\\b`).test(source),
  );

  assert.equal(
    missing.length,
    0,
    `engine-types.ts is missing exports: ${missing.join(", ")}`,
  );
});
