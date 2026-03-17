---
estimated_steps: 6
estimated_files: 3
---

# T02: Add context-aware launch detection, browser auto-switch, and contract tests

**Slice:** S03 — Onboarding dev root step, context-aware launch, and final assembly
**Milestone:** M006

## Description

Wire context-aware launch detection into the CLI so `gsd --web` from inside a project under the dev root opens directly into that project, while from the dev root itself or outside opens the project picker. Add browser-side auto-initialization so `ProjectAwareWorkspace` registers the boot project with the store manager. Write contract tests proving all edge cases.

This is the final task in M006 — it closes the loop on context-aware launch, which is the third major risk area from the milestone roadmap.

## Steps

1. **Add `resolveContextAwareCwd()` to `src/cli-web-branch.ts`.** Create an exported function:

   ```typescript
   export function resolveContextAwareCwd(currentCwd: string, prefsPath: string): string {
     // 1. Try to read web-preferences.json synchronously
     //    - If file doesn't exist or is unreadable → return currentCwd unchanged
     // 2. Parse JSON, extract devRoot
     //    - If no devRoot field → return currentCwd unchanged
     // 3. Resolve both paths: resolvedCwd = resolve(currentCwd), resolvedDevRoot = resolve(devRoot)
     // 4. If resolvedDevRoot doesn't exist (stale path) → return currentCwd unchanged
     // 5. If resolvedCwd === resolvedDevRoot → return currentCwd unchanged (picker handles selection)
     // 6. If resolvedCwd starts with resolvedDevRoot + path.sep:
     //    - Extract the relative path from devRoot
     //    - Take just the first segment (one level deep)
     //    - Return join(resolvedDevRoot, firstSegment) as the project cwd
     // 7. Otherwise (cwd outside dev root) → return currentCwd unchanged
   }
   ```

   Import `readFileSync` from `node:fs` (check if already imported — `existsSync` is imported but `readFileSync` may not be), `sep` from `node:path`. Import `webPreferencesPath` from `./app-paths.js`.

2. **Wire `resolveContextAwareCwd()` into `runWebCliBranch()`.** After the existing cwd resolution block (line ~166-194 where `currentCwd` is set), add:

   ```typescript
   // Context-aware launch: if cwd is inside a project under the configured dev root,
   // resolve to the project directory so the browser opens directly into it
   currentCwd = resolveContextAwareCwd(currentCwd, deps.webPreferencesPath ?? webPreferencesPath)
   ```

   Add `webPreferencesPath?: string` to the `WebCliBranchDeps` interface so tests can inject a custom path.

3. **Add browser-side auto-initialization in `web/components/gsd/app-shell.tsx`.** In the `ProjectAwareWorkspace` component, add a `useEffect` that watches the workspace boot state. When boot completes and provides a `project.cwd`, if the manager has no active project yet, call `manager.switchProject(boot.project.cwd)`.

   The key references:
   - `useProjectStoreManager()` hook is already called → gives `manager`
   - `useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot)` is already called → gives `activeProjectCwd`
   - The active store is `manager.getActiveStore()` → its `boot?.project.cwd` has the launch project
   - Need to access the default store's boot payload to get the initial project cwd

   The current pattern: `ProjectAwareWorkspace` gets `manager` and `activeProjectCwd`. When `activeProjectCwd` is null (no project selected), `activeStore` is null and `GSDWorkspaceProvider` gets `store={undefined}` — creating an internal default store. That default store boots and gets `project.cwd` from the server.

   The cleanest approach: after the existing component body, add an effect that reads the default store's boot state. Since the default store is the one created by `GSDWorkspaceProvider` when no external store is provided, we need to access it. The simplest path is: create a child component `AutoProjectInitializer` inside `GSDWorkspaceProvider` that reads the workspace store via `useGSDWorkspace()`, and on boot completion calls `manager.switchProject(projectCwd)`. This runs once and then the manager has an active project.

   Actually, simpler: the default `GSDWorkspaceStore` created by `GSDWorkspaceProvider` when `store` is undefined — once boot payload arrives with `project.cwd`, the manager should auto-register it. Add this as a `useEffect` inside `WorkspaceChrome` (which has access to both the workspace store via `useGSDWorkspace()` and the manager via `useProjectStoreManager()`):

   ```tsx
   // Inside WorkspaceChrome or a new small wrapper:
   const manager = useProjectStoreManager()
   const workspace = useGSDWorkspace()
   const bootProjectCwd = workspace.boot?.project.cwd
   
   useEffect(() => {
     if (bootProjectCwd && !manager.getActiveProjectCwd()) {
       manager.switchProject(bootProjectCwd)
     }
   }, [bootProjectCwd, manager])
   ```

   Place this in `WorkspaceChrome` (which already has access to both contexts) or in a small `BootProjectInitializer` component rendered inside `ProjectAwareWorkspace` after the provider.

4. **Add contract tests to `src/tests/web-mode-cli.test.ts`.** Import `resolveContextAwareCwd` from the module. Add a test group:

   ```typescript
   test('resolveContextAwareCwd returns project cwd when inside a project under dev root', () => {
     // Create temp dirs: devRoot/projectA, devRoot/projectB
     // Write web-preferences.json with devRoot set
     // Call resolveContextAwareCwd(devRoot/projectA, prefsPath)
     // Assert returns devRoot/projectA
   })

   test('resolveContextAwareCwd returns cwd unchanged when AT dev root', () => {
     // cwd = devRoot itself → no change (browser picker handles it)
   })

   test('resolveContextAwareCwd returns cwd unchanged when no dev root configured', () => {
     // prefs file exists but no devRoot field → no change
   })

   test('resolveContextAwareCwd returns cwd unchanged when prefs file missing', () => {
     // prefsPath points to nonexistent file → no change
   })

   test('resolveContextAwareCwd returns cwd unchanged when dev root path is stale', () => {
     // devRoot points to nonexistent directory → no change
   })

   test('resolveContextAwareCwd resolves nested cwd to one-level-deep project', () => {
     // cwd = devRoot/projectA/src/nested → returns devRoot/projectA
   })

   test('resolveContextAwareCwd returns cwd unchanged when outside dev root', () => {
     // cwd = /tmp/somewhere → no change
   })
   ```

   Follow existing test patterns: use `mkdtempSync`, `mkdirSync`, `writeFileSync`, clean up with `rmSync` in try/finally.

5. **Run full test suite.** `npm run test:unit` — all tests pass including new ones.

6. **Run both builds.** `npm run build` and `npm run build:web-host` — both exit 0.

## Must-Haves

- [ ] `resolveContextAwareCwd()` exported from `cli-web-branch.ts`
- [ ] Called in `runWebCliBranch()` between cwd resolution and `launchWebMode()`
- [ ] Handles all edge cases: missing prefs, no devRoot, stale devRoot, cwd at devRoot, cwd outside devRoot, nested cwd
- [ ] Browser auto-initializes project manager with boot project cwd
- [ ] At least 5 contract tests covering context-aware launch edge cases
- [ ] `npm run test:unit` — all tests pass (existing + new)
- [ ] `npm run build` exits 0
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run test:unit -- --test-name-pattern "resolveContextAwareCwd"` — new tests pass
- `npm run test:unit` — full suite passes
- `npm run build` — exits 0
- `npm run build:web-host` — exits 0
- `grep "resolveContextAwareCwd" src/cli-web-branch.ts` — function defined and called
- `grep "switchProject\|bootProjectCwd\|getActiveProjectCwd" web/components/gsd/app-shell.tsx` — auto-init wired

## Inputs

- `src/cli-web-branch.ts` — the CLI web branch where cwd resolution happens (T01 completed, wizard step exists)
- `src/app-paths.ts` — `webPreferencesPath` export (from S02)
- `web/components/gsd/app-shell.tsx` — `ProjectAwareWorkspace` component with manager + store wiring (from S02)
- `web/lib/project-store-manager.tsx` — `ProjectStoreManager` with `switchProject()` and `getActiveProjectCwd()` (from S02)
- `src/tests/web-mode-cli.test.ts` — existing test file with `runWebCliBranch` test patterns

## Expected Output

- `src/cli-web-branch.ts` — modified with `resolveContextAwareCwd()` export and call site in `runWebCliBranch()`
- `web/components/gsd/app-shell.tsx` — modified with boot project auto-initialization
- `src/tests/web-mode-cli.test.ts` — modified with 5-7 new context-aware launch tests

## Observability Impact

- **CLI context-aware resolution:** `resolveContextAwareCwd()` runs synchronously during `runWebCliBranch()`. When cwd is resolved to a project under the dev root, the existing `[gsd] Using project path: ...` stderr line reflects the resolved project dir. When the dev root is unconfigured, missing, or stale, cwd passes through unchanged — no additional output.
- **Browser auto-initialization:** `BootProjectInitializer` calls `manager.switchProject(bootProjectCwd)` once on boot. The effect is observable via the `data-testid="workspace-project-cwd"` attribute in the header (reflects the active project path). If boot fails or returns no `project.cwd`, the initializer is a no-op.
- **Contract test coverage:** 7 tests exercise all edge cases of `resolveContextAwareCwd`. Test names are prefixed with `resolveContextAwareCwd` for targeted filtering via `--test-name-pattern`.
- **Failure states:** Malformed `web-preferences.json` (invalid JSON, wrong types, missing fields) is caught by try/catch and falls through silently — no crash, no spurious stderr output. Stale devRoot (directory deleted after prefs written) also falls through.
