# S01: Big-Bang Merge + Conflict Resolution — UAT

**Milestone:** M010
**Written:** 2026-03-18

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This slice is a merge + build verification — all outcomes are deterministic command outputs (exit codes, grep results, commit counts). No runtime behavior or UI to exercise.

## Preconditions

- Working directory is the M010 worktree (or main branch after merge)
- `node` and `npm` are available
- Git history includes the v2.28.0 merge commit

## Smoke Test

Run `npm run build && npm run build:web-host` — both must exit 0. If either fails, the slice is broken.

## Test Cases

### 1. Zero conflict markers in codebase

1. Run `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/`
2. **Expected:** Exit code 1 (no matches). Zero output lines.

### 2. All 223 upstream commits present in history

1. Run `git log --oneline v2.22.0..HEAD | wc -l`
2. **Expected:** 490+ (223 upstream commits + existing fork commits). Must be ≥ 223.

### 3. Main build passes clean

1. Run `rm -rf packages/*/dist/`
2. Run `npm run build`
3. **Expected:** Exit 0. All 5 workspace packages (native, pi-tui, pi-ai, pi-agent-core, pi-coding-agent) compile, followed by root tsc and resource copy steps.

### 4. Web host build passes clean

1. Run `npm run build:web-host`
2. **Expected:** Exit 0. Next.js production build completes. The `@gsd/native` module-not-found warning is expected and benign — do not count it as a failure.

### 5. Fork web mode code preserved

1. Run `rg "webMode|--web" src/cli.ts`
2. **Expected:** 4+ matches showing fork's `--web` flag parsing and web mode launch blocks.

### 6. Fork state derivation logic preserved

1. Run `rg "deriveState" src/resources/extensions/gsd/state.ts`
2. **Expected:** 5+ matches showing fork's `deriveState` function and cache management.

### 7. Upstream sessions subcommand present

1. Run `rg "sessions" src/cli.ts | head -5`
2. **Expected:** Matches showing upstream's `sessions` subcommand block in cli.ts.

### 8. Upstream editMode setting present

1. Run `rg "editMode" packages/pi-coding-agent/src/core/settings-manager.ts`
2. **Expected:** At least 1 match showing the `editMode` property in the Settings interface.

## Edge Cases

### Stale dist/ causing TS5055

1. Leave `packages/*/dist/` from a previous build in place
2. Run `npm run build`
3. **Expected:** May produce TS5055 "Cannot write file — would overwrite input file" errors. Fix: `rm -rf packages/*/dist/` and rebuild. This is a known pattern (KNOWLEDGE.md), not a slice regression.

### Re-running conflict marker scan with unanchored pattern

1. Run `rg "======" src/` (unanchored)
2. **Expected:** False positives from `===` operators in JavaScript. This is why the slice uses `rg "^=======$"` (anchored). Do not use unanchored patterns for conflict marker detection.

## Failure Signals

- `npm run build` exits non-zero — TypeScript compilation failure, likely stale dist/ or import path issue
- `npm run build:web-host` exits non-zero — Next.js/Turbopack build failure, check for module resolution issues
- `rg "^<<<<<<<|^>>>>>>>|^=======$"` produces output — unresolved conflict markers remain
- `git log --oneline v2.22.0..HEAD | wc -l` shows < 223 — merge didn't land all upstream commits
- `rg "webMode|--web" src/cli.ts` returns no matches — fork web mode code was lost during merge

## Requirements Proved By This UAT

- R125 (partial) — Merge complete with both builds green and zero conflict markers. Full R125 validation also requires test suite pass (S02).

## Not Proven By This UAT

- R126 — Test suite pass and zero new warnings (S02 responsibility)
- R128 — `/gsd sessions` web dispatch (S02 responsibility)
- Runtime behavior of any merged upstream features — this UAT only proves build-time correctness

## Notes for Tester

- The commit count (test case 2) will be higher than 223 because it includes fork commits too. The key check is that it's ≥ 223.
- The `@gsd/native` warning in the web build (test case 4) is a known, expected warning — it's a Node-only native module that the web host gracefully handles at runtime.
- If running on a fresh clone, ensure `npm install` has been run before testing builds.
- The stale dist/ edge case is documented in KNOWLEDGE.md and is not a regression — it's an inherent property of the TypeScript build chain after large merges.
