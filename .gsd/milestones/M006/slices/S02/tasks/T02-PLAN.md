---
estimated_steps: 7
estimated_files: 1
---

# T02: Thread project-scoping through workspace store with SSE lifecycle

**Slice:** S02 — Project discovery, Projects view, and store switching
**Milestone:** M006

## Description

Add a `projectCwd` constructor parameter to `GSDWorkspaceStore` and thread it through all 28 `fetch()` calls and the `EventSource` URL using a `buildUrl()` helper. Add `disconnectSSE()` and `reconnectSSE()` methods for SSE lifecycle management (needed by T03's store manager). When `projectCwd` is undefined, all behavior is unchanged — backward compatible by construction.

This is mechanical but high-risk work touching 29 call sites in a 5000+ line file. The pattern is consistent: every `fetch("/api/X")` becomes `fetch(this.buildUrl("/api/X"))`. The critical subtlety is URLs that already have query parameters — `buildUrl` must use the `URL` constructor to correctly append `&project=` instead of `?project=`.

## Steps

1. **Add `projectCwd` constructor parameter.** At line 1789 (`export class GSDWorkspaceStore`), add:
   ```ts
   constructor(private readonly projectCwd?: string) {}
   ```
   The class currently has no explicit constructor — all fields use inline initializers.

2. **Create the `buildUrl` instance method.** Add a private method:
   ```ts
   private buildUrl(path: string): string {
     if (!this.projectCwd) return path;
     const url = new URL(path, "http://localhost");
     url.searchParams.set("project", this.projectCwd);
     return url.pathname + url.search;
   }
   ```
   This uses the `URL` constructor to safely handle paths that already have query parameters. The base `"http://localhost"` is needed because `URL` requires a base for relative paths — we only use `pathname + search` from the result, discarding the base. This correctly produces `/api/boot?project=%2Ffoo%2Fbar` for simple paths and `/api/doctor?scope=full&project=%2Ffoo%2Fbar` for paths with existing params.

3. **Thread `buildUrl` through all 28 `fetch()` calls.** Find every `fetch("/api/...` or `fetch('/api/...` in the file and wrap the URL with `this.buildUrl(...)`. The existing call sites are (by line reference from grep):
   - Line 1946: `fetch("/api/git", ...)` → `fetch(this.buildUrl("/api/git"), ...)`
   - Line 2076: `fetch("/api/recovery", ...)` → same pattern
   - Line 2272: `fetch("/api/forensics", ...)` → same pattern
   - Line 2311: `fetch("/api/doctor", ...)` → same pattern (GET)
   - Line 2338: `fetch("/api/skill-health", ...)` → same pattern
   - Line 2357: `fetch("/api/knowledge", ...)` → same pattern
   - Line 2376: `fetch("/api/captures", ...)` → same pattern (GET)
   - Line 2395: `fetch("/api/settings-data", ...)` → same pattern
   - Line 2416: `fetch("/api/history", ...)` → same pattern
   - Line 2435: `fetch("/api/inspect", ...)` → same pattern
   - Line 2454: `fetch("/api/hooks", ...)` → same pattern
   - Line 2493: `fetch("/api/undo", ...)` → same pattern (GET)
   - Line 2512: `fetch("/api/cleanup", ...)` → same pattern (GET)
   - Line 2531: `fetch("/api/steer", ...)` → same pattern (GET)
   - Line 2549: `fetch("/api/undo", ...)` → POST
   - Line 2570: `fetch("/api/cleanup", ...)` → POST
   - Line 2593: `fetch("/api/captures", ...)` → POST
   - Line 2835: `fetch("/api/session/manage", ...)` → same pattern
   - Line 3886: `fetch("/api/session/command", ...)` → same pattern
   - Line 3912: `fetch("/api/session/command", ...)` → same pattern
   - Line 4041: `fetch("/api/boot", ...)` → same pattern
   - Line 4536: `fetch("/api/session/command", ...)` → same pattern
   - Line 4610: `fetch("/api/onboarding", ...)` → GET
   - Line 4639: `fetch("/api/onboarding", ...)` → POST
   - Remaining 4 calls: find with `grep -n 'fetch("/api' web/lib/gsd-workspace-store.tsx` and wrap any missed
   
   **Important:** Some `fetch` calls use template literals with query params, e.g.:
   ```ts
   fetch(`/api/doctor?scope=${encodeURIComponent(scope)}`, ...)
   ```
   These become:
   ```ts
   fetch(this.buildUrl(`/api/doctor?scope=${encodeURIComponent(scope)}`), ...)
   ```
   The `buildUrl` method handles this correctly via `URL` constructor — it appends `&project=` after existing params.

4. **Thread `buildUrl` through the EventSource URL.** At line 4734:
   ```ts
   // Before:
   const stream = new EventSource("/api/session/events")
   // After:
   const stream = new EventSource(this.buildUrl("/api/session/events"))
   ```

5. **Add `disconnectSSE()` method.** This closes the EventSource and nulls the reference without full dispose. Background stores call this when they're no longer the active project:
   ```ts
   disconnectSSE = (): void => {
     this.closeEventStream()
   }
   ```
   The existing `closeEventStream()` private method already handles null checks and cleanup. `disconnectSSE` is a public wrapper. The store stays alive — state preserved, listeners preserved, just no live event stream.

6. **Add `reconnectSSE()` method.** This reconnects the EventSource and refreshes boot state. Foregrounded stores call this when they become active:
   ```ts
   reconnectSSE = (): void => {
     if (this.disposed) return
     this.ensureEventStream()
     void this.refreshBoot({ soft: true })
   }
   ```
   `ensureEventStream()` already guards against duplicate connections (`if (this.eventSource || this.disposed) return`).

7. **Export `buildProjectUrl` as standalone utility.** Add a named export for T01's contract test and general use:
   ```ts
   export function buildProjectUrl(path: string, projectCwd?: string): string {
     if (!projectCwd) return path;
     const url = new URL(path, "http://localhost");
     url.searchParams.set("project", projectCwd);
     return url.pathname + url.search;
   }
   ```
   The instance method `buildUrl` can delegate to this: `private buildUrl(path: string): string { return buildProjectUrl(path, this.projectCwd); }`.

## Must-Haves

- [ ] `GSDWorkspaceStore` accepts `projectCwd?: string` constructor parameter
- [ ] `buildUrl()` correctly appends `?project=` (or `&project=`) using URL constructor
- [ ] All 28 `fetch()` calls wrapped with `this.buildUrl()`
- [ ] `EventSource` URL wrapped with `this.buildUrl()`
- [ ] `disconnectSSE()` closes EventSource without disposing store
- [ ] `reconnectSSE()` re-establishes EventSource and triggers soft boot refresh
- [ ] `buildProjectUrl` exported as standalone utility function
- [ ] Existing behavior unchanged when `projectCwd` is undefined (all URLs stay as-is)

## Verification

- `npm run build` — TypeScript compilation exits 0
- `npm run test:unit` — full regression passes (no existing test broken)
- `grep -c 'this.buildUrl' web/lib/gsd-workspace-store.tsx` — should be 29 (28 fetches + 1 EventSource)
- `grep -c 'fetch("/api' web/lib/gsd-workspace-store.tsx` — should be 0 (all wrapped)
- `grep 'disconnectSSE\|reconnectSSE' web/lib/gsd-workspace-store.tsx` — both methods exist
- `grep 'export function buildProjectUrl' web/lib/gsd-workspace-store.tsx` — utility exported

## Inputs

- `web/lib/gsd-workspace-store.tsx` — the 5123-line store file. Key landmarks:
  - Class declaration at line 1789: `export class GSDWorkspaceStore`
  - No explicit constructor — add one
  - `dispose()` at line 1828 — don't change this
  - `ensureEventStream()` at line 4732 — EventSource created here
  - 28 `fetch()` calls scattered throughout (confirmed by `grep -c`)
  - `GSDWorkspaceProvider` at line 4954 — currently `new GSDWorkspaceStore()` with no args
- S01 Summary — confirms all API routes accept `?project=` parameter, `resolveProjectCwd()` reads and URL-decodes it on the server side

## Expected Output

- `web/lib/gsd-workspace-store.tsx` — modified: constructor with `projectCwd`, `buildUrl()` method, all 28 fetch calls + EventSource wrapped, `disconnectSSE()`/`reconnectSSE()` methods, `buildProjectUrl` export

## Observability Impact

- **`?project=` in all fetches and SSE:** When `projectCwd` is set, every API call and the EventSource URL include `?project=<encoded-path>`. Server logs and network inspection reveal per-project request routing. When `projectCwd` is undefined, URLs are unchanged — no observable difference from pre-task behavior.
- **SSE lifecycle methods:** `disconnectSSE()` closes the EventSource without disposing the store. `reconnectSSE()` re-establishes the EventSource and triggers a soft boot refresh. Both are observable via `connectionState` in `getSnapshot()` — transitions between `"connected"`, `"disconnected"`, and `"connecting"`.
- **Failure visibility:** Per-project fetch failures surface through the existing `lastClientError` field in store state. SSE connection failures follow the existing reconnection/error state machine.
- **Inspection:** `buildProjectUrl("/api/boot", "/my/project")` can be called standalone to verify URL construction. `grep -c 'this.buildUrl' web/lib/gsd-workspace-store.tsx` confirms all call sites are wrapped.
