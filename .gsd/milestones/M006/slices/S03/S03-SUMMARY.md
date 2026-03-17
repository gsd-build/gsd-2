---
id: S03
parent: M006
milestone: M006
provides:
  - step-dev-root.tsx — onboarding wizard step for dev root folder selection with text input, suggestion chips, skip, and /api/preferences PUT
  - 6-step onboarding wizard flow with devRoot at position 3 (Welcome → Provider → Auth → Dev Root → Optional → Ready)
  - resolveContextAwareCwd() — CLI launch detection that routes cwd-inside-project to the project dir
  - BootProjectInitializer — browser auto-registration of boot project with ProjectStoreManager
  - 7 contract tests covering all edge cases of context-aware cwd resolution
requires:
  - slice: S02
    provides: /api/preferences GET/PUT route, ProjectStoreManager with switchProject(), webPreferencesPath from app-paths.ts, discoverProjects() from project-discovery-service.ts
affects: []
key_files:
  - web/components/gsd/onboarding/step-dev-root.tsx
  - web/components/gsd/onboarding-gate.tsx
  - src/cli-web-branch.ts
  - web/components/gsd/app-shell.tsx
  - src/tests/web-mode-cli.test.ts
key_decisions:
  - Onboarding dev root step is skippable — skip calls onNext() without persisting, preserving single-project backward compatibility
  - PUT /api/preferences overwrites entire file (safe during onboarding since no prior prefs exist)
  - resolveContextAwareCwd reads prefs synchronously with try/catch — all failure paths return cwd unchanged
  - BootProjectInitializer is a null-render component inside GSDWorkspaceProvider, bridging workspace and project manager contexts cleanly
patterns_established:
  - Context-aware CLI resolution uses try/catch-fallthrough — every edge case returns cwd unchanged rather than failing
  - Boot auto-init uses a null-render component inside the provider tree to bridge two React contexts
  - Onboarding step components follow onNext/onBack prop pattern with data-testid attributes for observability
observability_surfaces:
  - data-testid="onboarding-devroot-input", "onboarding-devroot-continue", "onboarding-devroot-skip" for browser assertions
  - PUT /api/preferences with { devRoot } visible in network tab
  - Console error "[onboarding] devRoot PUT failed:" on save failure
  - CLI resolveContextAwareCwd result observable via stderr "[gsd] Using project path:" output
  - BootProjectInitializer effect observable via data-testid="workspace-project-cwd" in header
drill_down_paths:
  - .gsd/milestones/M006/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M006/slices/S03/tasks/T02-SUMMARY.md
duration: 20m
verification_result: passed
completed_at: 2026-03-17
---

# S03: Onboarding dev root step, context-aware launch, and final assembly

**Dev root folder selection in onboarding, context-aware CLI launch detection, and browser boot auto-initialization complete the multi-project workspace end-to-end flow.**

## What Happened

T01 created `step-dev-root.tsx` — a new onboarding wizard step at position 3 (after auth, before optional integrations) that lets users type or select a dev root path from four suggestion chips (`~/Projects`, `~/Developer`, `~/Code`, `~/dev`). Continue calls `PUT /api/preferences` with `{ devRoot: path }` and shows a loading spinner; Skip bypasses without saving. The wizard in `onboarding-gate.tsx` expanded from 5 to 6 steps with correct auto-advance wiring from auth → dev root.

T02 added `resolveContextAwareCwd()` to `cli-web-branch.ts` — a synchronous function that reads `web-preferences.json`, extracts `devRoot`, and when the cwd is inside a one-level-deep project under that root, returns the project directory. All failure paths (missing file, no devRoot, stale path, cwd at root, cwd outside root) return cwd unchanged. The function is called in `runWebCliBranch()` between cwd resolution and `launchWebMode()`. In the browser, `BootProjectInitializer` — a null-render component inside `GSDWorkspaceProvider` — watches the boot payload and calls `manager.switchProject(bootProjectCwd)` once on first boot to register the launch project with the store manager. Seven contract tests prove all edge cases.

Together, these complete the M006 multi-project flow: onboarding → dev root selection → project discovery → Projects view → project switching with background sessions → context-aware launch.

## Verification

- `npm run build` — exits 0 ✅
- `npm run build:web-host` — exits 0 (Next.js standalone build) ✅
- `npm run test:unit` — 1222/1222 pass (0 failures, >1215 threshold) ✅
- `node ... --test-name-pattern "resolveContextAwareCwd"` — 7/7 pass ✅
- WIZARD_STEPS array has 6 `id:` entries ✅
- `grep "step-dev-root"` confirms import in onboarding-gate.tsx ✅
- `grep "resolveContextAwareCwd"` confirms definition (line 120) and call site (line 258) in cli-web-branch.ts ✅
- Three data-testid attributes present in step-dev-root.tsx ✅
- BootProjectInitializer wired in app-shell.tsx with switchProject call ✅

## Requirements Advanced

- R020 (multi-project workspace) — S03 completes the final assembly: onboarding dev root step, context-aware launch detection, and browser boot auto-initialization. All three slices are done.

## Requirements Validated

- R020 (multi-project workspace) — All contract-level proofs pass: bridge registry (S01), project-scoped API (S01), project discovery (S02), Projects view (S02), store isolation with SSE lifecycle (S02), onboarding dev root step (S03), context-aware launch detection with 7 edge-case tests (S03), browser boot auto-init (S03). Both builds succeed. 1222 tests pass. UAT remains for final human acceptance.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- T02: Plan suggested placing auto-init effect inside `WorkspaceChrome`. Used a separate `BootProjectInitializer` null-render component inside `GSDWorkspaceProvider` instead — cleaner separation of concerns, avoids adding project manager logic to the already-large WorkspaceChrome component.

## Known Limitations

- PUT /api/preferences overwrites the entire file rather than merging. Safe during onboarding (no prior prefs exist), but if a future feature writes preferences from a different path concurrently, data could be lost. A PATCH-style merge would be needed then.
- Dev root step provides a text input, not a native folder picker. Browser security prevents `<input type="file" webkitdirectory>` from returning the actual path. The suggestion chips mitigate this by offering common defaults.
- Context-aware launch resolves to one level deep under dev root. Deeper project nesting (e.g., `~/Projects/org/repo`) is not detected as a distinct project — the resolution stops at the first level (`~/Projects/org`).
- UAT (human end-to-end acceptance) is scripted but not yet executed — that's the milestone-level final gate.

## Follow-ups

- none — this slice completes M006's task-level scope. The remaining gate is human UAT execution per the milestone definition of done.

## Files Created/Modified

- `web/components/gsd/onboarding/step-dev-root.tsx` — new onboarding wizard step for dev root path selection
- `web/components/gsd/onboarding-gate.tsx` — expanded from 5 to 6 wizard steps with StepDevRoot at index 3
- `src/cli-web-branch.ts` — added resolveContextAwareCwd() export and wired into runWebCliBranch()
- `web/components/gsd/app-shell.tsx` — added BootProjectInitializer component for auto-registering boot project
- `src/tests/web-mode-cli.test.ts` — added 7 context-aware launch detection contract tests

## Forward Intelligence

### What the next slice should know
- M006 is architecturally complete. All three slices delivered: bridge registry (S01), project discovery + Projects view + store isolation (S02), onboarding + context-aware launch + boot init (S03). The remaining milestone gate is human UAT.
- The multi-project architecture follows a clear layering: CLI resolves project cwd → host launches with project-scoped bridge → browser auto-registers boot project → user switches via Projects view → each project gets independent store + SSE.

### What's fragile
- Preference file PUT is a full overwrite, not a merge — concurrent writes from different sources would conflict. Currently safe because only one writer exists (onboarding step), but adding more preference consumers requires migrating to read-modify-write.
- One-level-deep project resolution in `resolveContextAwareCwd` is an intentional simplification. Users with `~/Projects/org/repo` structures would need the function updated to walk deeper or use a different heuristic.

### Authoritative diagnostics
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test --test-name-pattern "resolveContextAwareCwd" src/tests/web-mode-cli.test.ts` — the fastest way to verify context-aware launch logic (7 tests, ~3s)
- `grep "data-testid" web/components/gsd/onboarding/step-dev-root.tsx` — confirms all three browser assertion targets exist
- `/api/preferences` GET after onboarding — returns `{ devRoot: "..." }` confirming persistence

### What assumptions changed
- No assumptions changed. The slice plan accurately predicted the scope and complexity. The only deviation was component placement (BootProjectInitializer as separate component vs. inline in WorkspaceChrome), which was a localized improvement.
