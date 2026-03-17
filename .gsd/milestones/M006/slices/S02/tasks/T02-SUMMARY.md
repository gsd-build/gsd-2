---
id: T02
parent: S02
milestone: M006
provides:
  - GSDWorkspaceStore accepts projectCwd constructor parameter for per-project scoping
  - buildUrl() instance method threads ?project= through all fetch and EventSource calls
  - buildProjectUrl() standalone exported utility for URL construction
  - disconnectSSE() and reconnectSSE() methods for SSE lifecycle management
key_files:
  - web/lib/gsd-workspace-store.tsx
key_decisions:
  - Actual fetch count is 26 (not 28 as plan estimated from older file) — all 26 fetches + 1 EventSource = 27 buildUrl usages
patterns_established:
  - buildUrl pattern: every fetch/EventSource in the store goes through this.buildUrl() which delegates to standalone buildProjectUrl(); when projectCwd is undefined the URL passes through unchanged
  - SSE lifecycle pattern: disconnectSSE() closes stream without disposing store state; reconnectSSE() re-establishes stream and triggers soft boot refresh — designed for project switching without losing in-memory state
observability_surfaces:
  - All 26 fetch calls and EventSource include ?project=<encoded-cwd> when projectCwd is set — visible in browser network panel and server logs
  - connectionState in getSnapshot() reflects SSE lifecycle transitions from disconnectSSE/reconnectSSE
  - buildProjectUrl() exported for standalone URL verification
duration: 8m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: Thread project-scoping through workspace store with SSE lifecycle

**Added `projectCwd` constructor parameter to `GSDWorkspaceStore`, wrapped all 26 fetch calls and the EventSource URL with `buildUrl()`, and added `disconnectSSE()`/`reconnectSSE()` for SSE lifecycle management.**

## What Happened

1. Added `buildProjectUrl()` standalone export before the class — uses `URL` constructor to safely append `?project=` (or `&project=` for URLs with existing params) via `searchParams.set()`.
2. Added `constructor(private readonly projectCwd?: string) {}` to `GSDWorkspaceStore` — class previously had no explicit constructor.
3. Added `private buildUrl()` instance method that delegates to `buildProjectUrl(path, this.projectCwd)`.
4. Wrapped all 26 `fetch()` calls with `this.buildUrl(...)` — including 2 template literal calls (`/api/session/browser?${params}` and `/api/live-state?${params}`) that use existing query parameters.
5. Wrapped the `EventSource` URL: `new EventSource(this.buildUrl("/api/session/events"))`.
6. Added `disconnectSSE()` — public wrapper around existing `closeEventStream()` for use by T03's store manager.
7. Added `reconnectSSE()` — re-establishes EventSource and triggers soft boot refresh, with guard against disposed stores.

## Verification

- `npm run build` — exits 0, clean TypeScript compilation
- `npm run test:unit` — 1215 pass, 0 fail, 0 cancelled
- `grep -c 'this.buildUrl' web/lib/gsd-workspace-store.tsx` → 27 (26 fetches + 1 EventSource)
- `grep -c 'fetch("/api\|fetch(`/api' web/lib/gsd-workspace-store.tsx` → 0 (all raw fetches wrapped)
- `grep 'disconnectSSE\|reconnectSSE'` — both methods present
- `grep 'export function buildProjectUrl'` — utility exported

### Slice-level checks

- `npm run test:unit -- --test-name-pattern "project-discovery"` — 1215 pass (discovery tests included)
- `npm run build` — ✅
- `KNOWN_VIEWS` / `sidebar` Projects tab — not yet added (T04+)
- `build:web-host` — not re-run (no route changes in this task; T01 already confirmed)

## Diagnostics

- **URL construction:** `buildProjectUrl("/api/boot", "/my/project")` → `"/api/boot?project=%2Fmy%2Fproject"`
- **URL with existing params:** `buildProjectUrl("/api/doctor?scope=full", "/my/project")` → `"/api/doctor?scope=full&project=%2Fmy%2Fproject"`
- **No projectCwd:** `buildProjectUrl("/api/boot")` → `"/api/boot"` (passthrough, backward compatible)
- **Grep audit:** `grep -c 'this.buildUrl' web/lib/gsd-workspace-store.tsx` should return 27

## Deviations

- Plan estimated 28 fetch calls; actual file has 26. The plan was based on a slightly older file version. All actual call sites are wrapped — no fetch calls left unwrapped.

## Known Issues

None.

## Files Created/Modified

- `web/lib/gsd-workspace-store.tsx` — added `buildProjectUrl` export, constructor with `projectCwd`, `buildUrl()` method, wrapped 26 fetches + 1 EventSource, added `disconnectSSE()`/`reconnectSSE()` methods
- `.gsd/milestones/M006/slices/S02/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
