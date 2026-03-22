---
phase: 02-sync-prompt-migration
plan: 02
type: execute
wave: 2
depends_on: ["2-01"]
files_modified:
  - src/resources/extensions/gsd/auto-worktree-sync.ts
  - src/resources/extensions/gsd/engine/sync-migration.test.ts
autonomous: true
requirements: [SYNC-01, SYNC-02]
must_haves:
  truths:
    - "syncProjectRootToWorktree uses restore(manifest) instead of file copy + DB delete"
    - "syncStateToProjectRoot uses snapshot + writeManifest + renderAllProjections instead of safeCopyRecursive"
    - "Legacy projects without state-manifest.json fall through to old file-copy path"
    - "Runtime artifacts (units/) are still copied via safeCopyRecursive in both directions"
    - "Sync lock is acquired before snapshot read and released after restore completes"
    - "Lock held causes sync to skip with warning (non-fatal)"
  artifacts:
    - path: "src/resources/extensions/gsd/auto-worktree-sync.ts"
      provides: "Migrated sync functions using snapshot/restore"
      contains: "restore("
    - path: "src/resources/extensions/gsd/engine/sync-migration.test.ts"
      provides: "Tests for migrated sync functions"
  key_links:
    - from: "src/resources/extensions/gsd/auto-worktree-sync.ts"
      to: "src/resources/extensions/gsd/workflow-manifest.ts"
      via: "restore() and writeManifest() calls"
      pattern: "restore\\(|writeManifest\\("
    - from: "src/resources/extensions/gsd/auto-worktree-sync.ts"
      to: "src/resources/extensions/gsd/sync-lock.ts"
      via: "acquireSyncLock/releaseSyncLock calls"
      pattern: "acquireSyncLock|releaseSyncLock"
---

<objective>
Migrate both worktree sync functions from file-copy + DB-delete to snapshot/restore with advisory locking.

Purpose: Replace the fragile file-copy sync that deletes gsd.db (causing slow markdown-based rebuilds) with atomic snapshot/restore using the manifest infrastructure from Phase 1. Advisory locking from Plan 01 prevents concurrent sync collisions.

Output: Migrated auto-worktree-sync.ts with both functions gut-replaced, legacy fallback preserved, and comprehensive tests.
</objective>

<execution_context>
@/Users/jeremymcspadden/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jeremymcspadden/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-sync-prompt-migration/2-CONTEXT.md
@.planning/phases/02-sync-prompt-migration/2-RESEARCH.md
@.planning/phases/02-sync-prompt-migration/2-01-SUMMARY.md

<interfaces>
<!-- Key types and contracts the executor needs. -->

From src/resources/extensions/gsd/sync-lock.ts (created in Plan 01):
```typescript
export function acquireSyncLock(basePath: string, timeoutMs?: number): { acquired: boolean };
export function releaseSyncLock(basePath: string): void;
```

From src/resources/extensions/gsd/workflow-manifest.ts:
```typescript
export interface StateManifest {
  version: number;
  exported_at: string;
  milestones: MilestoneRow[];
  slices: SliceRow[];
  tasks: TaskRow[];
  decisions: DecisionRow[];
  verification_evidence: VerificationEvidenceRow[];
}
export function snapshot(db: DbAdapter): StateManifest;
export function restore(db: DbAdapter, manifest: StateManifest): void;
export function writeManifest(basePath: string, db: DbAdapter): void;
export function bootstrapFromManifest(basePath: string, db: DbAdapter): boolean;
```

From src/resources/extensions/gsd/workflow-projections.ts:
```typescript
export function renderAllProjections(basePath: string, milestoneId: string): void;
```

From src/resources/extensions/gsd/gsd-db.ts:
```typescript
export function _getAdapter(): DbAdapter | null;
```

From src/resources/extensions/gsd/safe-fs.ts:
```typescript
export function safeCopy(src: string, dest: string, opts?: { force?: boolean }): void;
export function safeCopyRecursive(src: string, dest: string, opts?: { force?: boolean }): void;
```

Current auto-worktree-sync.ts functions (to be gut-replaced):
```typescript
// syncProjectRootToWorktree: lines 36-64 — copies milestone dir + deletes gsd.db
// syncStateToProjectRoot: lines 74-105 — copies STATE.md + milestone dir + runtime units
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Migrate sync functions with TDD</name>
  <files>src/resources/extensions/gsd/auto-worktree-sync.ts, src/resources/extensions/gsd/engine/sync-migration.test.ts</files>
  <read_first>
    - src/resources/extensions/gsd/auto-worktree-sync.ts (full file — current implementation to gut-replace)
    - src/resources/extensions/gsd/workflow-manifest.ts (restore, writeManifest, bootstrapFromManifest signatures and behavior)
    - src/resources/extensions/gsd/workflow-projections.ts (renderAllProjections signature)
    - src/resources/extensions/gsd/sync-lock.ts (acquireSyncLock/releaseSyncLock from Plan 01)
    - src/resources/extensions/gsd/gsd-db.ts (_getAdapter export)
    - src/resources/extensions/gsd/safe-fs.ts (safeCopy, safeCopyRecursive signatures)
    - src/resources/extensions/gsd/engine/manifest.test.ts (test patterns — tmpdir, openDatabase, beforeEach/afterEach)
  </read_first>
  <behavior>
    - syncProjectRootToWorktree: when state-manifest.json exists in projectRoot, reads manifest JSON and calls restore(_getAdapter(), manifest) then renderAllProjections
    - syncProjectRootToWorktree: when state-manifest.json does NOT exist, falls through to legacy file-copy + DB delete path
    - syncProjectRootToWorktree: acquires sync lock before restore, releases in finally block
    - syncProjectRootToWorktree: when lock held, skips sync with stderr warning
    - syncProjectRootToWorktree: still copies runtime/units/ via safeCopyRecursive (hybrid per D-02)
    - syncStateToProjectRoot: when state-manifest.json exists in worktree, calls writeManifest + renderAllProjections at projectRoot
    - syncStateToProjectRoot: when state-manifest.json does NOT exist, falls through to legacy path
    - syncStateToProjectRoot: acquires sync lock on projectRoot, releases in finally block
    - syncStateToProjectRoot: still copies runtime/units/ via safeCopyRecursive with force:true
    - Both functions return early for null milestoneId or same paths (existing guards preserved)
  </behavior>
  <action>
RED: Create src/resources/extensions/gsd/engine/sync-migration.test.ts:

```typescript
// GSD-2 Single-Writer State Architecture — Sync migration tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
```

Test structure: Two describe blocks ("syncProjectRootToWorktree" and "syncStateToProjectRoot"). Each with beforeEach creating tmpDir with two subdirectories simulating projectRoot and worktree, each with `.gsd/` subdirectory. Use openDatabase(":memory:") for DB. Seed a state-manifest.json in the source directory for manifest-based tests.

Tests for syncProjectRootToWorktree:
1. "uses restore when manifest exists" — write state-manifest.json to projectRoot/.gsd/, call sync, verify DB was restored (query a milestone that was in the manifest)
2. "falls back to legacy when no manifest" — ensure no state-manifest.json, call sync, verify legacy behavior (safeCopyRecursive was used — check that destination milestone dir exists)
3. "copies runtime/units even in manifest path" — write state-manifest.json + create runtime/units/ dir with a file, call sync, verify the file was copied to worktree
4. "skips when milestoneId is null" — call with null, verify no files changed
5. "skips when paths are equal" — call with same path for both, verify no-op

Tests for syncStateToProjectRoot:
6. "uses writeManifest when manifest exists" — write state-manifest.json to worktree/.gsd/, seed DB with data, call sync, verify state-manifest.json was written to projectRoot
7. "falls back to legacy when no manifest" — no state-manifest.json, call sync, verify legacy behavior
8. "copies runtime/units with force" — create runtime/units/ in worktree with a file, call sync, verify copied to projectRoot

NOTE: These tests will need to mock or use the real DB functions. Since the sync functions call `_getAdapter()` internally, the test must have the DB open (openDatabase(":memory:")). The manifest must be valid JSON matching the StateManifest interface. Use a minimal manifest: `{ version: 1, exported_at: "...", milestones: [{id:"M001", title:"test", status:"active", created_at:"..."}], slices: [], tasks: [], decisions: [], verification_evidence: [] }`.

IMPORTANT PITFALL: `bootstrapFromManifest(basePath, db)` reads manifest from basePath, but syncProjectRootToWorktree needs to read from projectRoot and restore into worktree DB. The correct approach per Research pitfall #1: read manifest file manually with readFileSync, parse JSON, then call `restore(_getAdapter()!, manifest)` directly. Do NOT call bootstrapFromManifest with projectRoot path.

GREEN: Modify auto-worktree-sync.ts — gut-replace both function bodies:

Add imports at top:
```typescript
import { readFileSync } from "node:fs";  // add to existing import
import { restore, writeManifest } from "./workflow-manifest.js";
import type { StateManifest } from "./workflow-manifest.js";
import { renderAllProjections } from "./workflow-projections.js";
import { acquireSyncLock, releaseSyncLock } from "./sync-lock.js";
import { _getAdapter } from "./gsd-db.js";
```

syncProjectRootToWorktree replacement (lines 36-64):
```typescript
export function syncProjectRootToWorktree(
  projectRoot: string,
  worktreePath: string,
  milestoneId: string | null,
): void {
  if (!worktreePath || !projectRoot || worktreePath === projectRoot) return;
  if (!milestoneId) return;

  const prManifest = join(projectRoot, ".gsd", "state-manifest.json");

  // D-03: capability check — legacy project fallback
  if (!existsSync(prManifest)) {
    // Legacy path: file copy + DB delete (kept for projects without engine)
    const prGsd = join(projectRoot, ".gsd");
    const wtGsd = join(worktreePath, ".gsd");
    safeCopyRecursive(
      join(prGsd, "milestones", milestoneId),
      join(wtGsd, "milestones", milestoneId),
    );
    try {
      const wtDb = join(wtGsd, "gsd.db");
      if (existsSync(wtDb)) unlinkSync(wtDb);
    } catch { /* non-fatal */ }
    return;
  }

  // D-01: snapshot/restore path
  const lock = acquireSyncLock(worktreePath);
  if (!lock.acquired) {
    process.stderr.write("[gsd] sync project→worktree skipped: lock held\n");
    return;
  }
  try {
    // Pitfall #1: read manifest from projectRoot, restore into worktree DB
    const manifest = JSON.parse(readFileSync(prManifest, "utf-8")) as StateManifest;
    const db = _getAdapter();
    if (db) {
      restore(db, manifest);
      renderAllProjections(worktreePath, milestoneId);
    }
    // D-02: runtime artifacts still file-copied
    safeCopyRecursive(
      join(projectRoot, ".gsd", "runtime", "units"),
      join(worktreePath, ".gsd", "runtime", "units"),
    );
  } catch (err) {
    process.stderr.write(`[gsd] sync project→worktree failed (non-fatal): ${(err as Error).message}\n`);
  } finally {
    releaseSyncLock(worktreePath);
  }
}
```

syncStateToProjectRoot replacement (lines 74-105):
```typescript
export function syncStateToProjectRoot(
  worktreePath: string,
  projectRoot: string,
  milestoneId: string | null,
): void {
  if (!worktreePath || !projectRoot || worktreePath === projectRoot) return;
  if (!milestoneId) return;

  const wtManifest = join(worktreePath, ".gsd", "state-manifest.json");

  // D-03: capability check — legacy fallback
  if (!existsSync(wtManifest)) {
    const wtGsd = join(worktreePath, ".gsd");
    const prGsd = join(projectRoot, ".gsd");
    safeCopy(join(wtGsd, "STATE.md"), join(prGsd, "STATE.md"), { force: true });
    safeCopyRecursive(
      join(wtGsd, "milestones", milestoneId),
      join(prGsd, "milestones", milestoneId),
      { force: true },
    );
    safeCopyRecursive(
      join(wtGsd, "runtime", "units"),
      join(prGsd, "runtime", "units"),
      { force: true },
    );
    return;
  }

  // D-01: snapshot → writeManifest → renderAllProjections
  const lock = acquireSyncLock(projectRoot);
  if (!lock.acquired) {
    process.stderr.write("[gsd] sync worktree→project skipped: lock held\n");
    return;
  }
  try {
    const db = _getAdapter();
    if (db) {
      writeManifest(projectRoot, db);
      renderAllProjections(projectRoot, milestoneId);
    }
    // D-02: runtime artifacts still file-copied
    safeCopyRecursive(
      join(worktreePath, ".gsd", "runtime", "units"),
      join(projectRoot, ".gsd", "runtime", "units"),
      { force: true },
    );
  } catch (err) {
    process.stderr.write(`[gsd] sync worktree→project failed (non-fatal): ${(err as Error).message}\n`);
  } finally {
    releaseSyncLock(projectRoot);
  }
}
```

Keep all other functions in auto-worktree-sync.ts unchanged (readResourceVersion, checkResourcesStale, escapeStaleWorktree, cleanStaleRuntimeUnits).

Remove the `cpSync` import if no longer used (check if escapeStaleWorktree or other functions use it — if not, remove from the import list).

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/sync-migration.test.ts`
  </action>
  <verify>
    <automated>node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/sync-migration.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - src/resources/extensions/gsd/auto-worktree-sync.ts contains `restore(` (uses snapshot/restore, not file copy for engine state)
    - src/resources/extensions/gsd/auto-worktree-sync.ts contains `writeManifest(` (syncStateToProjectRoot uses manifest write)
    - src/resources/extensions/gsd/auto-worktree-sync.ts contains `renderAllProjections(` (renders projections after restore)
    - src/resources/extensions/gsd/auto-worktree-sync.ts contains `acquireSyncLock(` (advisory locking)
    - src/resources/extensions/gsd/auto-worktree-sync.ts contains `releaseSyncLock(` (lock release in finally)
    - src/resources/extensions/gsd/auto-worktree-sync.ts contains `state-manifest.json` (capability check for legacy fallback)
    - src/resources/extensions/gsd/auto-worktree-sync.ts still contains `safeCopyRecursive` (runtime/units hybrid copy per D-02)
    - src/resources/extensions/gsd/auto-worktree-sync.ts does NOT contain `unlinkSync(wtDb)` outside the legacy fallback block
    - src/resources/extensions/gsd/engine/sync-migration.test.ts exists with at least 6 test cases
    - All sync-migration tests pass (exit code 0)
    - All existing engine tests still pass
  </acceptance_criteria>
  <done>Both sync functions use snapshot/restore with advisory locking, legacy fallback preserved, runtime artifacts still copied, all tests green</done>
</task>

</tasks>

<verification>
Run all engine tests plus the full test suite:
```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/*.test.ts
```
</verification>

<success_criteria>
- syncProjectRootToWorktree uses restore(manifest) from state-manifest.json instead of cpSync + unlinkSync(gsd.db)
- syncStateToProjectRoot uses writeManifest + renderAllProjections instead of safeCopyRecursive for milestone
- Both functions acquire advisory sync lock and release in finally
- Legacy fallback works when no state-manifest.json exists
- Runtime artifacts (units/) still copied via safeCopyRecursive
- All new and existing tests pass
</success_criteria>

<output>
After completion, create `.planning/phases/02-sync-prompt-migration/2-02-SUMMARY.md`
</output>
