# S01: Web host + agent bridge

**Goal:** Make `gsd --web` launch a browser-only, current-project workspace backed by a real local bridge instead of mock startup data.
**Demo:** From a real project cwd, running `gsd --web` starts the local web host, auto-opens the preserved `web/` shell, returns a boot payload for that cwd, and the UI receives live session state/events over the bridge without launching the TUI.

## Must-Haves

- `gsd --web` is parsed explicitly, branches before interactive/TUI startup, keeps current-cwd session scoping, and auto-opens the browser workspace. (R001, R003)
- The local host exposes a current-project boot contract with onboarding-needed/resumable-session seams plus a long-lived same-origin bridge for RPC commands and streaming events backed by real GSD state. (R003, supports R002, R004)
- The existing web shell establishes a shared live connection from `/api/boot` and session events, replaces launch-critical placeholder startup/session wiring, and surfaces bridge failure state in-browser. (supports R004, R009)

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `src/tests/web-mode-cli.test.ts`
- `src/tests/web-bridge-contract.test.ts`
- `src/tests/integration/web-mode-runtime.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-mode-cli.test.ts src/tests/web-bridge-contract.test.ts src/tests/integration/web-mode-runtime.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-mode-cli.test.ts --test-name-pattern "launch failure"` — verifies inspectable pre-open failure state from the launcher.

## Observability / Diagnostics

- Runtime signals: web-mode startup mode/port/cwd, bridge session lifecycle transitions, SSE connect/disconnect state, last bridge/RPC error.
- Inspection surfaces: `/api/boot`, `/api/session/events`, visible connection/error state in the web shell, integration test output.
- Failure visibility: bridge phase, active session id or none, last error message, and timestamp.
- Redaction constraints: never expose secret values or raw credential material in boot payloads, diagnostics, or UI state.

## Integration Closure

- Existing code surfaces consumed: `src/cli.ts`, `src/loader.ts`, `src/onboarding.ts`, `src/resources/extensions/gsd/workspace-index.ts`, `src/resources/extensions/gsd/auto.ts`, `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts`, `web/app/page.tsx`.
- New wiring introduced in this slice: explicit `--web` launch branch, packaged local web host bootstrap, project-scoped bridge singleton, same-origin boot/command/event routes, and a shared browser workspace store.
- What remains before the milestone is truly usable end-to-end: browser onboarding validation, focused prompt handling, full view-model replacement for the rest of the skin, start/resume controls, continuity across refresh/reopen, and richer failure recovery.

## Tasks

- [x] **T01: Add the browser-only `--web` launch path and host bootstrap** `est:1h`
  - Why: This closes the owned launch contract first so later bridge work attaches to a real entrypoint instead of ad hoc dev commands.
  - Files: `src/cli.ts`, `src/loader.ts`, `src/web-mode.ts`, `package.json`, `web/package.json`, `src/tests/web-mode-cli.test.ts`
  - Do: Teach CLI arg parsing to recognize `--web` and branch before interactive startup; add a web-mode launcher that preserves loader bootstrap, scopes runtime to `process.cwd()`, resolves a concrete shipped web-host path, and reuses browser-open behavior; cover the branch with node:test assertions for no-TUI startup, cwd scoping, and opener invocation.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-mode-cli.test.ts`
  - Done when: `--web` has a tested dedicated startup path that starts browser mode for the current cwd, never instantiates the TUI branch, and has a concrete packaged host bootstrap path.
- [x] **T02: Implement the project-scoped bridge service and same-origin API contract** `est:90m`
  - Why: This turns existing workspace/RPC code into the real browser boundary for S01 instead of one-off route handler glue.
  - Files: `src/web/bridge-service.ts`, `web/app/api/boot/route.ts`, `web/app/api/session/command/route.ts`, `web/app/api/session/events/route.ts`, `src/resources/extensions/gsd/workspace-index.ts`, `src/resources/extensions/gsd/auto.ts`, `src/tests/web-bridge-contract.test.ts`
  - Do: Add a long-lived bridge service that owns RPC child/session lifecycle per current project; derive `/api/boot` from real workspace index, derived state, auto-dashboard data, onboarding-needed flag, and resumable-session metadata; map browser commands to the RPC contract and stream agent plus `extension_ui_request` events over SSE with inspectable error and connection state.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-bridge-contract.test.ts`
  - Done when: the boot endpoint and session routes are backed by one bridge registry, return current-project data, and expose a tested request/stream/error contract.
- [x] **T03: Connect the existing shell to the live bridge and prove runtime launch** `est:90m`
  - Why: This makes the slice demo user-real by replacing isolated launch/session mocks with a shared client connection to the new boot and event surfaces.
  - Files: `web/app/page.tsx`, `web/lib/gsd-workspace-store.ts`, `web/components/gsd/sidebar.tsx`, `web/components/gsd/status-bar.tsx`, `web/components/gsd/terminal.tsx`, `src/tests/integration/web-mode-runtime.test.ts`
  - Do: Add a shared client store that loads `/api/boot`, subscribes to `/api/session/events`, and posts commands through the bridge; wire launch-critical shell surfaces to live project/session/connection state without redesigning the skin; add an integration test that spawns `gsd --web`, probes the host, and verifies live bridge attachment from a real project cwd.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-runtime.test.ts`
  - Done when: the preserved shell shows current-project and live-session state from the bridge at launch, exposes bridge disconnection/error state, and the real runtime test passes without TUI startup.

## Files Likely Touched

- `src/cli.ts`
- `src/loader.ts`
- `src/onboarding.ts`
- `src/web-mode.ts`
- `src/web/bridge-service.ts`
- `package.json`
- `web/package.json`
- `web/app/api/boot/route.ts`
- `web/app/api/session/command/route.ts`
- `web/app/api/session/events/route.ts`
- `web/app/page.tsx`
- `web/lib/gsd-workspace-store.ts`
- `web/components/gsd/sidebar.tsx`
- `web/components/gsd/status-bar.tsx`
- `web/components/gsd/terminal.tsx`
- `src/tests/web-mode-cli.test.ts`
- `src/tests/web-bridge-contract.test.ts`
- `src/tests/integration/web-mode-runtime.test.ts`
