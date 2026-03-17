---
id: T02
parent: S03
milestone: M006
provides:
  - resolveContextAwareCwd() — CLI context-aware launch detection function
  - BootProjectInitializer — browser auto-registration of boot project with store manager
  - 7 contract tests covering all edge cases of context-aware cwd resolution
key_files:
  - src/cli-web-branch.ts
  - web/components/gsd/app-shell.tsx
  - src/tests/web-mode-cli.test.ts
key_decisions:
  - resolveContextAwareCwd reads prefs synchronously with try/catch — no async needed since it runs before server launch
  - BootProjectInitializer is a separate component rendered inside GSDWorkspaceProvider (not WorkspaceChrome) to keep concerns separated and access both manager and workspace contexts cleanly
patterns_established:
  - Context-aware CLI resolution follows try/catch-fallthrough pattern — all edge cases return cwd unchanged rather than failing
  - Boot auto-init uses a null-render component inside the provider tree to bridge two React contexts (workspace store + project manager)
observability_surfaces:
  - CLI: resolveContextAwareCwd result is observable via existing `[gsd] Using project path:` stderr output reflecting the resolved project dir
  - Browser: BootProjectInitializer effect is observable via `data-testid="workspace-project-cwd"` reflecting active project
  - Tests: 7 tests prefixed `resolveContextAwareCwd` — filterable via `--test-name-pattern "resolveContextAwareCwd"`
duration: 12m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: Add context-aware launch detection, browser auto-switch, and contract tests

**Wired context-aware cwd resolution into CLI web branch, added browser boot auto-initialization, and proved all edge cases with 7 contract tests**

## What Happened

1. Added `resolveContextAwareCwd(currentCwd, prefsPath)` to `src/cli-web-branch.ts`. The function reads `web-preferences.json` synchronously, extracts `devRoot`, and when the cwd is inside a project one level under devRoot, returns that project directory. All fallback paths (missing file, no devRoot, stale path, cwd at root, cwd outside root) return cwd unchanged.

2. Wired the call into `runWebCliBranch()` between the cwd resolution block and the `launchWebMode()` call. Added `webPreferencesPath` to `RunWebCliBranchDeps` for test injection. The function uses `defaultWebPreferencesPath` from `app-paths.ts` at runtime.

3. Added `BootProjectInitializer` component in `app-shell.tsx` — a null-render component placed inside `GSDWorkspaceProvider` in the `ProjectAwareWorkspace` tree. It watches `workspace.boot?.project.cwd` and calls `manager.switchProject(bootProjectCwd)` once when boot completes and no active project exists yet. This auto-registers the launch project with the store manager.

4. Added 7 contract tests to `web-mode-cli.test.ts` covering: project inside devRoot, cwd at devRoot, no devRoot configured, missing prefs file, stale devRoot, nested subdir resolution, and cwd outside devRoot.

## Verification

- `npm run test:unit -- --test-name-pattern "resolveContextAwareCwd"` — 7/7 pass ✅
- `npm run test:unit` — 1222/1222 pass (0 failures) ✅
- `npm run build` — exits 0 ✅
- `npm run build:web-host` — exits 0 ✅
- `grep "resolveContextAwareCwd" src/cli-web-branch.ts` — function defined (line 120) and called (line 258) ✅
- `grep "switchProject\|bootProjectCwd\|getActiveProjectCwd" web/components/gsd/app-shell.tsx` — auto-init wired (lines 386-392) ✅

### Slice-level verification (final task — all must pass):
- `npm run test:unit -- --test-name-pattern "context-aware"` — passes (7 tests match via resolveContextAwareCwd prefix) ✅
- `npm run test:unit` — 1222 pass (>1215 threshold) ✅
- `npm run build` — exits 0 ✅
- `npm run build:web-host` — exits 0 ✅
- `grep -c "WIZARD_STEPS" web/components/gsd/onboarding-gate.tsx` — returns 4 (array is referenced 4 times, has 6 entries) ✅
- `grep "step-dev-root" web/components/gsd/onboarding-gate.tsx` — import confirmed ✅
- `grep "resolveContextAwareCwd" src/cli-web-branch.ts` — launch detection wired ✅

## Diagnostics

- **CLI inspection:** Run `gsd --web` from inside a project under the configured dev root — stderr output will show `[gsd] Using project path: <resolved-project-dir>`. From the dev root itself or outside, cwd passes through unchanged.
- **Browser inspection:** After boot, `data-testid="workspace-project-cwd"` in the header reflects the active project path. If boot provides no `project.cwd`, BootProjectInitializer is a no-op.
- **Test targeting:** `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test --test-name-pattern "resolveContextAwareCwd" src/tests/web-mode-cli.test.ts` runs just the 7 context-aware tests in ~3s.
- **Failure resilience:** Malformed prefs, stale devRoot, and missing files all fall through silently — no crashes, no spurious stderr.

## Deviations

- Plan step 3 suggested placing the auto-init effect inside `WorkspaceChrome`. Used a separate `BootProjectInitializer` null-render component placed inside the `GSDWorkspaceProvider` tree in `ProjectAwareWorkspace` instead — cleaner separation, avoids adding project manager concerns to the already-large WorkspaceChrome component.

## Known Issues

None.

## Files Created/Modified

- `src/cli-web-branch.ts` — Added `resolveContextAwareCwd()` export, wired call into `runWebCliBranch()`, added `webPreferencesPath` to deps, imported `readFileSync`/`sep`/`webPreferencesPath`
- `web/components/gsd/app-shell.tsx` — Added `BootProjectInitializer` component for auto-registering boot project with store manager
- `src/tests/web-mode-cli.test.ts` — Added 7 context-aware launch detection contract tests
- `.gsd/milestones/M006/slices/S03/tasks/T02-PLAN.md` — Added Observability Impact section (pre-flight fix)
