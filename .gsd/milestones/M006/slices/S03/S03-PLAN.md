# S03: Onboarding dev root step, context-aware launch, and final assembly

**Goal:** First-time users select a dev root folder during onboarding. The preference persists across sessions. `gsd --web` from inside a project opens directly into it; from outside opens the project picker. The full multi-project flow works end-to-end.
**Demo:** A user completes onboarding with dev root selection → sees projects → switches between them. `gsd --web` from `~/Projects/foo` opens directly into `foo`. From `~/Projects` or `~` it opens the picker. A user who never configures a dev root sees zero regression.

## Must-Haves

- `step-dev-root.tsx` onboarding wizard step with text input for dev root path, calling `/api/preferences` PUT to persist
- Dev root step is skippable — users who skip get single-project behavior unchanged
- Wizard step ordering per D065: Welcome(0) → Provider(1) → Auth(2) → Dev Root(3) → Optional(4) → Ready(5)
- All existing wizard navigation (back/next/auto-advance) works correctly with 6 steps
- `resolveContextAwareCwd()` in `cli-web-branch.ts` reads `web-preferences.json` synchronously, detects if cwd is inside a project under the dev root
- Browser auto-initializes the project store manager with the boot project's cwd
- No regression: if no dev root is configured, single-project behavior is unchanged
- Stale dev root path handled gracefully (falls back to standard cwd)
- `npm run build`, `npm run build:web-host`, and all existing tests pass
- Contract tests proving context-aware launch detection logic

## Proof Level

- This slice proves: final-assembly
- Real runtime required: no (contract-level proof with builds)
- Human/UAT required: yes (full end-to-end flow is a UAT item per milestone definition)

## Verification

- `npm run test:unit -- --test-name-pattern "context-aware"` — new contract tests pass
- `npm run test:unit` — all 1215+ existing tests pass unchanged
- `npm run build` — TypeScript compilation exits 0
- `npm run build:web-host` — Next.js standalone build exits 0
- `curl localhost:$PORT/api/preferences` — returns `{}` or `{ devRoot: "..." }` confirming persistence surface is inspectable
- `grep -c "WIZARD_STEPS" web/components/gsd/onboarding-gate.tsx` — returns array with 6 entries
- `grep "step-dev-root" web/components/gsd/onboarding-gate.tsx` — import confirmed
- `grep "resolveContextAwareCwd" src/cli-web-branch.ts` — launch detection wired

## Observability / Diagnostics

- **Preference persistence:** `/api/preferences` GET returns `{ devRoot: string }` after onboarding — inspectable via `curl localhost:$PORT/api/preferences` or browser devtools network tab.
- **Wizard step telemetry:** Each step renders a `data-testid` attribute (`onboarding-devroot-continue`, `onboarding-devroot-skip`). Browser assertions can target these.
- **Context-aware launch:** `resolveContextAwareCwd()` logs to stderr when dev root is resolved vs. absent — visible in CLI output during `gsd --web`.
- **Failure visibility:** PUT failures surface as a loading→error state on the Continue button. Malformed `web-preferences.json` is handled gracefully (try/catch, fallback to empty).
- **Redaction:** No secrets involved. Dev root paths are user-chosen filesystem paths, not credentials.

## Integration Closure

- Upstream surfaces consumed: `/api/preferences` GET/PUT (S02), `ProjectStoreManager.switchProject()` (S02), `webPreferencesPath` from `app-paths.ts` (S02), `discoverProjects()` from `project-discovery-service.ts` (S02)
- New wiring introduced: `step-dev-root.tsx` wired into wizard at position 3, `resolveContextAwareCwd()` called in `runWebCliBranch()` before `launchWebMode()`, `ProjectAwareWorkspace` auto-initializes manager from boot payload
- What remains before the milestone is truly usable end-to-end: nothing — this slice completes M006

## Tasks

- [x] **T01: Create onboarding dev root wizard step and integrate into 6-step flow** `est:25m`
  - Why: Users need a way to set their dev root folder during first-time onboarding. The wizard currently has 5 steps; D065 requires dev root at position 3 (after auth, before optional integrations). The step must be skippable.
  - Files: `web/components/gsd/onboarding/step-dev-root.tsx`, `web/components/gsd/onboarding-gate.tsx`
  - Do: Create `step-dev-root.tsx` matching the existing step component pattern (onNext/onBack props, centered content, Lucide icons, shadcn Button). The step provides a text input for the dev root path, suggests common directories (~/Projects, ~/Developer, ~/Code), and calls `/api/preferences` PUT with `{ devRoot: path }` on submit. Add a "Skip" link that calls onNext without saving. Update `onboarding-gate.tsx`: add 6th entry to WIZARD_STEPS at index 3 (`{ id: "devRoot", label: "Dev Root", shortLabel: "Root" }`), insert the `stepIndex === 3` rendering block for StepDevRoot, shift Optional to `stepIndex === 4` with `onBack={() => paginate(3)}` and `onNext={() => paginate(5)}`, shift Ready to `stepIndex === 5`, update stepper visibility check from `stepIndex === 4` to `stepIndex === 5`.
  - Verify: `npm run build` and `npm run build:web-host` pass, `grep -c "devRoot" web/components/gsd/onboarding-gate.tsx` shows the new step wired
  - Done when: wizard has 6 steps, dev root step renders at position 3, skip works, `npm run build:web-host` exits 0

- [x] **T02: Add context-aware launch detection, browser auto-switch, and contract tests** `est:30m`
  - Why: `gsd --web` must detect if the user's cwd is inside a project under their configured dev root and open directly into that project. The browser must auto-initialize the project store manager with the launch project. Contract tests must prove the detection logic handles all edge cases.
  - Files: `src/cli-web-branch.ts`, `web/components/gsd/app-shell.tsx`, `src/tests/web-mode-cli.test.ts`
  - Do: (1) Add `resolveContextAwareCwd(currentCwd, prefsPath)` function to `cli-web-branch.ts` — reads `web-preferences.json` synchronously with try/catch for missing file, if devRoot exists and currentCwd starts with devRoot (after resolve), extract the one-level-deep project subdirectory as the cwd; if cwd IS the devRoot or outside it, return cwd unchanged. Call this in `runWebCliBranch()` between cwd resolution and `launchWebMode()`. (2) In `ProjectAwareWorkspace`, add a useEffect that watches the workspace store's boot payload — when boot completes and `project.cwd` is available but the manager has no active project, call `manager.switchProject(project.cwd)` to register the launch project. (3) Add contract tests to `web-mode-cli.test.ts`: cwd inside project under dev root → project cwd returned, cwd at dev root → unchanged, no dev root → unchanged, stale/missing dev root → unchanged, nested subdir → resolves to one-level-deep project. (4) Run `npm run test:unit` and both builds.
  - Verify: `npm run test:unit -- --test-name-pattern "context-aware"` passes, `npm run test:unit` all pass, `npm run build` exits 0, `npm run build:web-host` exits 0
  - Done when: context-aware launch tests pass, full test suite passes, both builds succeed, `grep "resolveContextAwareCwd" src/cli-web-branch.ts` confirms wiring

## Files Likely Touched

- `web/components/gsd/onboarding/step-dev-root.tsx` (new)
- `web/components/gsd/onboarding-gate.tsx`
- `src/cli-web-branch.ts`
- `web/components/gsd/app-shell.tsx`
- `src/tests/web-mode-cli.test.ts`
