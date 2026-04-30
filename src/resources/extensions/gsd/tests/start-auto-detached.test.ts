import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const gsdDir = resolve(import.meta.dirname, "..");

function readGsdFile(relativePath: string): string {
  return readFileSync(resolve(gsdDir, relativePath), "utf-8");
}

test("command entrypoints use startAutoDetached instead of awaiting startAuto (#3733)", () => {
  const autoHandlerSrc = readGsdFile("commands/handlers/auto.ts");
  const workflowHandlerSrc = readGsdFile("commands/handlers/workflow.ts");
  const guidedFlowSrc = readGsdFile("guided-flow.ts");

  assert.ok(
    !autoHandlerSrc.includes("await startAuto("),
    "auto command handler should not await startAuto from the active agent turn",
  );
  assert.ok(
    !workflowHandlerSrc.includes("await startAuto("),
    "workflow command handler should not await startAuto from the active agent turn",
  );
  assert.ok(
    !guidedFlowSrc.includes("await startAuto("),
    "guided flow should not await startAuto from the active agent turn",
  );

  assert.ok(
    autoHandlerSrc.includes("startAutoDetached("),
    "auto command handler should launch auto-mode through startAutoDetached",
  );
  assert.ok(
    workflowHandlerSrc.includes("startAutoDetached("),
    "workflow handler should launch auto-mode through startAutoDetached",
  );
  assert.ok(
    guidedFlowSrc.includes("startAutoDetached("),
    "guided flow should launch auto-mode through startAutoDetached",
  );
});

test("bare /gsd stays in the foreground smart-entry flow (#5125 regression)", () => {
  const autoHandlerSrc = readGsdFile("commands/handlers/auto.ts");
  const bareCommandBranch = autoHandlerSrc.slice(
    autoHandlerSrc.indexOf('if (trimmed === "")'),
  );

  assert.ok(
    bareCommandBranch.includes('await import("../../guided-flow.js")'),
    "bare /gsd should load the guided smart-entry flow",
  );
  assert.ok(
    bareCommandBranch.includes("await showSmartEntry(ctx, pi, projectRoot(), { step: true })"),
    "bare /gsd should await the foreground wizard instead of detaching auto-mode",
  );
  assert.ok(
    !bareCommandBranch.includes("startAutoDetached("),
    "bare /gsd must not enter detached auto bootstrap directly",
  );
});

test("auto bootstrap validates blocked directories before touching .gsd migration state", () => {
  const autoSrc = readGsdFile("auto.ts");
  const autoStartSrc = readGsdFile("auto-start.ts");

  const startAutoIdx = autoSrc.indexOf("export async function startAuto(");
  const startAutoBody = autoSrc.slice(startAutoIdx);
  const startAutoValidationIdx = startAutoBody.indexOf("validateDirectory(base)");
  const startAutoRecoveryIdx = startAutoBody.indexOf("recoverFailedMigration(base)");

  assert.ok(startAutoIdx > -1, "startAuto should exist");
  assert.ok(startAutoValidationIdx > -1, "startAuto should validate the base directory");
  assert.ok(startAutoRecoveryIdx > -1, "startAuto should still recover failed migrations for safe projects");
  assert.ok(
    startAutoValidationIdx < startAutoRecoveryIdx,
    "startAuto must reject blocked directories before recovering or migrating .gsd state",
  );

  const bootstrapIdx = autoStartSrc.indexOf("export async function bootstrapAutoSession(");
  const bootstrapBody = autoStartSrc.slice(bootstrapIdx);
  const bootstrapValidationIdx = bootstrapBody.indexOf("validateDirectory(base)");
  const lockIdx = bootstrapBody.indexOf("acquireSessionLock(base)");
  const bootstrapMigrationIdx = bootstrapBody.indexOf("migrateToExternalState(base)");

  assert.ok(bootstrapIdx > -1, "bootstrapAutoSession should exist");
  assert.ok(bootstrapValidationIdx > -1, "bootstrapAutoSession should validate the base directory");
  assert.ok(lockIdx > -1, "bootstrapAutoSession should acquire a session lock for safe projects");
  assert.ok(bootstrapMigrationIdx > -1, "bootstrapAutoSession should still migrate safe projects");
  assert.ok(
    bootstrapValidationIdx < lockIdx && bootstrapValidationIdx < bootstrapMigrationIdx,
    "fresh bootstrap must reject blocked directories before locking or migrating .gsd state",
  );
});

test("startAutoDetached reports failures asynchronously (#3733)", () => {
  const autoSrc = readGsdFile("auto.ts");

  assert.ok(
    autoSrc.includes("export function startAutoDetached"),
    "auto.ts should export startAutoDetached",
  );
  assert.ok(
    autoSrc.includes("void startAuto(ctx, pi, base, verboseMode, options).catch"),
    "startAutoDetached should launch startAuto without awaiting it",
  );
  assert.ok(
    autoSrc.includes("ctx.ui.notify(`Auto-start failed: ${message}`, \"error\")"),
    "startAutoDetached should surface async startup failures to the user",
  );
});

test("detached auto-start preserves milestone lock across pause/stop cleanup (#3733)", () => {
  const autoSrc = readGsdFile("auto.ts");
  const sessionSrc = readGsdFile("auto/session.ts");

  assert.ok(
    autoSrc.includes("milestoneLock?: string | null"),
    "startAuto/startAutoDetached options should carry an explicit milestone lock",
  );
  assert.ok(
    autoSrc.includes("s.sessionMilestoneLock = options.milestoneLock ?? null;"),
    "startAuto should capture the requested milestone lock before async work begins",
  );
  assert.ok(
    autoSrc.includes("milestoneLock: s.sessionMilestoneLock ?? undefined"),
    "pause metadata should persist the detached milestone lock for resume",
  );
  assert.ok(
    autoSrc.includes("s.sessionMilestoneLock = meta.milestoneLock ?? null;"),
    "resume should restore the persisted milestone lock",
  );
  assert.ok(
    autoSrc.includes("restoreMilestoneLockEnv();"),
    "auto cleanup should restore the previous process milestone-lock env",
  );

  assert.ok(
    sessionSrc.includes("sessionMilestoneLock: string | null = null;"),
    "AutoSession should track the detached milestone lock explicitly",
  );
});
