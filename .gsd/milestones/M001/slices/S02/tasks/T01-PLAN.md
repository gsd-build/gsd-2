---
estimated_steps: 3
estimated_files: 5
---

# T01: Establish shared onboarding auth truth and browser setup API

**Slice:** S02 — First-run setup wizard
**Milestone:** M001

## Description

Replace S01’s boolean `onboardingNeeded` seam with an authoritative onboarding model that the browser, boot payload, and later command gate can all trust. This task produces the server-side setup contract for required credential detection, provider discovery, redacted validation results, and skippable optional sections.

## Steps

1. Extract shared onboarding/auth-state helpers that compute required and optional setup state from `AuthStorage` plus runtime env-auth detection, then switch boot payload assembly to use that shared truth.
2. Add same-origin onboarding route handling for reading setup state and driving browser-managed setup actions such as provider discovery, API-key save/validate, and provider-flow progress without creating a second credential store.
3. Add contract coverage for boot + onboarding responses, including redaction, env-satisfied auth, validation failure, and the required-vs-optional distinction.

## Must-Haves

- [ ] Required-auth detection matches runtime truth rather than custom env-key scanning.
- [ ] Browser onboarding responses are structured and redacted enough for the UI to render state without guessing from booleans.
- [ ] Optional setup remains explicitly skippable and non-blocking in the server contract.

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts`
- Assertions cover boot onboarding state plus onboarding API responses for missing auth, env-backed auth, and failed validation.

## Observability Impact

- Signals added/changed: boot onboarding state, provider availability, and validation result/status fields.
- How a future agent inspects this: `/api/boot`, onboarding route responses, and `src/tests/web-onboarding-contract.test.ts`.
- Failure state exposed: last validation result and required-setup status without leaking credential values.

## Inputs

- `src/web/bridge-service.ts` — current boot payload assembly and the S01 `onboardingNeeded` seam to replace.
- `packages/pi-coding-agent/src/core/auth-storage.ts` and `packages/pi-ai/src/env-api-keys.ts` — authoritative credential persistence and runtime auth detection.
- `.gsd/milestones/M001/slices/S02/S02-RESEARCH.md` — keep launch readiness separate from setup completion and avoid a second auth-truth layer.

## Expected Output

- `src/web/onboarding-service.ts` — shared onboarding/auth-state model for the web host.
- `web/app/api/onboarding/route.ts` — same-origin onboarding API backed by shared auth truth.
- `src/tests/web-onboarding-contract.test.ts` — contract proof for onboarding state, validation, and redaction.
