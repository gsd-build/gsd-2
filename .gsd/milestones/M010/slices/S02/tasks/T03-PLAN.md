---
estimated_steps: 4
estimated_files: 3
---

# T03: Wire /gsd sessions dispatch and update parity test

**Slice:** S02 — Test Green + Session Picker Dispatch + Final Verification
**Milestone:** M010

## Description

Wire `/gsd sessions` browser dispatch to open the existing session browser surface (same target as `/gsd resume`). Update the parity contract test for the new `edit-mode` builtin slash command that upstream added to `BUILTIN_SLASH_COMMANDS`.

The web already has full session browse/resume/rename/fork from M002 via `command-surface.tsx` `SESSION_SURFACE_SECTIONS`. No new UI component is needed — just dispatch wiring so `/gsd sessions` typed in the browser terminal opens the session browser.

## Steps

1. Find the GSD command dispatch handler in the web workspace store or command surface (where `/gsd resume`, `/gsd status` etc. are dispatched)
2. Add `/gsd sessions` as an alias or new entry that opens the session browser surface (same action as `/gsd resume` — opens the "resume" section of the command surface)
3. Add `["edit-mode", "rpc"]` to `EXPECTED_BUILTIN_OUTCOMES` in `src/tests/web-command-parity-contract.test.ts` — `edit-mode` is an interactive slash command that toggles state, so it passes through RPC
4. Run `npm run build:web-host` and the parity test to confirm

## Must-Haves

- [ ] `/gsd sessions` dispatches to the session browser surface in the web UI
- [ ] `edit-mode` added to `EXPECTED_BUILTIN_OUTCOMES` with correct outcome kind
- [ ] Parity contract test passes with updated builtin count
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` — exit 0
- `npm run test:unit -- --grep "parity"` or equivalent — parity test passes

## Observability Impact

- **Parity contract test:** `src/tests/web-command-parity-contract.test.ts` assertion failure names the exact missing/extra command when `edit-mode` is not mapped correctly.
- **Build diagnostic:** `npm run build:web-host` emits TypeScript file:line:col errors if dispatch wiring introduces type mismatches.
- **Session dispatch:** `/gsd sessions` in the browser should open the session browser surface — observable via the command surface UI appearing with session list.
- **Failure signals:** A missing dispatch entry produces no visible UI change when the command is typed. A wrong parity entry produces a named assertion diff listing expected vs actual.

## Inputs

- Existing session browser in `web/components/gsd/command-surface.tsx` (SESSION_SURFACE_SECTIONS: resume, name, fork, session, compact)
- Existing dispatch mechanism for `/gsd` commands in web workspace store
- Upstream `BUILTIN_SLASH_COMMANDS` now includes `edit-mode`

## Expected Output

- `/gsd sessions` dispatch wired to open session browser
- Parity test updated with `edit-mode` entry and correct builtin count
