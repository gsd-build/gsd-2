---
id: T01
parent: S05
milestone: M003
provides:
  - Browser-safe types for knowledge entries and capture entries
  - Captures child-process service (collectCapturesData, resolveCaptureAction)
  - Knowledge direct-read service (collectKnowledgeData, parseKnowledgeFile)
  - /api/knowledge GET route
  - /api/captures GET + POST routes
key_files:
  - web/lib/knowledge-captures-types.ts
  - src/web/captures-service.ts
  - src/web/knowledge-service.ts
  - web/app/api/knowledge/route.ts
  - web/app/api/captures/route.ts
key_decisions:
  - Knowledge service uses direct file read (no child process) since KNOWLEDGE.md is plain markdown with no .js-extension imports
  - Captures service uses child-process pattern matching forensics-service.ts to avoid Turbopack .js→.ts resolution issue
  - POST validation returns 400 with specific field-level error messages rather than generic validation failure
patterns_established:
  - captures-service.ts follows same execFile+resolve-ts.mjs pattern as forensics-service.ts
  - CaptureResolveRequest parameters serialized via JSON.stringify to safely interpolate into eval script
observability_surfaces:
  - /api/knowledge GET returns KnowledgeData JSON with entries, filePath, lastModified
  - /api/captures GET returns CapturesData JSON with entries, pendingCount, actionableCount
  - /api/captures POST returns CaptureResolveResult JSON; 400 on validation error; 500 on subprocess failure
duration: 8m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Create types, services, and API routes for knowledge and captures

**Built complete server-side data pipeline: browser-safe types, captures child-process service, knowledge direct-read service, and two API routes.**

## What Happened

Created 5 new files following established S04 patterns exactly:

1. **`web/lib/knowledge-captures-types.ts`** — All browser-safe types: `KnowledgeEntry`, `KnowledgeData`, `Classification`, `CaptureEntry`, `CapturesData`, `CaptureResolveRequest`, `CaptureResolveResult`. Mirrors upstream captures.ts types without importing Node.js modules.

2. **`src/web/captures-service.ts`** — Child-process service matching forensics-service.ts pattern. `collectCapturesData()` spawns a child that imports captures.ts via `pathToFileURL`, calls `loadAllCaptures()` and `loadActionableCaptures()`, writes JSON to stdout. `resolveCaptureAction()` similarly calls `markCaptureResolved()` with parameters safely serialized via `JSON.stringify`.

3. **`src/web/knowledge-service.ts`** — Direct file read service. `collectKnowledgeData()` reads KNOWLEDGE.md from `projectCwd/.gsd/KNOWLEDGE.md`, returns empty entries if file missing. `parseKnowledgeFile()` handles both freeform `## Heading` sections (→ `freeform-N` entries) and table rows with `K/P/L` prefixed IDs (→ rule/pattern/lesson typed entries).

4. **`web/app/api/knowledge/route.ts`** — GET handler following forensics route pattern exactly.

5. **`web/app/api/captures/route.ts`** — GET + POST handlers. POST validates `captureId` (non-empty string), `classification` (one of 5 valid values), `resolution` (non-empty string), `rationale` (non-empty string). Returns 400 with specific error messages on validation failure.

## Verification

- `npm run build` — exits 0 (all 5 new files compile)
- All 5 files exist with correct imports/exports confirmed
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118 tests, 114 pass, 4 fail (pre-existing failures unrelated to this task; `view-navigate` vs `surface` mapping issue)

## Diagnostics

- `curl http://localhost:3000/api/knowledge | jq` — returns `KnowledgeData` JSON with parsed KNOWLEDGE.md entries
- `curl http://localhost:3000/api/captures | jq` — returns `CapturesData` JSON with capture entries and counts
- `curl -X POST http://localhost:3000/api/captures -H 'Content-Type: application/json' -d '{"captureId":"X","classification":"note","resolution":"done","rationale":"test"}' | jq` — returns resolve result
- On error: all routes return `{ "error": "<message>" }` with appropriate HTTP status (400 for validation, 500 for service errors); subprocess stderr included in error message

## Deviations

None.

## Known Issues

- 4 pre-existing test failures in parity contract tests (114/118 pass) — unrelated to this task, caused by upstream `view-navigate` vs `surface` command type mapping drift.

## Files Created/Modified

- `web/lib/knowledge-captures-types.ts` — browser-safe types for knowledge and captures
- `src/web/captures-service.ts` — child-process service for captures data + triage actions
- `src/web/knowledge-service.ts` — direct-read service for KNOWLEDGE.md parsing
- `web/app/api/knowledge/route.ts` — GET route for knowledge data
- `web/app/api/captures/route.ts` — GET + POST routes for captures data and triage
- `.gsd/milestones/M003/slices/S05/S05-PLAN.md` — added failure-path verification steps
- `.gsd/milestones/M003/slices/S05/tasks/T01-PLAN.md` — added Observability Impact section
