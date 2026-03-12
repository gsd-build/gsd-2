# Phase 9: Live Preview - Research

**Researched:** 2026-03-12
**Domain:** Bun HTTP proxy, stdout URL detection, iframe viewport management, session persistence
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Panel behavior**: Overlay drawer (not a ViewType). Cmd+P or toggle button slides panel in from right over current view. Chat, milestones etc. remain accessible behind it. Cmd+P again dismisses it.
- **Toggle button placement**: Far right of session tabs row (same horizontal band as chat session tabs). Preview width fills all space to the right of Chat column 1. Chat column 1 always stays visible.
- **Port detection**: Auto-detect via stdout parsing of `localhost:PORT` or `http://127.0.0.1:PORT` patterns. Auto-open preview panel on detection. Editable port field in preview header. No periodic polling.
- **Viewport options**: Desktop (1440px), Tablet (768px), Mobile (375px), Dual (iPhone 14 + Pixel frames side by side, same URL). Device frames are web-only. Native mobile apps get "No web preview available for native apps" empty state.
- **Dev server offline state (PREV-04)**: Clean empty state with message "Dev server offline — start your dev server to preview" + last known port. No auto-reconnect polling.
- **PREV-05 out of scope**: Audit screenshot comparison removed from this phase.
- **Session persistence (SERV-07)**: `.planning/.mission-control-session.json` persists: panel sizes (react-resizable-panels layout prefs), chat history (last 50 per session tab), last viewed state (always reopens to Chat view), active viewport size.

### Claude's Discretion

- Exact proxy implementation (Bun.serve() fetch forwarding vs dedicated proxy middleware)
- How to handle WebSocket connections through the proxy (dev servers often use HMR WebSockets)
- Device frame SVG/CSS design (iPhone 14 and Pixel chrome aesthetics)
- Error handling for proxy failures (connection refused, timeout)
- Where in the server pipeline stdout URL detection plugs in (mode-interceptor.ts extension or new parser)

### Deferred Ideas (OUT OF SCOPE)

- Dual-source Expo preview (two separate dev server ports for iOS/Android Metro bundlers)
- PREV-05 audit screenshot comparison
- Auto-reconnect polling when dev server goes offline
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-06 | Dev server proxy routes `/preview` path to configurable project dev server port | Bun fetch forwarding + new `/api/preview/*` route in server.ts; proxy-api.ts following handleFsRequest pattern |
| SERV-07 | Session file (`.planning/.mission-control-session.json`) persists layout prefs, chat history (last 50), last viewed state | New session-persistence-api.ts; read/write on AppShell mount/unmount; separate from `.session-metadata.json` |
| PREV-01 | Preview panel toggles via Cmd+P or toolbar button, slides in from right | `usePreview` hook for open/close state; keydown listener for Cmd+P; `animate-in slide-in-from-right` tw-animate-css pattern |
| PREV-02 | Viewport switcher: Desktop (1440px), Tablet (768px), Mobile (375px), Dual | PreviewPanel component with viewport state; iframe width constraint; device frame components for Dual mode |
| PREV-03 | Live iframe proxied through Bun to project dev server | Bun fetch proxy in server.ts; `src` attribute points to `/api/preview/` passthrough URL |
| PREV-04 | Dev server offline shows clean empty state, not broken iframe | `onError` on iframe element + error boundary; PanelWrapper `error > isLoading > isEmpty > children` pattern |
| PREV-05 | (OUT OF SCOPE per CONTEXT.md — removed from this phase) | N/A |
</phase_requirements>

## Summary

Phase 9 adds a live preview overlay to Mission Control. The preview panel slides in from the right over the existing chat/dashboard view — it is not a new ViewType. Three independently implementable pieces need to ship together: a Bun HTTP proxy that forwards `/api/preview/*` requests to the project's dev server, a stdout URL parser that auto-detects dev server ports and fires a `preview_open` WebSocket event, and the React PreviewPanel component with viewport switching and Dual device frames.

The most technically nuanced piece is the Bun proxy: Bun's `Bun.serve()` fetch handler can forward requests directly using `fetch(proxiedUrl, ...)` and stream the response back. HMR WebSocket upgrade requests from the dev server (e.g., Vite HMR on the same port) cannot be proxied through this route — they require a separate WebSocket proxy or a note that HMR goes direct. This is a discretionary decision: the preview iframe will still reload correctly when the user refreshes; HMR will simply not flow through the proxy.

Session persistence (SERV-07) introduces a new file (`.planning/.mission-control-session.json`) that is distinct from the already-implemented `.session-metadata.json`. The schema must be defined and wired into AppShell's mount/unmount lifecycle. The existing `session-manager.ts` pattern (sync JSON write, async read) is the correct model to follow.

**Primary recommendation:** Implement in three waves — (1) proxy + stdout detection + WebSocket event, (2) session persistence schema + read/write API, (3) PreviewPanel UI with viewport switcher and Dual device frames.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun.serve() fetch handler | Bun 1.x (runtime) | HTTP proxy forwarding | Already the server runtime; no new dependency needed |
| React 19 | ^19.2.4 | PreviewPanel component | Already the UI framework |
| tw-animate-css | ^1.4.0 | `slide-in-from-right` animation | Already used for DecisionLogDrawer and other overlays |
| lucide-react | ^0.577.0 | Monitor/Tablet/Phone/Columns icons for viewport switcher | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs/promises | built-in | Session persistence read/write | Same pattern as settings-api.ts and session-manager.ts |
| node:crypto randomUUID | built-in | (already in use) | Not needed for this phase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bun fetch forwarding | http-proxy-middleware | Adds a Node.js-era dependency; Bun's native fetch is simpler and zero-dep |
| tw-animate-css slide-in | Framer Motion | Framer not in project; tw-animate-css already used and sufficient for this use case |
| iframe src pointing to proxy | iframe src pointing directly to dev server port | Direct iframe avoids proxy complexity but same-origin restrictions may apply; proxy also enables future auth headers injection |

**Installation:** No new packages needed. All required libraries are already in `package.json`.

## Architecture Patterns

### Recommended Project Structure
```
src/server/
├── proxy-api.ts             # new: Bun fetch forwarding + WebSocket detection
├── session-persistence-api.ts  # new: read/write .mission-control-session.json
├── mode-interceptor.ts      # extend: add URL detection to parseStreamForModeEvents

src/components/
├── preview/
│   ├── PreviewPanel.tsx         # new: pure render (no hooks)
│   ├── PreviewPanelWithState.tsx # new: stateful wrapper (open/close, port, viewport)
│   ├── ViewportSwitcher.tsx     # new: Desktop/Tablet/Mobile/Dual buttons
│   └── DeviceFrame.tsx          # new: iPhone 14 and Pixel chrome SVG/CSS shells

src/hooks/
└── usePreview.ts            # new: open/closed state, port, viewport, Cmd+P binding
```

### Pattern 1: Bun Proxy Route (SERV-06)
**What:** A new route in `server.ts` forwards `/api/preview/*` requests to `localhost:{detectedPort}`.
**When to use:** Any time a client loads the preview iframe.
**Key detail:** Must strip the `/api/preview` prefix before forwarding. Must pass headers through. Must return error response (not crash) if dev server is unreachable.

```typescript
// Source: verified against Bun.serve() fetch API, Bun docs
// In server.ts fetch handler:
if (pathname.startsWith("/api/preview/")) {
  const response = await handleProxyRequest(req, url, pipeline.getPreviewPort());
  if (response) return addCorsHeaders(response);
}

// In proxy-api.ts:
export async function handleProxyRequest(
  req: Request,
  url: URL,
  port: number | null
): Promise<Response | null> {
  if (!port) return Response.json({ error: "No dev server port" }, { status: 503 });
  const targetPath = url.pathname.replace("/api/preview", "") || "/";
  const targetUrl = `http://localhost:${port}${targetPath}${url.search}`;
  try {
    const proxied = await fetch(targetUrl, {
      method: req.method,
      headers: req.headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    });
    return new Response(proxied.body, {
      status: proxied.status,
      headers: proxied.headers,
    });
  } catch {
    return new Response("Dev server unreachable", { status: 503 });
  }
}
```

### Pattern 2: Stdout URL Detection (extends mode-interceptor.ts)
**What:** Add `dev_server_detected` as a new ModeEvent type. The existing `parseStreamForModeEvents` pure function gains a URL pattern scan pass. When `localhost:PORT` or `http://127.0.0.1:PORT` appears in stripped text, emit the event.
**When to use:** On every text_delta chunk from Claude Code stdout.
**Key detail:** Must NOT add a new tag — this is plain text pattern matching. Run the URL scan on the `stripped` output (after XML tag removal) so mode tags don't interfere.

```typescript
// Source: modeled on existing parseStreamForModeEvents return shape
// Regex to detect dev server URLs in plain Claude Code output:
const DEV_SERVER_RE = /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1):(\d+)/g;

// After existing XML tag processing, scan stripped text:
const urlMatches = [...stripped.matchAll(DEV_SERVER_RE)];
for (const m of urlMatches) {
  events.push({ type: "dev_server_detected", port: parseInt(m[1], 10) });
}
```

The `pipeline.ts` wireSessionEvents handler then broadcasts a `preview_open` WebSocket event and updates the stored port:
```typescript
// In wireSessionEvents, handle dev_server_detected mode event:
if (modeEvent.type === "dev_server_detected") {
  pipeline.setPreviewPort(modeEvent.port!);
  wsServer.publishChat({ type: "preview_open", port: modeEvent.port });
}
```

### Pattern 3: PreviewPanel Overlay (PREV-01, PREV-02, PREV-03, PREV-04)
**What:** An absolutely-positioned overlay rendered in `AppShell` alongside `SingleColumnView`. Uses `animate-in slide-in-from-right duration-200` (same as DecisionLogDrawer). Panel occupies all space to the right of Chat column 1.
**When to use:** When `previewOpen === true`.

```tsx
// Source: DecisionLogDrawer.tsx animation pattern
// In AppShell render (dashboard mode):
<div className="relative min-w-0 flex-1">
  <SingleColumnView ... />
  {previewOpen && (
    <PreviewPanelWithState
      port={previewPort}
      viewport={previewViewport}
      onClose={() => setPreviewOpen(false)}
      onPortChange={setPreviewPort}
      onViewportChange={setPreviewViewport}
    />
  )}
</div>
```

The panel itself uses `position: absolute; inset: 0; left: <chat-col-1-width>` or a CSS flex approach where Chat column 1 remains a fixed-width flex child.

### Pattern 4: Session Persistence (SERV-07)
**What:** A new `session-persistence-api.ts` reads/writes `.planning/.mission-control-session.json`. Schema versioned for forward compatibility.
**When to use:** Read on AppShell mount (after `usePlanningState` resolves), write on `beforeunload` and on every significant state change (viewport change, session tab change).

```typescript
// Source: modeled on session-manager.ts persistMetadataSync pattern
interface SessionPersistence {
  version: 1;
  layoutPrefs: Record<string, unknown>;  // react-resizable-panels storage key/value
  chatHistory: Record<string, ChatMessage[]>;  // sessionId -> last 50 messages
  lastView: "chat";  // always "chat" per CONTEXT.md locked decision
  activeViewport: "desktop" | "tablet" | "mobile" | "dual";
}
```

The existing `session-manager.ts` already uses `writeFileSync` for synchronous persistence — follow the same pattern. `readFile` (async) on startup; `writeFileSync` on state changes.

### Pattern 5: Iframe Offline Empty State (PREV-04)
**What:** The iframe `onError` event does not fire reliably when the proxied URL returns 503 — the iframe treats the page content as loaded. Instead, use the proxy's 503 response combined with a dedicated status check endpoint.
**Approach:** Before setting the iframe `src`, ping `/api/preview/` (HEAD request). If 503, show empty state. On `preview_open` event from WebSocket, re-attempt. This avoids broken iframe display.

```tsx
// Alternative: inject a thin error-page at proxy 503 responses
// so the iframe shows the "offline" state as page content.
// Proxy returns HTML error page on 503 instead of empty body.
if (!port) {
  return new Response(
    `<html><body style="background:#0a0f1e;color:#64748b;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <p>Dev server offline — start your dev server to preview</p>
    </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
```

This renders the offline message inside the iframe itself — no React error boundary needed, the iframe always has valid content.

### Pattern 6: usePreview Hook
**What:** Manages preview open/closed, detected port, viewport. Listens to `preview_open` WebSocket event from the existing chat topic. Registers Cmd+P keyboard shortcut.
**Key detail:** Raw WebSocket (same approach as `useChatMode.tsx` — not `useReconnectingWebSocket` since ws ref isn't exposed). Cmd+P is `event.metaKey && event.key === "p"` (Mac) or `event.ctrlKey && event.key === "p"` (Windows).

```typescript
// Source: modeled on useChatMode.tsx pattern
useEffect(() => {
  const ws = new WebSocket("ws://localhost:4001");
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "preview_open") {
      setPort(data.port);
      setOpen(true);
    }
  };
  return () => ws.close();
}, []);

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "p") {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

### Anti-Patterns to Avoid
- **Adding `preview` to ViewType**: Preview is an overlay, not a view. Adding it to the ViewType discriminated union would break the "Chat column 1 always visible" requirement.
- **Using a separate Bun.serve() instance for the proxy**: The proxy belongs in the existing server.ts fetch handler — adding a second `Bun.serve()` creates port management complexity.
- **Polling for dev server status**: Explicitly deferred. stdout detection + manual refresh is the approach.
- **Storing chat history in session-metadata.json**: The new `.mission-control-session.json` is the persistence target. Mixing concerns into the existing metadata file creates schema conflicts.
- **HMR WebSocket forwarding through the proxy**: Vite HMR WebSocket upgrades cannot be proxied via Bun's HTTP fetch handler. Accept this limitation — the iframe preview still works for static content loads; HMR simply doesn't flow through the proxy path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS slide animations | Custom CSS keyframes | `animate-in slide-in-from-right duration-200` (tw-animate-css) | Already used in project (DecisionLogDrawer), same visual language |
| Icon set for viewport switcher | SVG icons | lucide-react Monitor/Tablet/Smartphone icons | Already installed; Monitor=1440px, Tablet=768px, Smartphone=375px |
| JSON persistence read/write | Custom serialization | `node:fs/promises` readFile + `node:fs` writeFileSync | Exact same pattern as session-manager.ts |
| Keyboard shortcut registration | Custom event system | `window.addEventListener("keydown", ...)` in useEffect | Simple, reliable, already pattern in codebase |
| Offline HTML page | React component error boundary | HTML string returned from proxy at 503 | Iframe renders it; zero React complexity |

**Key insight:** This phase has no new library dependencies. Every tool needed is already installed. The value is integration wiring, not new library adoption.

## Common Pitfalls

### Pitfall 1: iframe `onError` Not Firing for Non-Network Errors
**What goes wrong:** The React `onError` prop on `<iframe>` only fires for resource load failures (e.g., blocked by CSP), not when the iframe loads a 503 HTTP response. If the proxy returns a 503 body, the iframe considers it a successful load.
**Why it happens:** HTTP 503 is a valid response with a body. The iframe loads the body as page content.
**How to avoid:** Return a styled HTML error page at the proxy layer for 503/connection-refused cases. The iframe renders the offline message as content rather than a broken frame.
**Warning signs:** `onError` never fires even when dev server is clearly down.

### Pitfall 2: X-Frame-Options / CSP Blocking the Iframe
**What goes wrong:** Some dev servers (particularly create-react-app legacy, some Vite configs) set `X-Frame-Options: SAMEORIGIN` or `Content-Security-Policy: frame-ancestors 'self'`. The iframe is blocked.
**Why it happens:** Modern dev tooling includes security headers by default.
**How to avoid:** Strip `X-Frame-Options` and `Content-Security-Policy` frame-related headers from proxied responses before passing them to the client. In `proxy-api.ts`, delete these headers from `proxied.headers` before constructing the `Response`.
**Warning signs:** Browser console shows "Refused to display ... in a frame" errors.

```typescript
// Strip framing-restrictive headers from proxied response
const headers = new Headers(proxied.headers);
headers.delete("x-frame-options");
headers.delete("content-security-policy");
return new Response(proxied.body, { status: proxied.status, headers });
```

### Pitfall 3: Port Stored Globally vs Per-Project
**What goes wrong:** The detected dev server port is stored as a module-level variable in the pipeline. When the user switches projects, the old port from the previous project still shows in the preview header.
**Why it happens:** Project switch clears the planning dir and session state but doesn't reset preview port.
**How to avoid:** Store detected port inside the pipeline handle (reset to `null` on `switchProject`). Expose `getPreviewPort()` and `setPreviewPort()` on `PipelineHandle` interface.
**Warning signs:** After project switch, preview loads old project's dev server URL.

### Pitfall 4: `Cmd+P` Conflicting with Browser Print
**What goes wrong:** `Cmd+P` / `Ctrl+P` is the browser's native "Print" shortcut. Registering without `e.preventDefault()` opens the print dialog.
**Why it happens:** Default browser behavior for `keydown` on `p` with meta/ctrl.
**How to avoid:** Always call `e.preventDefault()` before toggling preview open state.
**Warning signs:** Print dialog opens when trying to toggle preview.

### Pitfall 5: Chat History Cap Not Enforced Per-Session
**What goes wrong:** Session persistence saves "all" messages rather than the last 50, causing the JSON file to grow unboundedly over long sessions.
**Why it happens:** Simple `messages.slice()` without a cap.
**How to avoid:** In the write path, always slice to the last 50: `messages.slice(-50)`. Enforce this in `session-persistence-api.ts`, not in the component.
**Warning signs:** `.mission-control-session.json` grows to megabytes after active use.

### Pitfall 6: Dual Viewport IDs Collide
**What goes wrong:** When rendering two iframes in Dual mode, both `id` attributes being the same causes DOM weirdness.
**Why it happens:** Copy-paste error in DeviceFrame component.
**How to avoid:** Use `id="preview-iframe-iphone"` and `id="preview-iframe-pixel"` respectively. Never rely on id uniqueness for the same URL — use separate `key` props on the frame wrappers.

### Pitfall 7: URL Detection False Positives in Claude Output
**What goes wrong:** Claude Code often logs URLs for API endpoints, GitHub links, documentation links. These fire `dev_server_detected` and auto-open preview when they shouldn't.
**Why it happens:** The regex `localhost:\d+` correctly matches `localhost:3000` but `http://api.github.com` does not — the real risk is Claude Code logging its own dev server on a non-HTTP service port or logging `localhost:4001` (the WS server itself).
**How to avoid:** Exclude well-known Mission Control ports (4000, 4001) from detection. Only accept ports in the range 1024–65535, excluding 4000/4001.

```typescript
const EXCLUDED_PORTS = new Set([4000, 4001]);
// After matching port from stdout:
if (!EXCLUDED_PORTS.has(port) && port > 1023 && port < 65536) {
  events.push({ type: "dev_server_detected", port });
}
```

## Code Examples

### Proxy Route Handler (server.ts addition)
```typescript
// Source: existing route dispatcher pattern in server.ts
// Add before the 404 fallback:
if (pathname.startsWith("/api/preview")) {
  const response = await handleProxyRequest(req, url, pipeline.getPreviewPort());
  if (response) return addCorsHeaders(response);
}
```

### Session Persistence Schema
```typescript
// Source: modeled on PersistedMetadata in session-manager.ts
// .planning/.mission-control-session.json
interface MissionControlSession {
  version: 1;
  layoutPrefs: Record<string, number>;   // panel group id -> size in pixels
  chatHistory: Record<string, Array<{    // sessionId -> last 50 messages
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
  }>>;
  lastView: "chat";                      // always "chat" — locked decision
  activeViewport: "desktop" | "tablet" | "mobile" | "dual";
}
```

### Device Frame CSS (Dual Mode)
```typescript
// Source: CSS-only device frames are industry standard for preview tools
// iPhone 14: 390x844, corner radius 47px, notch
// Pixel 7: 412x915, corner radius 17px, punch-hole camera
// Outer shell rendered as styled div; iframe inside with overflow:hidden + matching border-radius
const DEVICE_FRAMES = {
  iphone: { width: 390, height: 750, radius: 47, label: "iPhone 14" },
  pixel: { width: 412, height: 750, radius: 17, label: "Pixel 7" },
} as const;
```

### WebSocket Event Types (chat-types.ts additions)
```typescript
// New ModeEventType variants:
| "dev_server_detected"    // port detected in stdout
// New top-level broadcast types (not ModeEvents — go via publishChat):
// { type: "preview_open", port: number }
// { type: "preview_close" }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `http-proxy` npm package for Node.js | Bun native `fetch()` forwarding | Bun 1.0 (2023) | No dependency needed; same-process forwarding is simpler |
| `X-Frame-Options` header universally blocking iframes | Strip framing headers in proxy layer | Always been the approach | Proxying is the canonical workaround |
| Full chat history persisted in memory only | Last-N persistence with session file | Standard pattern | Bounded memory and restartability |

**Deprecated/outdated:**
- `http-proxy-middleware`: Node.js-era solution. Not needed in Bun-native projects.
- Polling for dev server readiness: Explicitly deferred by CONTEXT.md decision.

## Open Questions

1. **HMR WebSocket forwarding through proxy**
   - What we know: Vite/webpack HMR opens a WebSocket from the browser to the dev server. The proxy handles HTTP fetch but cannot upgrade HTTP connections to WebSocket via `fetch()`.
   - What's unclear: Whether users will notice broken HMR in the previewed iframe enough to care.
   - Recommendation: Accept HMR not flowing through the proxy in this phase. Document as a known limitation. The preview shows the app at any given state; manual refresh re-renders correctly.

2. **`pipeline.getPreviewPort()` / `setPreviewPort()` thread safety in Bun**
   - What we know: Bun is single-threaded. The pipeline handle is created once and mutated synchronously.
   - What's unclear: Whether concurrent WebSocket connections receiving stdout events could race on port assignment.
   - Recommendation: Store port as a simple `let port: number | null = null` closure variable in `startPipeline`. Last-write wins. Acceptable for this use case — dev server port rarely changes mid-session.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test (bun:test), happy-dom for React component tests |
| Config file | none — Bun discovers `tests/*.test.ts` and `tests/*.test.tsx` automatically |
| Quick run command | `cd packages/mission-control && bun test tests/proxy-api.test.ts tests/mode-interceptor.test.ts tests/session-persistence.test.ts` |
| Full suite command | `cd packages/mission-control && bun test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SERV-06 | Proxy forwards `/api/preview/*` to `localhost:{port}`, strips framing headers, returns 503 HTML when port null | unit | `bun test tests/proxy-api.test.ts -t "proxy"` | ❌ Wave 0 |
| SERV-07 | Session file reads/writes layout prefs, chat history capped at 50, viewport, always reopens to chat view | unit | `bun test tests/session-persistence.test.ts` | ❌ Wave 0 |
| PREV-01 | Cmd+P toggles preview open; toggle button in session tabs row triggers same state | unit (hook) | `bun test tests/usePreview.test.ts` | ❌ Wave 0 |
| PREV-02 | Viewport switcher cycles Desktop/Tablet/Mobile/Dual; iframe width constraint applied correctly; Dual renders two device frames | unit (component) | `bun test tests/preview-panel.test.tsx` | ❌ Wave 0 |
| PREV-03 | Iframe src points to `/api/preview/`; proxy passes through 200 responses from dev server | integration (manual smoke) + unit | `bun test tests/proxy-api.test.ts` | ❌ Wave 0 |
| PREV-04 | Proxy returns offline HTML when port null; iframe shows offline message not blank/error | unit | `bun test tests/proxy-api.test.ts -t "offline"` | ❌ Wave 0 |

Also extend `mode-interceptor.test.ts` (existing ✅) with:
- URL detection extracts port from `localhost:3000` in stripped text
- Mission Control own ports (4000, 4001) are excluded
- False positive non-localhost URLs do not trigger events

### Sampling Rate
- **Per task commit:** `cd packages/mission-control && bun test tests/proxy-api.test.ts tests/mode-interceptor.test.ts tests/session-persistence.test.ts tests/usePreview.test.ts`
- **Per wave merge:** `cd packages/mission-control && bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/proxy-api.test.ts` — covers SERV-06, PREV-03, PREV-04
- [ ] `tests/session-persistence.test.ts` — covers SERV-07
- [ ] `tests/usePreview.test.ts` — covers PREV-01 (hook logic extracted as pure function for testability)
- [ ] `tests/preview-panel.test.tsx` — covers PREV-02 (PreviewPanel pure render component)
- [ ] Extend `tests/mode-interceptor.test.ts` — URL detection cases for dev_server_detected

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of `src/server.ts`, `src/server/pipeline.ts`, `src/server/mode-interceptor.ts`, `src/server/chat-types.ts`, `src/server/session-manager.ts`, `src/server/ws-server.ts` — integration point locations verified
- Direct codebase inspection of `src/components/layout/AppShell.tsx`, `src/components/layout/SingleColumnView.tsx`, `src/components/views/ChatView.tsx`, `src/components/chat/SessionTabs.tsx`, `src/components/chat/DecisionLogDrawer.tsx` — overlay pattern and animation class usage verified
- Direct codebase inspection of `src/lib/view-types.ts` — confirmed preview is NOT a ViewType
- Direct codebase inspection of `package.json` — confirmed tw-animate-css ^1.4.0, lucide-react, react-resizable-panels all installed
- Direct codebase inspection of `tests/` directory — confirmed bun:test framework, no additional test config needed

### Secondary (MEDIUM confidence)
- Bun.serve() fetch forwarding: verified pattern by reading server.ts existing route handlers; Bun fetch API is standard fetch-compatible
- `animate-in slide-in-from-right duration-200` class names verified in DecisionLogDrawer.tsx as live working example

### Tertiary (LOW confidence)
- X-Frame-Options stripping in proxy: standard web practice, not verified against specific Vite version behavior — treat as HIGH probability but flag for smoke test verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — all integration points identified by reading actual source files
- Pitfalls: HIGH (1,3,4,5,6,7) / MEDIUM (2 — CSP/X-Frame behavior depends on user's dev server config)

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable dependencies; Bun API unlikely to change materially in 30 days)
