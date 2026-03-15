---
estimated_steps: 4
estimated_files: 3
---

# T02: Add recovery affordances, power mode controls, and view persistence

**Slice:** S06 — Power mode + continuity + failure visibility
**Milestone:** M001

## Description

The error banner in app-shell shows errors as passive text with no recovery action. Power mode (dual-terminal) has no workflow controls — it's a passive viewer while dashboard and sidebar have full action bars. Active view resets to dashboard on every refresh. This task adds a retry button to the error banner, a workflow action bar to power mode, and sessionStorage-based view persistence.

## Steps

1. In `app-shell.tsx`, extend the error banner `div` (the one showing `visibleError`) with a "Retry" button beside the error text. The button calls `refreshBoot()` from `useGSDWorkspaceActions()`. Disable the button when `commandInFlight` is set or `onboardingRequestState` is not `idle`. Style: small secondary button matching the existing skin (`text-xs`, border, bg-background).
2. In `dual-terminal.tsx`, add a workflow action bar in the header area between "Power User Mode" label and the left/right labels. Import `deriveWorkflowAction` from `workflow-actions.ts` and wire the same pattern as `dashboard.tsx`: primary button with destructive variant support, commandInFlight spinner, disabled state with reason. The action bar should be compact (inline in the header) since power mode space is at a premium.
3. In `app-shell.tsx`, persist `activeView` to sessionStorage on change and restore on mount:
   - Key: `gsd-active-view:${projectCwd}` where `projectCwd` comes from `workspace.boot?.project.cwd`
   - On mount: read from sessionStorage, validate it's a known view name, and set as initial state
   - On view change: write to sessionStorage
   - Use a `useEffect` for the write side, and a lazy initializer for `useState` for the read side
   - Since `boot` may not be available on first render, start with `"dashboard"` and update once boot loads and a stored view is found
4. Run `npm run build:web-host` to verify all changes compile. Run the continuity contract test to confirm no regressions.

## Must-Haves

- [ ] Error banner shows a retry button that calls `refreshBoot()` and is disabled during command-in-flight or active onboarding request
- [ ] Power mode has an integrated workflow action bar using `deriveWorkflowAction`
- [ ] Active view persists across refresh via sessionStorage keyed by project cwd
- [ ] Build passes cleanly

## Verification

- `npm run build:web-host` — builds cleanly with all modified components
- `node --test --experimental-strip-types src/tests/web-continuity-contract.test.ts` — still passes
- `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts` — still passes

## Inputs

- `web/components/gsd/app-shell.tsx` — current error banner (passive text), view state management (`useState("dashboard")`)
- `web/components/gsd/dual-terminal.tsx` — current power mode header with no workflow controls
- `web/lib/workflow-actions.ts` — `deriveWorkflowAction` pure function (D018)
- `web/components/gsd/dashboard.tsx` — action bar pattern to mirror in power mode
- T01 output: hardened store with `refreshBoot` that resyncs on reconnect

## Observability Impact

- `data-testid="workspace-error-banner"` now contains a retry button — agents can verify recovery affordance exists by checking for a button child element
- `data-testid="power-mode-action-bar"` — new test ID on the workflow action bar in power mode header, inspectable the same way as `data-testid="dashboard-action-bar"`
- `sessionStorage` key `gsd-active-view:${projectCwd}` — persists active view across refresh; agents can read this to verify view persistence
- On failure: error banner retry button disabled state is observable via `commandInFlight` and `onboardingRequestState` in store snapshot; button's `disabled` attribute is inspectable in DOM

## Expected Output

- `web/components/gsd/app-shell.tsx` — error banner with retry button, view state persisted via sessionStorage
- `web/components/gsd/dual-terminal.tsx` — workflow action bar in power mode header
