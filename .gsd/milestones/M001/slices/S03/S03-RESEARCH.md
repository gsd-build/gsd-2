# S03: Live terminal + focused prompt handling — Research

**Date:** 2026-03-14

## Summary

S03 directly owns **R006** and supports **R004**, **R005**, **R009**, and **R010**. The main surprise is that the backend transport is already much closer than the UI: the RPC protocol already defines `extension_ui_request` / `extension_ui_response`, the bridge already forwards those requests over SSE, and the same command route already accepts responses. What is missing is browser-side state and rendering. The current web store flattens rich events into summary strings, so the browser can tell that the agent is running, but not meaningfully stream assistant output or complete focused prompt flows.

The best path is to keep the current same-origin contract (`/api/boot`, `/api/session/events`, `/api/session/command`) and extend the browser store with typed live-interaction state: queued UI requests, live transcript/tool-stream state, keyed status/widget maps, title overrides, and editor text. Reuse the existing onboarding/focused-input patterns and the existing `Sheet` primitive for the focused panel. Do **not** build on `DualTerminal`; it is still mock-only. For transcript hydration and reconnect, use the already-available read-only RPC commands (`get_messages`, `get_last_assistant_text`) instead of inventing a PTY or scraping raw stdout.

## Recommendation

Use the existing bridge contract and make S03 primarily a **browser-state + rendering slice**, with only minimal protocol changes if verification shows they are necessary.

Recommended execution shape:

- Extend `web/lib/gsd-workspace-store.tsx` instead of replacing it.
  - Keep the current `useSyncExternalStore` pattern.
  - Add typed state for:
    - pending/active `extension_ui_request`s keyed by request id
    - streamed assistant/tool output
    - keyed `setStatus` texts
    - keyed `setWidget` content plus placement
    - `setTitle` override
    - `set_editor_text` buffer / compose state
- Treat request methods in two buckets:
  - **blocking**: `select`, `confirm`, `input`, `editor`
  - **fire-and-forget**: `notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`
- Render blocking requests in a focused side panel or equivalent persistent focused surface, not a modal. The existing `Sheet` primitive is already in the web UI and fits D004 better than adding a new interaction model.
- Reuse onboarding-gate patterns for form state, progress, cancel, and disabled/busy handling, but **do not** reuse the onboarding transport. Generic prompt handling should stay on the bridge SSE + command route.
- For the “live terminal” part, prefer the real event stream over summary lines:
  - use `message_update` + `assistantMessageEvent.type === "text_delta"` for assistant text streaming
  - use `tool_execution_update` for live tool progress when useful
  - use `get_messages` or `get_last_assistant_text` to reconcile after reconnect or refresh
- Add explicit browser affordances for `steer` and `abort`. Right now the terminal only sends `prompt` or `follow_up` automatically, which is not enough to satisfy the slice contract.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Prompt/interrupt transport | Existing RPC `extension_ui_request` / `extension_ui_response` over `/api/session/events` + `/api/session/command` | The protocol and bridge already exist and are tested; adding a second transport is churn. |
| Focused input surface | `web/components/gsd/onboarding-gate.tsx` + `web/components/ui/sheet.tsx` | The app already has focused, blocking browser UX patterns and a side-panel primitive that fits D004. |
| Transcript hydration / reconnect | Read-only RPC commands `get_messages` and `get_last_assistant_text` | Avoids inventing raw stdout scraping or a PTY path the architecture does not have. |
| Live status/widget surfaces | Existing `setStatus` / `setWidget` semantics from extension UI | Auto mode and shared widgets already rely on these contracts; S03 should make them visible, not replace them. |

## Existing Code and Patterns

- `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` — authoritative browser-facing contract for `prompt`, `steer`, `follow_up`, `abort`, and all `extension_ui_request` / `extension_ui_response` variants. Keep this discriminated union intact all the way to React.
- `packages/pi-coding-agent/src/modes/rpc/rpc-mode.ts` — the RPC child already emits all session events as JSON and resolves `extension_ui_response` by request id. It supports multiple pending request ids, so the browser should not assume a single global prompt.
- `src/web/bridge-service.ts` — already the right transport seam. It forwards UI requests, accepts UI responses, exposes read-only transcript commands, and owns the singleton bridge lifecycle.
- `web/lib/gsd-workspace-store.tsx` — correct high-level store pattern, but currently too lossy for S03. It needs richer state, not replacement.
- `web/components/gsd/onboarding-gate.tsx` — best existing pattern for a focused panel with progress, browser-auth CTA, input follow-up, cancel, and disabled/busy states.
- `web/components/ui/sheet.tsx` — ready-made side-panel primitive that matches the “focused panel” decision better than a modal.
- `web/components/gsd/terminal.tsx` — current live command input surface. Good entry point for prompt/follow-up submission, but it needs transcript rendering plus steer/abort affordances.
- `web/components/gsd/app-shell.tsx` — already mounts `OnboardingGate` globally, so there is an established place to mount a generic focused-interrupt surface.
- `web/components/gsd/dual-terminal.tsx` — avoid. It is a mock/prototype and will fight R005/R008 if used as a base.
- `src/resources/extensions/gsd/commands.ts` — concrete real consumer of `ctx.ui.input()` and `ctx.ui.select()`; this slice should make those flows viable in web mode.
- `src/resources/extensions/gsd/auto.ts` — real consumer of `ctx.ui.setStatus()` and `ctx.ui.setWidget()`; S03 can make the power/status surfaces meaningfully live before S04 finishes the rest of the view-model work.
- `src/resources/extensions/voice/index.ts` — real consumer of `ctx.ui.setEditorText()`; browser editor-text support is not hypothetical.

## Constraints

- S03 owns **R006** and supports **R004**, **R005**, **R009**, and **R010**.
- The bridge is a **single project-scoped singleton** with one active session snapshot. Browser state is single-session unless the bridge contract changes.
- The host talks to the agent over **JSONL RPC**, not a PTY. “Live terminal” must be built from events/messages, not raw shell output.
- `WorkspaceStoreState` currently has no dedicated prompt queue, transcript state, status map, widget map, title override, or editor buffer.
- `ExtensionUiRequestEvent` in the web store widens `method` to `string`, which throws away the protocol’s type safety right where S03 needs it most.
- `sanitizeEventPayload()` only redacts `extension_error`; generic `extension_ui_request` payloads are passed through untouched today.
- The terminal log is capped at `MAX_TERMINAL_LINES = 250`, which is fine for summaries but not a sufficient transcript model.
- Onboarding uses `/api/onboarding` plus polling. That UI is reusable; that transport is not the right abstraction for generic live prompt handling.

## Common Pitfalls

- **Building on `DualTerminal`** — it is fake/local-state UI. Extending it would reintroduce mock/live mixing and undercut R005/R008.
- **Adding a new websocket or PTY transport** — the bridge already exposes the needed same-origin SSE + POST seam. A new transport adds scope, bugs, and test surface without solving the actual gap.
- **Assuming only one pending prompt** — the RPC mode tracks pending requests in a `Map` keyed by id. The browser should queue and key requests, not store one boolean or one global modal state.
- **Treating summary strings as “streaming”** — today the store ignores `message_update` and `tool_execution_update`. R009 needs real deltas or transcript reconciliation, not more summary lines.
- **Ignoring method-specific payloads** — `select` may be multi-select (`allowMultiple`), `confirm` expects `confirmed`, `input`/`editor` expect `value`. Loose client typing here will create silent no-ops.
- **Echoing UI payloads into logs** — titles, messages, prefills, widget lines, and editor text can contain sensitive user text. Browser-visible summaries must not become a secret leak path.

## Open Risks

- Outstanding UI requests do **not** survive refresh/reopen today. SSE has no backlog, `/api/boot` has no pending-request state, and `bridge.subscribe()` only rebroadcasts status. If S03 does nothing here, S06 inherits a continuity hole.
- `extension_ui_response` has no acknowledgement beyond `202 { ok: true }`. If the request already timed out or the browser posts a stale id after refresh, the host ignores it and the browser cannot tell.
- Live transcript rendering can duplicate or drift after reconnect unless S03 combines live deltas with a reconciliation pass (`get_messages` / `get_last_assistant_text`).
- `setWidget` in RPC mode is limited to string-array widgets. The browser still needs an intentional mapping for `aboveEditor` vs `belowEditor` placement in the preserved shell.
- The current terminal input only auto-switches between `prompt` and `follow_up`. Without explicit `steer` and `abort` controls, S03 will only partially satisfy the slice contract.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js App Router | `wshobson/agents@nextjs-app-router-patterns` | available — `npx skills add wshobson/agents@nextjs-app-router-patterns` |
| React external-store UI | `vercel-labs/agent-skills@vercel-react-best-practices` | available — `npx skills add vercel-labs/agent-skills@vercel-react-best-practices` |

## Sources

- Rich UI-request/response protocol already exists for `select`, `confirm`, `input`, `editor`, `notify`, `setStatus`, `setWidget`, `setTitle`, and `set_editor_text` (source: `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts`).
- The RPC child emits all agent/session events as JSON and resolves `extension_ui_response` by request id; multiple pending UI requests are possible (source: `packages/pi-coding-agent/src/modes/rpc/rpc-mode.ts`).
- The bridge already forwards UI requests over SSE, accepts UI responses via the generic command route, allows read-only commands like `get_messages` / `get_last_assistant_text`, and only sanitizes `extension_error` today (source: `src/web/bridge-service.ts`).
- The web store currently reduces `extension_ui_request` to `[UI] ...`, ignores `message_update` / `tool_execution_update`, and only tracks summary terminal lines plus boot/onboarding state (source: `web/lib/gsd-workspace-store.tsx`).
- The terminal UI only supports prompt entry plus `/state`, `/new`, `/clear`; there are no abort/steer controls yet (source: `web/components/gsd/terminal.tsx`).
- The app shell already has a global focused-surface seam (`OnboardingGate`) and a reusable side-sheet primitive; `DualTerminal` is still mock-only (sources: `web/components/gsd/app-shell.tsx`, `web/components/gsd/onboarding-gate.tsx`, `web/components/ui/sheet.tsx`, `web/components/gsd/dual-terminal.tsx`).
- Real extension demand already exists: GSD commands use `input`/`select`, auto mode uses `setStatus`/`setWidget`, voice uses `setEditorText`, and memory/subagent use `confirm` (sources: `src/resources/extensions/gsd/commands.ts`, `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/voice/index.ts`, `packages/pi-coding-agent/src/resources/extensions/memory/index.ts`, `src/resources/extensions/subagent/index.ts`).
- Current tests prove SSE already carries `extension_ui_request`, but browser integration coverage stops at onboarding unlock and does not exercise live prompt responses or transcript streaming (sources: `src/tests/web-bridge-contract.test.ts`, `src/tests/integration/web-mode-runtime.test.ts`, `src/tests/integration/web-mode-onboarding.test.ts`).
- Next.js App Router route handlers support streaming `ReadableStream` responses, and React’s `useSyncExternalStore` is the correct subscription pattern for an external store like the current workspace store (sources: Context7 docs for `/vercel/next.js` and `/websites/react_dev`).
