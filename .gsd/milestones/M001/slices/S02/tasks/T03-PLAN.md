---
estimated_steps: 4
estimated_files: 5
---

# T03: Wire the locked onboarding shell and prove the first-run browser flow

**Slice:** S02 — First-run setup wizard
**Milestone:** M001

## Description

Render onboarding inside the preserved shell, tie it to the shared workspace store, and prove the first-run browser path against a real `gsd --web` runtime. This task makes the setup gate visible, usable, and unmistakably blocking until required credentials validate.

## Steps

1. Extend the workspace store to fetch onboarding state, drive save/validate actions, and track locked, validating, refresh, success, and failure phases.
2. Add a full-screen onboarding gate component and wire it into the app shell/status surfaces so required setup is visually unambiguous while optional integrations remain skippable.
3. Add runtime integration assertions around locked versus unlocked behavior and browser-visible error handling.
4. Run a fresh-profile `gsd --web` browser pass and tighten any remaining wiring until the successful flow ends with an unlocked workspace and a working first command.

## Must-Haves

- [ ] Fresh launches show a locked, in-browser onboarding flow before interactive workspace use.
- [ ] Failed validation stays visible in the UI and does not unlock the shell.
- [ ] Successful validation unlocks the shell without asking the user to restart or leave the browser.

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-onboarding.test.ts`
- `npm run build:web-host`
- Fresh-profile `gsd --web` browser pass with explicit checks for locked-first-load, failed-validation feedback, successful unlock, and first live command success.

## Observability Impact

- Signals added/changed: client onboarding phase/result mapped from boot and onboarding responses.
- How a future agent inspects this: locked-shell UI state, status-bar presentation, `/api/boot`, and browser assertions from the integration/runtime proof.
- Failure state exposed: visible validation error or bridge-refresh failure state inside the gate instead of a silently inert workspace.

## Inputs

- `web/lib/gsd-workspace-store.tsx` and `web/components/gsd/app-shell.tsx` — live S01 shell/store foundation for boot and command dispatch.
- `src/tests/integration/web-mode-onboarding.test.ts` — runtime proof target established in T02.
- `web/app/api/onboarding/route.ts` and gated command responses — onboarding contract the browser must render and recover from.

## Expected Output

- `web/components/gsd/onboarding-gate.tsx` and `web/lib/gsd-workspace-store.tsx` — browser onboarding UX wired to real state/actions.
- `src/tests/integration/web-mode-onboarding.test.ts` — end-to-end proof of locked-first-run then unlock-after-validation behavior.
