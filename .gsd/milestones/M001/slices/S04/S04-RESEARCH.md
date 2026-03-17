# S04: Runtime Error Capture — Research

**Date:** 2026-03-17

## Summary

S04 adds runtime error capture to the verification gate — scanning bg-shell processes for crashes/unhandled rejections (blocking) and browser console logs for errors/deprecation warnings (non-blocking). The work is straightforward: all data sources are already richly structured and accessible via module-level singletons (`processes` Map in bg-shell, `getConsoleLogs()` in browser-tools). The VerificationResult type needs a `runtimeErrors` field, a new `captureRuntimeErrors()` function collects and classifies errors, the gate block in auto.ts calls it after running verification commands, and the evidence JSON schema gains a `runtimeErrors` array.

The architecture is well-constrained: bg-shell already marks processes with `status: "crashed"` and accumulates `recentErrors[]` arrays, and browser-tools stores typed `ConsoleEntry` objects with `type` field (e.g., "error", "warning"). The main technical question — can the gsd extension import from bg-shell and browser-tools — is already answered: `auto.ts` imports from `../get-secrets-from-user.js` and `../shared/next-action-ui.js`, proving cross-extension imports work. Both `processes` (bg-shell) and `getConsoleLogs` (browser-tools) are named exports from their respective modules.

## Recommendation

Build a single `captureRuntimeErrors()` function in `verification-gate.ts` that:

1. Imports `processes` from `../bg-shell/process-manager.js` and iterates all entries looking for `status === "crashed"` or processes with non-zero exit codes and `recentErrors[]`. These are classified as **blocking** (severity "crash").
2. Imports `getConsoleLogs` from `../browser-tools/state.js` and filters for `type === "error"` (severity "error", non-blocking) and deprecation patterns in warnings (severity "warning", non-blocking).
3. Returns a `RuntimeError[]` array with `{ source, severity, message, blocking }` entries.
4. The gate's `passed` field becomes `false` if any blocking runtime error exists, even if all verification commands passed.

Extend VerificationResult with an optional `runtimeErrors?: RuntimeError[]` field. Extend EvidenceJSON with an optional `runtimeErrors` array (keeping schemaVersion at 1 — it's additive). Extend `formatEvidenceTable` to append a runtime errors section when present.

Use dynamic `import()` for both cross-extension imports to avoid hard module-load failures if bg-shell or browser-tools are not loaded (graceful degradation).

## Implementation Landscape

### Key Files

- `src/resources/extensions/gsd/types.ts` — Add `RuntimeError` interface and extend `VerificationResult` with optional `runtimeErrors` field
- `src/resources/extensions/gsd/verification-gate.ts` — Add `captureRuntimeErrors()` function. Imports `processes` from bg-shell and `getConsoleLogs` from browser-tools via dynamic `import()`
- `src/resources/extensions/gsd/auto.ts` — After `runVerificationGate()` call (~line 1521), call `captureRuntimeErrors()`, merge into the result, and re-evaluate `result.passed` based on blocking errors
- `src/resources/extensions/gsd/verification-evidence.ts` — Extend `EvidenceJSON` with optional `runtimeErrors` array. Update `writeVerificationJSON` to include runtime errors. Update `formatEvidenceTable` to append runtime error rows
- `src/resources/extensions/gsd/tests/verification-gate.test.ts` — New tests for `captureRuntimeErrors()` — will need to mock the bg-shell `processes` Map and browser-tools `getConsoleLogs`
- `src/resources/extensions/bg-shell/process-manager.ts` — No changes needed. `processes` Map and `BgProcess` type are already exported
- `src/resources/extensions/browser-tools/state.ts` — No changes needed. `getConsoleLogs()` and `ConsoleEntry` are already exported

### Data Sources Available

**bg-shell `BgProcess`** (from `processes` Map):
- `status: "crashed"` → blocking crash signal
- `alive: false` + `exitCode !== 0 && exitCode !== null` → process exited with error
- `recentErrors: string[]` → accumulated error lines (up to 50)
- `events: ProcessEvent[]` → lifecycle events including `type: "crashed"` with `detail` and `data.lastErrors`
- `signal: string | null` → e.g. "SIGABRT", "SIGSEGV" → blocking crash signals

**browser-tools `ConsoleEntry`** (from `getConsoleLogs()`):
- `type: "error"` → console.error → non-blocking
- `type: "warning"` → may contain deprecation text → non-blocking
- `text: string` → the message content
- Note: unhandled rejections in browser context typically appear as `type: "error"` with text containing "Unhandled" or "UnhandledRejection"

### Severity Classification (D004)

| Signal | Severity | Blocking? |
|--------|----------|-----------|
| bg-shell `status === "crashed"` | crash | Yes |
| bg-shell non-zero exit + `!alive` | crash | Yes |
| bg-shell `signal` is SIGABRT/SIGSEGV/SIGBUS | crash | Yes |
| Browser console `type === "error"` with "Unhandled" or "UnhandledRejection" | crash | Yes |
| Browser console `type === "error"` (general) | error | No |
| Browser console `type === "warning"` with deprecation | warning | No |
| bg-shell `recentErrors[]` on alive processes | error | No |

### Build Order

1. **T01: Types + captureRuntimeErrors function** — Define `RuntimeError` interface in types.ts, implement `captureRuntimeErrors()` in verification-gate.ts with dynamic imports. Write unit tests mocking the bg-shell/browser-tools singletons. This is the core logic and proves the classification works.

2. **T02: Gate integration + evidence extension** — Wire `captureRuntimeErrors()` into the auto.ts gate block. Extend EvidenceJSON and formatEvidenceTable in verification-evidence.ts. Update writeVerificationJSON to include runtime errors. This integrates the capture into the live verification flow.

T01 unblocks T02 because the function must exist and be tested before wiring it into the gate.

### Verification Approach

- `npm run test:unit -- --test-name-pattern "verification-gate"` — must pass including new runtime error capture tests
- `npm run test:unit -- --test-name-pattern "verification-evidence"` — must pass including extended evidence JSON tests
- `npm run test:unit` — no new failures introduced
- Manual review: `grep -n "captureRuntimeErrors" src/resources/extensions/gsd/auto.ts` — should show 1 import + 1 call site
- Manual review: `grep -n "runtimeErrors" src/resources/extensions/gsd/types.ts` — should show the new field on VerificationResult
- Compile check: `npx --yes tsx src/resources/extensions/gsd/verification-gate.ts` — compiles cleanly

## Constraints

- **Dynamic imports required** — bg-shell and browser-tools may not be loaded in all environments (e.g., test contexts, headless runs without browser). Use `await import("../bg-shell/process-manager.js")` wrapped in try/catch so capture gracefully returns empty arrays when extensions are unavailable.
- **`captureRuntimeErrors` must be async** — dynamic `import()` returns promises. The gate block in auto.ts is already inside an async function (`handleAgentEnd`), so `await` is available.
- **VerificationResult backward compat** — the `runtimeErrors` field must be optional (`runtimeErrors?: RuntimeError[]`) so existing code that creates VerificationResult objects (all S01 tests, verification-gate.ts itself) continues to compile without changes.
- **EvidenceJSON schemaVersion stays at 1** — the field is additive (optional array), not a breaking change. Forward-compatible per D002.
- **10KB output truncation** — bg-shell `recentErrors` lines are already capped at 200 chars each with max 50 entries. No additional truncation needed for those. Browser console entries need `text` truncated to ~500 chars to prevent unbounded evidence size.

## Common Pitfalls

- **Race condition: bg-shell output arrives after capture** — bg-shell processes write to stdout/stderr asynchronously. If `captureRuntimeErrors` runs immediately after the agent's work finishes, some crash output may not yet have been processed. Mitigation: this is acceptable because the crash *status* transition happens synchronously in the `exit` event handler, which fires when the process actually exits. If the process is still alive and hasn't crashed yet, it's not a false negative — it genuinely hasn't crashed at capture time.

- **False positives from ERROR_PATTERNS on bg-shell** — bg-shell's `recentErrors[]` uses broad regex matching (e.g., `/\berror\b/i`). A line like "0 errors found" would be in recentErrors. Mitigation: for alive (non-crashed) processes, classify recentErrors as non-blocking "error" severity, not "crash". Only `status === "crashed"` or `!alive && exitCode !== 0` are blocking.

- **Browser not active** — `getConsoleLogs()` returns the module-level `_consoleLogs` array. If no browser session was started during the task, it returns `[]` — no errors, no noise. No guard needed beyond the dynamic import try/catch.

- **Import path accuracy** — The import paths must use `.js` extensions (ESM convention in this project): `../bg-shell/process-manager.js` and `../browser-tools/state.js`. Verify by checking existing cross-extension imports in auto.ts.

## Open Risks

- **Module singleton identity** — Dynamic `import()` should resolve to the same module instance as the static imports in bg-shell/browser-tools extensions (since they share the same Node.js module cache). If something breaks this assumption (e.g., different resolution contexts), `captureRuntimeErrors` would see an empty processes Map. Low risk — the existing cross-extension imports in auto.ts prove this works.
