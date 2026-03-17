---
id: T01
parent: S03
milestone: M006
provides:
  - step-dev-root.tsx onboarding wizard step with text input, suggestions, skip, and /api/preferences PUT
  - 6-step wizard flow in onboarding-gate.tsx with devRoot at index 3
key_files:
  - web/components/gsd/onboarding/step-dev-root.tsx
  - web/components/gsd/onboarding-gate.tsx
key_decisions:
  - PUT sends only devRoot (no merge needed — onboarding is first-run, no prior prefs exist)
patterns_established:
  - Onboarding step components follow onNext/onBack prop pattern with data-testid attributes for observability
observability_surfaces:
  - data-testid="onboarding-devroot-input", "onboarding-devroot-continue", "onboarding-devroot-skip" for browser assertions
  - PUT /api/preferences with { devRoot } visible in network tab
  - Console error "[onboarding] devRoot PUT failed:" on save failure
duration: 8m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Create onboarding dev root wizard step and integrate into 6-step flow

**Created `step-dev-root.tsx` and wired it into the onboarding wizard at position 3, expanding from 5 to 6 steps.**

## What Happened

Created `step-dev-root.tsx` following the existing step component pattern (onNext/onBack props, centered layout, Lucide icons, shadcn components). The step renders a FolderRoot icon, heading, description, a mono-font text input for the path, four clickable suggestion chips (`~/Projects`, `~/Developer`, `~/Code`, `~/dev`), and navigation with Back/Skip/Continue buttons. Continue calls `PUT /api/preferences` with `{ devRoot: path }` and shows a loading spinner. Skip calls `onNext()` directly. Input validation prevents empty-path submission (skip bypasses it). Error state renders below the input.

Updated `onboarding-gate.tsx`: added `StepDevRoot` import, inserted `{ id: "devRoot", label: "Dev Root", shortLabel: "Root" }` at WIZARD_STEPS index 3, added `stepIndex === 3` rendering block, shifted StepOptional to index 4 with paginate(3)/paginate(5), shifted StepReady to index 5, updated stepper visibility from `stepIndex === 4` to `stepIndex === 5`. Auto-advance after auth (stepIndex === 2 → paginate(3)) correctly jumps to the new dev root step.

## Verification

- `npm run build` — exits 0 (TypeScript compilation passes)
- `npm run build:web-host` — exits 0 (Next.js standalone build passes)
- WIZARD_STEPS array has 6 `id:` entries confirmed by grep
- `grep "StepDevRoot"` shows import at line 25 and usage at line 272
- `grep "devRoot"` shows WIZARD_STEPS entry at line 35
- Stepper visibility check uses `stepIndex === 5` (Ready at new index)
- Auto-advance effect unchanged — still checks `stepIndex === 2` and calls `paginate(3)`

## Diagnostics

- Browser: `data-testid="onboarding-devroot-input"` targets the path input, `data-testid="onboarding-devroot-continue"` the save button, `data-testid="onboarding-devroot-skip"` the skip link.
- Network: PUT to `/api/preferences` with `Content-Type: application/json` body `{ devRoot: "..." }` — 200 on success, 500 with `{ error: "..." }` on failure.
- Console: `[onboarding] devRoot PUT failed: <error>` logged on save failure.

## Deviations

None.

## Known Issues

- The `/api/preferences` PUT overwrites the entire preferences file rather than merging. During onboarding this is safe (no prior prefs exist), but if a future step also writes preferences concurrently, this could cause data loss. T02 or later should consider a PATCH-style merge if needed.

## Files Created/Modified

- `web/components/gsd/onboarding/step-dev-root.tsx` — new onboarding wizard step for dev root path selection
- `web/components/gsd/onboarding-gate.tsx` — expanded from 5 to 6 wizard steps with StepDevRoot at index 3
- `.gsd/milestones/M006/slices/S03/S03-PLAN.md` — added Observability/Diagnostics section, diagnostic verification step, marked T01 done
- `.gsd/milestones/M006/slices/S03/tasks/T01-PLAN.md` — added Observability Impact section
- `.gsd/STATE.md` — updated next action to T02
