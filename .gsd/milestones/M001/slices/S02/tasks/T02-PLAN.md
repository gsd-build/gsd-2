---
estimated_steps: 3
estimated_files: 5
---

# T02: Enforce the gate and refresh bridge auth after successful setup

**Slice:** S02 — First-run setup wizard
**Milestone:** M001

## Description

Turn the onboarding contract into a real lock. This task blocks session-mutating work until required setup passes and makes successful browser onboarding immediately usable by refreshing the running bridge child’s auth view before the first prompt.

## Steps

1. Add server-side gating around `/api/session/command` and bridge command helpers so read-only boot/status refresh remains available but prompt/session-mutation paths reject with structured locked errors while onboarding is incomplete.
2. Trigger bridge auth reload or controlled restart after successful required-credential validation, and persist enough phase/error state for the browser to distinguish “still locked” from “refresh failed.”
3. Extend contract and integration coverage to prove bypass attempts fail, successful validation refreshes auth visibility, and refresh failures keep the workspace locked with inspectable diagnostics.

## Must-Haves

- [ ] Direct posts to `/api/session/command` cannot bypass onboarding.
- [ ] Successful validation makes new auth visible to the running bridge before the first prompt.
- [ ] Refresh failures stay visible and keep the workspace locked.

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-onboarding.test.ts`

## Observability Impact

- Signals added/changed: blocked-command rejection reasons and bridge auth refresh phase/result.
- How a future agent inspects this: `/api/boot`, gated command responses, and `src/tests/integration/web-mode-onboarding.test.ts`.
- Failure state exposed: locked reason versus bridge-refresh failure reason/timestamp.

## Inputs

- `web/app/api/session/command/route.ts` — current unguarded command forwarding from S01.
- `src/web/onboarding-service.ts` — structured onboarding state and validation results from T01.
- `packages/pi-coding-agent/src/core/auth-storage.ts` — explicit reload constraint surfaced in S02 research.

## Expected Output

- `web/app/api/session/command/route.ts` and `src/web/bridge-service.ts` — enforced gate plus bridge auth refresh path.
- `src/tests/web-onboarding-contract.test.ts` and `src/tests/integration/web-mode-onboarding.test.ts` — proof that bypasses are blocked and successful validation unlocks the first prompt path.
