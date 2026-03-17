# S03: Onboarding dev root step, context-aware launch, and final assembly — Research

**Date:** 2026-03-17
**Status:** Complete

## Summary

S03 is leaf-node work building on S01 (bridge registry, project-scoped APIs) and S02 (project discovery, store manager, Projects view). The three deliverables are: (1) an onboarding wizard step for dev root folder selection, (2) context-aware launch detection so `gsd --web` from inside a project opens directly into it, and (3) end-to-end assembly proof.

All backend infrastructure is already in place. `/api/preferences` GET/PUT exists and persists `devRoot` + `lastActiveProject` to `~/.gsd/web-preferences.json`. `/api/projects?root=` returns discovered projects. `ProjectStoreManager` manages per-project stores with SSE lifecycle. The onboarding wizard has a clean component-per-step pattern with a `WIZARD_STEPS` array and index-based navigation. The CLI launch path in `cli-web-branch.ts` resolves project cwd before calling `launchWebMode()`. Every piece needed is already exposed — this slice wires them together.

## Recommendation

**Build in three tasks: (1) onboarding step-dev-root component + wizard integration, (2) context-aware launch detection in cli-web-branch.ts, (3) contract test proving the launch detection logic + build verification.**

The wizard step is pure UI against existing APIs — low risk, no backend changes. Context-aware launch is the most architecturally interesting piece: `cli-web-branch.ts` must read `~/.gsd/web-preferences.json` synchronously, check if the current cwd is inside the stored dev root, and if so pass the cwd directly as the project. The contract test extends the existing `web-mode-cli.test.ts` pattern to prove the routing logic. No new server-side services are needed.

## Implementation Landscape

### Key Files

**Onboarding wizard step:**

- `web/components/gsd/onboarding-gate.tsx` — The wizard controller. `WIZARD_STEPS` array (line 30) currently has 5 entries: welcome(0), provider(1), authenticate(2), optional(3), ready(4). Per D065, dev root goes after auth: welcome(0), provider(1), authenticate(2), **dev-root(3)**, optional(4), ready(5). All `stepIndex` references in paginate calls, auto-advance effects, and step content rendering need index adjustment. The `paginate()` calls in each step's `onNext`/`onBack` use hardcoded numbers.
- `web/components/gsd/onboarding/step-dev-root.tsx` — **New file.** Dev root selection step. Calls `/api/preferences` PUT to persist. Must be skippable (D065) — users who don't want multi-project skip it and get single-project behavior. Existing step components (`step-welcome.tsx`, `step-ready.tsx`) show the pattern: receive `onNext`/`onBack` props, render centered content with Lucide icons, use shadcn Button for navigation.
- `web/components/gsd/onboarding/wizard-stepper.tsx` — No changes needed — it renders whatever `WIZARD_STEPS` contains.

**Context-aware launch:**

- `src/cli-web-branch.ts` — `runWebCliBranch()` (line 105) resolves `currentCwd` from `flags.webPath` or `defaultCwd`, then calls `launchWebMode()`. Context-aware launch adds logic between cwd resolution and launch: (a) read `~/.gsd/web-preferences.json`, (b) if cwd is the dev root or outside any project, pass the dev root as a signal (the browser picker handles project selection), (c) if cwd is inside a known project under the dev root, pass cwd directly (direct entry). The file already imports `existsSync`, `join`, `resolve` — needs `readFileSync` addition.
- `src/app-paths.ts` — Already exports `webPreferencesPath` pointing to `~/.gsd/web-preferences.json`. Used by cli-web-branch for synchronous preference reading.
- `src/web-mode.ts` — `launchWebMode()` sets `GSD_WEB_PROJECT_CWD` in the spawned process env (line 649). No changes needed — cli-web-branch resolves the correct cwd before passing it here.

**Browser-side auto-switch on launch:**

- `web/components/gsd/app-shell.tsx` — `ProjectAwareWorkspace` (line ~340) reads the active store from the manager. When the workspace boots with a specific `project.cwd` in the boot payload, the manager should auto-switch to that project. This is the bridge between server-side "launched with this cwd" and browser-side "show this project's workspace."
- `web/lib/gsd-workspace-store.tsx` — Boot payload contains `project.cwd` (type `BridgeRuntimeSnapshot.projectCwd`, line 114). The initial `GSDWorkspaceStore` created without a `projectCwd` constructor arg boots with the env-based default — this is the launch project. `ProjectAwareWorkspace` can read this from the boot payload and call `manager.switchProject()` if no project is active yet.

**Existing test infrastructure:**

- `src/tests/web-mode-cli.test.ts` (543 lines) — Tests `runWebCliBranch()` with fake `runWebMode` deps. Already tests `--web <path>`, `gsd web start <path>`, and cwd resolution. Context-aware launch tests extend this by injecting a fake `webPreferencesPath` with a dev root set.

### Build Order

**T01 — Onboarding dev root wizard step.** Create `step-dev-root.tsx` component. Update `onboarding-gate.tsx` WIZARD_STEPS to 6 entries, adjust all step index numbers. The step shows a text input (or informational prompt) for the dev root path, calls `/api/preferences` PUT to save it. Skippable with a "Skip" link. Verify: `npm run build` passes, the component compiles.

**T02 — Context-aware launch detection.** Add `resolveContextAwareCwd()` function to `cli-web-branch.ts` that reads `webPreferencesPath` synchronously, checks if the current cwd is inside the dev root (simple `startsWith` after `resolve()`), and returns the appropriate cwd. If cwd IS inside a subdirectory of devRoot (one level deep) → use that subdirectory as the project cwd. If cwd IS the dev root itself or outside → use cwd as-is (the browser's ProjectsView handles project selection). If no dev root configured → single-project behavior unchanged. Add browser-side auto-switch in `ProjectAwareWorkspace` so the boot payload's `project.cwd` triggers `manager.switchProject()`. Verify: `npm run build` passes.

**T03 — Contract tests and final assembly proof.** Add tests to `web-mode-cli.test.ts` (or a new file) proving: (a) cwd inside project under dev root → direct entry, (b) cwd at dev root → no change (picker), (c) no dev root configured → backward-compatible, (d) stale dev root path → graceful fallback. Run full test suite and both builds.

### Verification Approach

- `npm run build` — TypeScript compilation passes with new components
- `npm run build:web-host` — Next.js standalone build passes, new wizard step compiles
- `npm run test:unit` — All 1215+ existing tests pass, new context-aware launch tests pass
- `grep -c "WIZARD_STEPS" web/components/gsd/onboarding-gate.tsx` — Confirms 6-step array
- `grep "step-dev-root" web/components/gsd/onboarding-gate.tsx` — Confirms import wired
- `grep "resolveContextAwareCwd\|webPreferencesPath" src/cli-web-branch.ts` — Confirms launch detection wired

## Constraints

- **D065 step ordering:** Welcome → Provider → Auth → Dev Root → Optional → Ready. Dev root must come after auth so the workspace is ready to scan. Dev root must be skippable.
- **Synchronous preference read in CLI:** `cli-web-branch.ts` runs before the web host starts — it must read `web-preferences.json` synchronously with `readFileSync`. The file may not exist (first-time user) — handle gracefully.
- **Backward compatibility:** If no dev root is configured, the entire context-aware launch path is a no-op. Single-project behavior must be preserved exactly.
- **No native file picker in browser:** The onboarding step runs inside a web page — there's no native directory picker. The step must use a text input for the path, or show a curated suggestion (e.g., detecting `~/Projects`, `~/Developer`, `~/Code`). This is the same pattern as entering an API key — a text field with validation.

## Common Pitfalls

- **Off-by-one in wizard step indexes.** Every `paginate(N)` call in `onboarding-gate.tsx` uses hardcoded numbers. Adding a step at position 3 means: optional moves to 4, ready moves to 5. The auto-advance `useEffect` (line ~97) that checks `stepIndex === 2` for auth completion must still jump to optional (now 4, not 3). Miss one and the wizard navigation breaks.
- **Stale dev root path.** If the user renames `~/Projects` to `~/Code`, the stored preference is invalid. `resolveContextAwareCwd()` must handle a missing/unreadable dev root gracefully — fall back to standard cwd behavior, don't error.
- **cwd detection false positive.** If the user's cwd is `/Users/foo/Projects/subdir/nested`, the detection should find the project at `/Users/foo/Projects/subdir`, not try to use `nested` as a project. The detection should look one level deep from the dev root only, matching the `discoverProjects()` scan depth.

## Open Risks

- **Text input UX for dev root path.** Users may mistype or use `~` (which doesn't expand in browser JS). The step should expand `~` to the actual home directory server-side via the `/api/preferences` PUT handler, or document that full paths are required. Server-side expansion is cleaner.

## Sources

- `web/components/gsd/onboarding-gate.tsx` — wizard controller with 5-step flow and step index navigation
- `web/components/gsd/onboarding/step-welcome.tsx` — step component pattern reference
- `src/cli-web-branch.ts` — CLI web branch with cwd resolution and `runWebCliBranch()`
- `src/web-mode.ts` — `launchWebMode()` with `GSD_WEB_PROJECT_CWD` env var setup
- `src/app-paths.ts` — `webPreferencesPath` export
- `web/app/api/preferences/route.ts` — existing GET/PUT for dev root persistence
- `web/lib/project-store-manager.tsx` — `ProjectStoreManager` with `switchProject()` and `useProjectStoreManager()` hook
- `web/components/gsd/app-shell.tsx` — `ProjectAwareWorkspace` bridge component
- `src/tests/web-mode-cli.test.ts` — existing CLI test patterns for `runWebCliBranch()`
