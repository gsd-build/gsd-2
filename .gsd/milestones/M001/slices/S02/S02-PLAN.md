# S02: First-run setup wizard

**Goal:** Deliver R002 for web mode: a first-run `gsd --web` user can complete required setup entirely in-browser, validate required model credentials, and unlock the current-project workspace without touching the TUI.
**Demo:** Launch `gsd --web` in a fresh profile, hit a locked onboarding gate inside the preserved shell, complete required credential setup with validation feedback, skip optional setup if desired, and send the first live session command from the unlocked workspace with refreshed bridge auth.

## Must-Haves

- Boot and onboarding state come from shared runtime auth truth (`AuthStorage` + env auth detection) and expose structured required/optional setup state instead of a boolean-only heuristic.
- Same-origin onboarding routes let the browser discover provider options, save and validate required credentials, surface failure details safely, and keep optional setup skippable.
- The workspace stays locked both in the shell and at `/api/session/command` until required setup passes; read-only boot/status refresh remains available.
- Successful setup refreshes the bridge child’s auth view before prompts are allowed, and the current validation/lock state stays inspectable without exposing secret values.

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: yes

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-onboarding.test.ts`
- `npm run build:web-host`
- Contract check: failed validation leaves `/api/boot` + `/api/onboarding` locked and returns a redacted `lastValidation` error/status without stored credential values
- Real fresh-profile `gsd --web` browser pass: locked shell on first load → failed validation stays gated with visible feedback → successful validation unlocks the workspace → first live command succeeds without host restart

## Observability / Diagnostics

- Runtime signals: structured onboarding state in `/api/boot`, blocked-command rejection reasons, and bridge auth refresh phase/result after successful setup.
- Inspection surfaces: `/api/boot`, onboarding API responses, locked-shell status messaging, `src/tests/web-onboarding-contract.test.ts`, and `src/tests/integration/web-mode-onboarding.test.ts`.
- Failure visibility: last validation result, blocked-command error, bridge auth refresh failure/phase/timestamp.
- Redaction constraints: never expose stored credential values; return only provider ids, status, timestamps, and redacted error text.

## Integration Closure

- Upstream surfaces consumed: `src/web/bridge-service.ts`, `src/onboarding.ts`, `packages/pi-coding-agent/src/core/auth-storage.ts`, `packages/pi-ai/src/env-api-keys.ts`, `web/lib/gsd-workspace-store.tsx`, `web/components/gsd/app-shell.tsx`, and the S01 boot/command/SSE routes.
- New wiring introduced in this slice: a shared onboarding service, same-origin onboarding routes, a server-side session gate, a bridge auth refresh hook, and a locked onboarding surface in the preserved shell.
- What remains before the milestone is truly usable end-to-end: S03 live prompt/interrupt handling, S04 real workspace state surfaces, S05 workflow controls, S06 continuity/failure polish, and S07 full assembled proof.

## Tasks

- [x] **T01: Establish shared onboarding auth truth and browser setup API** `est:1.5h`
  - Why: Replace S01’s boolean onboarding seam with an authoritative browser contract for R002 so the UI and server gate both read the same setup truth.
  - Files: `src/web/onboarding-service.ts`, `src/web/bridge-service.ts`, `web/app/api/boot/route.ts`, `web/app/api/onboarding/route.ts`, `src/tests/web-onboarding-contract.test.ts`
  - Do: Extract shared onboarding/auth-state helpers from the current boot + CLI split, expand boot to return structured setup state, and add same-origin onboarding actions for provider discovery, API-key save/validate, and browser-managed provider flow state while keeping optional setup explicitly non-blocking.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts`
  - Done when: boot and onboarding routes expose one redacted, structured onboarding model backed by runtime auth truth, and contract tests cover missing auth, env-satisfied auth, validation failure, and optional setup state.
- [x] **T02: Enforce the gate and refresh bridge auth after successful setup** `est:1h`
  - Why: R002 is not real if direct command posts can bypass the lock or if the first post-setup prompt still runs with stale bridge auth; this also advances R004’s browser-only path.
  - Files: `web/app/api/session/command/route.ts`, `src/web/bridge-service.ts`, `src/web/onboarding-service.ts`, `src/tests/web-onboarding-contract.test.ts`, `src/tests/integration/web-mode-onboarding.test.ts`
  - Do: Add server-side command gating that still permits read-only/status refresh, trigger bridge auth reload or restart after successful required-credential validation, and surface blocked-vs-refresh-failed states clearly enough for the browser to diagnose.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts` and `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-onboarding.test.ts`
  - Done when: `/api/session/command` rejects bypass attempts while onboarding is incomplete, and the first prompt after successful validation succeeds against refreshed bridge auth in automated coverage.
- [x] **T03: Wire the locked onboarding shell and prove the first-run browser flow** `est:1.5h`
  - Why: The slice demo is a real in-browser setup experience, not just backend plumbing; this task closes the visible browser path that R004 depends on later.
  - Files: `web/lib/gsd-workspace-store.tsx`, `web/components/gsd/app-shell.tsx`, `web/components/gsd/onboarding-gate.tsx`, `web/components/gsd/status-bar.tsx`, `src/tests/integration/web-mode-onboarding.test.ts`
  - Do: Extend the shared store with onboarding state/actions, render a full-screen locked gate inside the preserved shell, show validation progress/error/success plus skippable optional setup, and finish with real browser/runtime proof against `gsd --web`.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-onboarding.test.ts`, `npm run build:web-host`, and a fresh-profile browser validation run of `gsd --web`
  - Done when: a fresh browser launch shows an unambiguous locked workspace, failed validation keeps it locked with visible feedback, and successful validation unlocks the shell and permits a live command without terminal fallback.

## Files Likely Touched

- `src/web/onboarding-service.ts`
- `src/web/bridge-service.ts`
- `web/app/api/boot/route.ts`
- `web/app/api/onboarding/route.ts`
- `web/app/api/session/command/route.ts`
- `web/lib/gsd-workspace-store.tsx`
- `web/components/gsd/app-shell.tsx`
- `web/components/gsd/onboarding-gate.tsx`
- `web/components/gsd/status-bar.tsx`
- `src/tests/web-onboarding-contract.test.ts`
- `src/tests/integration/web-mode-onboarding.test.ts`
