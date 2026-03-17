---
estimated_steps: 5
estimated_files: 2
---

# T01: Create onboarding dev root wizard step and integrate into 6-step flow

**Slice:** S03 — Onboarding dev root step, context-aware launch, and final assembly
**Milestone:** M006

## Description

Create the `step-dev-root.tsx` onboarding wizard step and integrate it into the existing wizard at position 3 (per D065: Welcome → Provider → Auth → **Dev Root** → Optional → Ready). The step lets users enter their development root folder path and persists it via `/api/preferences` PUT. The step must be skippable for users who want single-project behavior.

This is pure frontend work against existing APIs — no backend changes. The main risk is getting all the hardcoded step index numbers in `onboarding-gate.tsx` correct after inserting a new step.

**Relevant skill:** `frontend-design` — load for UI component patterns.

## Steps

1. **Read existing step components for the pattern.** `step-welcome.tsx` and `step-optional.tsx` show the interface: receive `onNext`/`onBack` props, render centered content with Lucide icons, use shadcn `Button` for navigation. The component uses `"use client"` directive. Follow the exact same structure and styling conventions (Tailwind classes, spacing, typography hierarchy).

2. **Create `web/components/gsd/onboarding/step-dev-root.tsx`.** The component:
   - Props: `{ onNext: () => void; onBack: () => void }`
   - Shows a heading ("Choose your dev root") and description explaining this is the folder containing their projects
   - Provides a text input (shadcn `Input`) for the path, with placeholder like `/Users/you/Projects`
   - Shows suggested paths as clickable chips/buttons: `~/Projects`, `~/Developer`, `~/Code`, `~/dev` — clicking one fills the input
   - On submit (Continue button): calls `fetch("/api/preferences", { method: "PUT", body: JSON.stringify({ devRoot: inputValue }) })` then calls `onNext()`
   - Has a "Skip for now" link/button that calls `onNext()` without saving — users who skip get single-project behavior
   - Input validation: non-empty path if they choose to enter one (skip bypasses validation)
   - Loading state on the Continue button during the PUT call
   - Style consistency: match the tone and spacing of `step-welcome.tsx` and `step-optional.tsx`

3. **Update `web/components/gsd/onboarding-gate.tsx` — add 6th wizard step.** This is the highest-risk step. Changes needed:
   - Add import: `import { StepDevRoot } from "./onboarding/step-dev-root"`
   - Add entry to `WIZARD_STEPS` array at index 3: `{ id: "devRoot", label: "Dev Root", shortLabel: "Root" }`
   - The array becomes 6 entries: welcome(0), provider(1), authenticate(2), devRoot(3), optional(4), ready(5)
   - All downstream `paginate()` calls and `stepIndex ===` checks must shift:
     - `stepIndex === 0`: StepWelcome → `paginate(1)` — **unchanged**
     - `stepIndex === 1`: StepProvider → `paginate(2)` / `onBack: paginate(0)` — **unchanged**
     - `stepIndex === 2`: StepAuthenticate → `onBack: paginate(1)`, `onNext: paginate(3)` — **unchanged** (was paginate(3))
     - **NEW** `stepIndex === 3`: StepDevRoot → `onBack: paginate(2)`, `onNext: paginate(4)`
     - `stepIndex === 4`: StepOptional → `onBack: paginate(3)`, `onNext: paginate(5)` — **changed** from index 3 with paginate(2)/paginate(4)
     - `stepIndex === 5`: StepReady — **changed** from index 4
   - Auto-advance effect (line ~111): currently checks `stepIndex === 2` and calls `paginate(3)`. After the change, this still checks `stepIndex === 2` and should call `paginate(3)` (jumping to dev root step after auth auto-completes). This is correct — no change needed here.
   - Stepper visibility (line ~167): currently hides stepper when `stepIndex === 0 || stepIndex === 4`. Change `stepIndex === 4` to `stepIndex === 5` (Ready is now at index 5).
   - Dot indicators at bottom (line ~297): use `WIZARD_STEPS.map` so they auto-expand — no change needed.

4. **Verify builds pass.** Run `npm run build` and `npm run build:web-host`.

5. **Spot-check wiring.** Run `grep -c "WIZARD_STEPS" web/components/gsd/onboarding-gate.tsx` (expect 6-entry array), `grep "step-dev-root\|StepDevRoot" web/components/gsd/onboarding-gate.tsx` (confirm import + usage).

## Must-Haves

- [ ] `step-dev-root.tsx` exists with text input, suggestions, skip, and `/api/preferences` PUT call
- [ ] `WIZARD_STEPS` array has 6 entries with devRoot at index 3
- [ ] All paginate() calls use correct index numbers for the 6-step flow
- [ ] Auto-advance after auth still jumps correctly (to dev root step, index 3)
- [ ] Stepper visibility hides on Welcome(0) and Ready(5), not Ready(4)
- [ ] `npm run build` exits 0
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build` — TypeScript compilation passes with new component
- `npm run build:web-host` — Next.js standalone build passes
- `grep "devRoot" web/components/gsd/onboarding-gate.tsx` — shows WIZARD_STEPS entry and rendering block
- `grep "StepDevRoot" web/components/gsd/onboarding-gate.tsx` — shows import and usage
- Count WIZARD_STEPS entries = 6

## Inputs

- `web/components/gsd/onboarding/step-welcome.tsx` — pattern reference for step component structure
- `web/components/gsd/onboarding/step-optional.tsx` — pattern reference for step with onBack/onNext
- `web/components/gsd/onboarding-gate.tsx` — wizard controller to modify (currently 5 steps)
- `/api/preferences` route already exists (S02) — accepts PUT with `{ devRoot: string }`
- D065 — step ordering: Welcome → Provider → Auth → Dev Root → Optional → Ready

## Observability Impact

- **New data-testid attributes:** `onboarding-devroot-continue`, `onboarding-devroot-skip`, `onboarding-devroot-input` — usable for browser assertions and future E2E tests.
- **Network signal:** Successful PUT to `/api/preferences` with `{ devRoot: "..." }` is visible in browser devtools Network tab and confirms the step persisted correctly.
- **Error surface:** If PUT fails, the Continue button shows a loading spinner and the error is caught (no silent failure). Console will show a fetch error if the API is unreachable.
- **Wizard step count:** `WIZARD_STEPS.length === 6` is a compile-time-visible invariant. Grep verification confirms the array grew correctly.

## Expected Output

- `web/components/gsd/onboarding/step-dev-root.tsx` — new onboarding step component
- `web/components/gsd/onboarding-gate.tsx` — modified with 6-step flow, StepDevRoot at index 3
