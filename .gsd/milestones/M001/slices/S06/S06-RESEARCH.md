# S06: Power mode + continuity + failure visibility — Research

**Date:** 2026-03-15
**Status:** Complete

## Summary

S06 owns three requirements (R007, R009, R010) and supports two more (R004, R005). The codebase is closer to ready than the scope suggests — most of the hard wiring already happened in S03–S05 — but there are real gaps in three areas: (1) continuity across browser refresh/reopen, (2) actionable recovery surfaces for runtime failures, and (3) unbounded growth paths that will degrade the "snappy and fast" contract under long sessions.

The store's `GSDWorkspaceStore` already handles SSE auto-reconnection via native `EventSource` and the bridge service is a server-side singleton that survives browser refresh. However, there is no explicit state resynchronization on reconnect (the store reconnects the stream but doesn't re-fetch boot to reconcile stale local state), no `visibilitychange`-based soft refresh to catch up after tab backgrounding, no recovery affordances in the failure banners (they show errors but offer no action buttons), no stuck-command timeout, and no transcript cap. Power mode is already wired to real data but lacks integrated workflow controls and recovery surfaces.

The recommended approach is three task-sized cuts: (1) continuity hardening in the store (reconnect → soft boot refresh, visibility-change listener, command timeout, transcript cap), (2) failure visibility surfaces with recovery affordances in the app shell/dashboard (action banners instead of passive text, retry/reconnect buttons), and (3) power mode controls and continuity (workflow action bar in power mode header, view-state restoration hint via URL hash or sessionStorage).

## Recommendation

**Layer continuity and failure recovery into the existing store and UI surfaces rather than building new infrastructure.**

The store already tracks `connectionState`, `lastBridgeError`, `lastClientError`, `bootStatus`, and bridge phase. The failure visibility pattern (`getVisibleWorkspaceError` → error banner) already appears in app-shell, sidebar, and status bar. The fix is:

1. Make SSE reconnection trigger a soft boot refresh to resync state that may have changed while disconnected.
2. Add a `visibilitychange` listener that soft-refreshes on tab return after extended background time.
3. Add a command timeout so `commandInFlight` can't get permanently stuck (S05 flagged this).
4. Cap `liveTranscript` growth (S03 flagged this as unbounded).
5. Replace passive error text with actionable recovery banners — add retry/reconnect buttons next to error messages in the workspace error banner.
6. Add workflow action controls to Power Mode so it's not just a passive viewer.
7. Add a lightweight view-state restoration hint (sessionStorage for active view) so refresh doesn't always reset to dashboard.

This keeps changes localized to the existing store class and a small set of existing UI components. No new API endpoints. No new store fields beyond possibly a `lastVisibilityChange` timestamp.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| SSE auto-reconnect | Browser-native `EventSource` | Already handles reconnection; just need to hook the reconnect callback for state sync |
| Error state aggregation | `getVisibleWorkspaceError()` in store | Already aggregates bridge auth, validation, bridge error, and client error into a single surface |
| Status presentation | `getStatusPresentation()` in store | Already maps bootStatus/connectionState/onboarding/bridge into label+tone |
| Workflow action derivation | `deriveWorkflowAction()` in `workflow-actions.ts` | Already tested with 19 cases; reuse in Power Mode without reimplementing |
| Command routing | `sendCommand` + `buildPromptCommand` | All commands route through the same `/api/session/command` endpoint |
| View-state persistence | `sessionStorage` (browser-native) | Lightweight, doesn't survive cross-tab or incognito, which is fine for local view-state |

## Existing Code and Patterns

- `web/lib/gsd-workspace-store.tsx` — The singleton store class handles all state, SSE lifecycle, boot, and command dispatch. Continuity changes go here. Key patterns: `patchState` emits to all `useSyncExternalStore` consumers, `refreshBoot({ soft: true })` for non-destructive state sync, `ensureEventStream()` with `lastStreamState` tracking for reconnection flow.
- `web/lib/workflow-actions.ts` — Pure derivation function with `deriveWorkflowAction(input)` already tested. Power mode should import and reuse this directly (per D018).
- `web/components/gsd/app-shell.tsx` — Contains the `workspace-error-banner` div that shows `visibleError` as passive text. This is where recovery affordances should be added.
- `web/components/gsd/dual-terminal.tsx` — Power mode UI. Left pane (`AutoTerminal`) shows auto state, right pane delegates to `Terminal`. Needs workflow controls in the header area.
- `web/components/gsd/dashboard.tsx` — Has the `dashboard-action-bar` pattern with `deriveWorkflowAction`, action buttons, commandInFlight spinner, and disabled reason. Power mode should mirror this pattern.
- `web/components/gsd/sidebar.tsx` — Has `sidebar-quick-action` pattern, also uses `deriveWorkflowAction`. Already shows bridge errors.
- `web/components/gsd/status-bar.tsx` — Shows connection status, model, costs, and errors. Already wired.
- `src/web/bridge-service.ts` — Server-side singleton. `getProjectBridgeService()` returns the same instance across requests. The bridge subprocess uses `--continue --session-dir` so it naturally resumes the existing session on boot. `ensureStarted()` is idempotent. No retry logic exists — if the bridge process exits, the phase goes to `failed` and stays there until a new `ensureStarted()` is triggered by a boot or command request.

## Constraints

- D002: Preserve the exact existing `web/` skin — no UI redesign, just wire and harden.
- The bridge service has no built-in restart/retry after failure — the server-side `handleProcessExit` sets phase to `failed` permanently. Recovery requires a new `ensureStarted()` call, which happens on boot refresh or next command attempt.
- `EventSource` reconnection is browser-controlled (typically 3-second intervals per spec). The store can't control reconnection timing but can react to `onopen` after reconnection.
- `commandInFlight` is a single string — concurrent rapid commands could collide if the bridge doesn't serialize them (S03 flagged this). Not a problem for S06 but limits the timeout implementation to a simple safety net.
- `liveTranscript` is `string[]` with no cap. Terminal lines are capped at 250 via `MAX_TERMINAL_LINES`. Transcript needs an analogous cap.
- The store's `patchState` triggers all subscribers on every call. Rapid state updates (e.g., streaming text) already work but any new periodic polling must avoid flooding.
- No `visibilitychange` handler exists anywhere in the codebase. Adding one is straightforward in the store's `start()` method.
- The `GSDWorkspaceProvider` creates and starts the store in a `useEffect` — React Strict Mode will double-mount in dev, but the store's `started` flag prevents double-init. `dispose()` cleans up SSE and timers.

## Common Pitfalls

- **Soft-refresh after SSE reconnect causes double-boot** — The store already deduplicates via `bootPromise`. If `refreshBoot` is already in-flight, the second call awaits the same promise. Safe.
- **Visibility-change fires too aggressively** — `visibilitychange` fires on every tab switch. Gate it with a minimum elapsed time (e.g., 30s since last boot) to avoid flooding the server with boot requests.
- **Command timeout races with legitimate slow commands** — Some RPC commands (prompt, auto start) can take many seconds. The timeout should be generous (60–90s) and only clear `commandInFlight`, not kill the bridge.
- **Transcript cap breaks turn-boundary logic** — `handleTurnBoundary` appends to `liveTranscript`. Capping should slice from the front (oldest blocks), not interfere with the append.
- **SessionStorage view state persists across projects** — The key should include the project cwd to avoid cross-project bleed.
- **Error banner with retry button triggers boot during onboarding** — `refreshBoot` during onboarding should work fine (the boot endpoint always returns), but recovery affordances should be disabled or hidden while onboarding is locked.

## Open Risks

- **Bridge failure is permanent until someone triggers ensureStarted** — If the RPC subprocess crashes, the bridge phase goes to `failed` and stays there. The SSE stream will keep delivering `bridge_status` events with `phase: "failed"`, but the store doesn't trigger a restart. A boot refresh will call `ensureStarted()` again, which will attempt a new subprocess spawn. This means the "retry bridge" recovery path is just `refreshBoot()`, which is simple but the user needs a button to invoke it.
- **No pending-UI-request replay after refresh** — If the agent sent a blocking `extension_ui_request` and the user refreshes the browser, the pending request is lost from the store (it's only in-memory). The RPC subprocess may still be waiting for the response. There's no mechanism to re-fetch pending requests. This is a known gap that S06 should document but may not be able to fully solve without bridge-side changes.
- **Long-session token growth** — Even with a transcript cap, the store accumulates terminal lines (250 cap), transcript blocks, status texts, and widget contents. For truly long auto-mode runs, the DOM rendering cost of hundreds of terminal lines without virtualization could become noticeable. Virtualization is out of scope for S06 but the cap provides the safety net.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js App Router | `wshobson/agents@nextjs-app-router-patterns` | available (noted in prior slices) |
| React external-store | (none found with sufficient relevance) | n/a |
| SSE / EventSource | (none found with sufficient relevance) | n/a |

No new skills are recommended for installation. The work is primarily store logic and small UI surface changes using patterns already established in S03–S05.

## Sources

- Existing codebase (all findings from direct code inspection of the files listed above)
- S03 forward intelligence: `liveTranscript` unbounded growth warning, `commandInFlight` concurrency note
- S05 forward intelligence: `refreshBoot` after session switch has no error handling, `commandInFlight` can leave controls permanently disabled
- S06 context document: scope, constraints, and open questions
