---
estimated_steps: 4
estimated_files: 1
---

# T04: Multi-bridge coexistence contract test and full regression

**Slice:** S01 — Bridge registry and project-scoped API surface
**Milestone:** M006

## Description

Write `src/tests/web-multi-project-contract.test.ts` proving the core claims of S01: two bridge instances coexist without interference, `resolveProjectCwd` reads `?project=` correctly, and backward compatibility holds. Then run a full regression of all tests and builds.

## Steps

1. **Create `src/tests/web-multi-project-contract.test.ts`.** Follow the pattern from `src/tests/web-bridge-contract.test.ts`:
   - Import `node:test`, `node:assert/strict`, `EventEmitter`, `PassThrough`, fs/path helpers.
   - Import from `../web/bridge-service.ts`: `configureBridgeServiceForTests`, `resetBridgeServiceForTests`, `getProjectBridgeServiceForCwd`, `getProjectBridgeService`, `resolveProjectCwd`, `resolveBridgeRuntimeConfig`.
   - Create workspace fixtures using `mkdtempSync` (two distinct project dirs).
   - Use `FakeRpcChild` class (same as in existing test) with `PassThrough` stdin/stdout/stderr.
   - Create a harness that auto-responds to `get_state` with project-specific session IDs.

2. **Write test cases:**
   - `"getProjectBridgeServiceForCwd returns distinct instances for different project paths"` — get bridges for pathA and pathB, `assert.notStrictEqual(bridgeA, bridgeB)`.
   - `"getProjectBridgeServiceForCwd returns same instance for same path"` — call twice with pathA, `assert.strictEqual`.
   - `"each bridge receives commands independently"` — configure two separate spawns (one per path), send `get_state` to each, verify each harness receives only its own command and returns its own session ID.
   - `"SSE subscribers are isolated per bridge"` — subscribe to bridge A and bridge B, emit an event on bridge A, verify only bridge A's subscriber sees it.
   - `"resolveProjectCwd reads ?project= from request URL"` — create a `Request` with `?project=%2Ftmp%2Fmy-project`, assert `resolveProjectCwd(request)` returns `/tmp/my-project`.
   - `"resolveProjectCwd falls back to GSD_WEB_PROJECT_CWD when no ?project= present"` — configure env with `GSD_WEB_PROJECT_CWD=/fallback/path`, create a `Request` without `?project=`, assert returns `/fallback/path`.
   - `"getProjectBridgeService backward compat shim works"` — configure env, call `getProjectBridgeService()`, verify it returns a `BridgeService` with the expected `projectCwd` in its snapshot.
   - `"resetBridgeServiceForTests clears all registry entries"` — create two bridges, call `resetBridgeServiceForTests()`, verify `getProjectBridgeServiceForCwd` for those paths returns new (different) instances.

3. **Ensure proper cleanup.** Every test uses try/finally with `resetBridgeServiceForTests()` and temp dir cleanup, matching the existing test pattern.

4. **Run full regression.** Execute in order:
   - `npm run test:unit` — all existing + new tests pass
   - `npm run test:integration` — all integration tests pass
   - `npm run build` — TypeScript build passes
   - `npm run build:web-host` — Next.js standalone build passes

## Must-Haves

- [ ] `src/tests/web-multi-project-contract.test.ts` exists with all 8 test cases
- [ ] All 8 test cases pass
- [ ] All existing contract tests (12+ files) pass unchanged
- [ ] All integration tests pass
- [ ] `npm run build` exits 0
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run test:unit` exits 0 with all tests passing
- `npm run test:unit -- --test-name-pattern "multi-project"` runs and passes the new test file
- `npm run test:integration` exits 0
- `npm run build` exits 0
- `npm run build:web-host` exits 0

## Inputs

- T01 output: `getProjectBridgeServiceForCwd`, `resolveProjectCwd`, updated `resolveBridgeRuntimeConfig`, updated aggregate functions — all exported from `bridge-service.ts`
- T02 output: 15 service files accepting `projectCwd?`
- T03 output: 28 routes reading `?project=` via `resolveProjectCwd`
- `src/tests/web-bridge-contract.test.ts` — reference for test pattern (FakeRpcChild, harness, fixture setup, cleanup)

## Observability Impact

- **New test signals:** `web-multi-project-contract.test.ts` verifies per-project `BridgeRuntimeSnapshot` fields (`projectCwd`, `phase`, `connectionCount`) are distinct across bridge instances — if these snapshots bleed between projects, the test fails.
- **Regression surface:** Full regression (`test:unit`, `test:integration`, `build`, `build:web-host`) ensures T01–T03 changes don't break existing observability (bridge snapshot shapes, SSE event structure, error redaction).
- **Inspection:** A future agent can run `npm run test:unit -- --test-name-pattern "multi-project"` to re-verify multi-bridge coexistence in isolation.
- **Failure visibility:** Test failure output names the specific coexistence claim that broke (registry identity, subscriber isolation, project resolution, backward compat).

## Expected Output

- `src/tests/web-multi-project-contract.test.ts` — new contract test file proving multi-bridge coexistence and backward compatibility
- Clean pass of full test suite and both builds
