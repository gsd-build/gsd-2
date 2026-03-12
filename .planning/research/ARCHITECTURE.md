# Architecture Research

**Domain:** Local Bun-powered React dashboard with real-time file-watching and WebSocket state sync
**Researched:** 2026-03-10
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
                         Browser (React 19 SPA)
 +-----------------------------------------------------------------+
 |  Sidebar  |  Milestone  |  Slice   |  Active  |  Chat  | Preview|
 |  Panel    |  View       |  Detail  |  Task    |  Panel | Panel  |
 +-----+-----+------+------+----+-----+----+-----+---+----+---+----+
       |             |           |          |         |        |
       +-------------+-----------+----------+---------+--------+
                              |
                     WebSocket Connection
                     (Bun pub/sub topics)
                              |
 +-----------------------------------------------------------------+
 |                     Bun Server (single process)                  |
 |                                                                  |
 |  +----------------+  +----------------+  +-------------------+   |
 |  | File Watcher   |  | State Deriver  |  | WebSocket Hub     |   |
 |  | (fs.watch)     |->| (parse/diff)   |->| (topic: "state")  |   |
 |  +----------------+  +----------------+  +-------------------+   |
 |                                                                  |
 |  +----------------+  +----------------+  +-------------------+   |
 |  | HTTP Router    |  | Chat Manager   |  | Preview Proxy     |   |
 |  | (API + static) |  | (child proc)   |  | (localhost proxy)  |   |
 |  +----------------+  +----------------+  +-------------------+   |
 |                                                                  |
 +-----------------------------------------------------------------+
              |                    |
     .planning/ files       Claude Code
     (read only)            (child process)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **File Watcher** | Monitor `.planning/` directory tree for changes, debounce events, emit normalized change signals | `fs.watch()` with `recursive: true`, 50ms debounce, ignore non-relevant files |
| **State Deriver** | Read changed files, parse markdown/JSON, compute diff against cached state, produce minimal update payloads | Pure functions: file path -> parsed structure. In-memory cache of last-known state per file. Diff produces JSON patches. |
| **WebSocket Hub** | Manage client connections, broadcast state updates via pub/sub topics, handle client messages | Bun's native `ServerWebSocket` with topic-based pub/sub. Topics: `state`, `chat`, `preview` |
| **HTTP Router** | Serve React SPA static files, handle REST API endpoints (session info, manual triggers) | `Bun.serve()` fetch handler with path matching. SPA fallback for non-API routes. |
| **Chat Manager** | Spawn Claude Code as child process, stream stdout/stderr to WebSocket, manage process lifecycle | `Bun.spawn()` with stdin pipe for input, stdout ReadableStream for streaming output to clients |
| **Preview Proxy** | Forward requests to a local dev server, strip credentials, serve in iframe | HTTP fetch proxy within Bun.serve() for `/preview/*` routes |
| **React Panel System** | Render 5 resizable panels, subscribe to WebSocket state updates, handle user interactions | Zustand stores per domain (project state, chat, preview). WebSocket client feeds stores. |

## Recommended Project Structure

```
packages/mission-control/
  src/
    server/                   # Bun server-side code
      index.ts                # Entry point: Bun.serve() setup
      watcher.ts              # File watcher with debounce
      state/                  # State derivation
        deriver.ts            # Orchestrates file->state pipeline
        parsers/              # Per-file-type parsers
          roadmap.ts          # Parse ROADMAP.md
          milestones.ts       # Parse milestone files
          plans.ts            # Parse plan files
          project.ts          # Parse PROJECT.md
        differ.ts             # Compute minimal diffs
        cache.ts              # In-memory state cache
      ws/                     # WebSocket management
        hub.ts                # Connection lifecycle + pub/sub
        protocol.ts           # Message type definitions (shared)
      chat/                   # Chat/Claude Code integration
        manager.ts            # Process lifecycle
        intent.ts             # Hybrid intent classifier
        stream.ts             # stdout -> WebSocket bridge
      proxy.ts                # Dev server preview proxy
      routes.ts               # HTTP API routes

    client/                   # React SPA
      index.html              # Entry point (Bun HTML import)
      App.tsx                 # Root component, layout shell
      stores/                 # Zustand stores
        project.ts            # Project/milestone/phase state
        chat.ts               # Chat messages and status
        ui.ts                 # Panel sizes, viewport, navigation
      hooks/                  # Custom React hooks
        useWebSocket.ts       # WebSocket connection + reconnect
        useProjectState.ts    # Subscribe to project store slices
      panels/                 # Panel components
        Sidebar/
        MilestoneView/
        SliceDetail/
        ActiveTask/
        Chat/
        Preview/
      components/             # Shared UI components
        Layout/               # Resizable panel grid
        StatusIndicator/
        EmptyState/
        LoadingState/
        ErrorBoundary/
      lib/                    # Utilities
        protocol.ts           # Shared message types (symlink or shared)
        format.ts             # Date, status formatting

    shared/                   # Types shared between server and client
      protocol.ts             # WebSocket message type definitions
      types.ts                # Domain types (Milestone, Phase, Plan)
```

### Structure Rationale

- **server/ and client/ separation:** Clean boundary between Bun runtime code and browser code. No accidental import of server modules in the client bundle. Bun builds the client from `index.html` as entry point.
- **server/state/ as its own module:** The state derivation pipeline (watch -> parse -> diff -> broadcast) is the core of the system. Isolating parsers per file type makes them independently testable and extendable.
- **client/stores/ with Zustand:** Each store maps to a WebSocket topic. Stores are updated by a single WebSocket hook, and panels subscribe to specific slices. This avoids re-rendering the entire UI on every file change.
- **shared/protocol.ts:** The WebSocket message format is a contract between server and client. Sharing types prevents drift. Import via TypeScript path alias.

## Architectural Patterns

### Pattern 1: Event-Driven File-to-UI Pipeline

**What:** File system events flow through a unidirectional pipeline: watch -> debounce -> parse -> diff -> broadcast -> store update -> render. No component ever reads files directly. No bidirectional state sync.

**When to use:** Always. This is the core architectural pattern for the entire system.

**Trade-offs:** Adds latency (debounce window) but prevents thrashing. Requires maintaining an in-memory cache for diffing, but the cache is reconstructable from disk on restart.

**Example:**

```typescript
// server/watcher.ts
import { watch } from "fs";

export function createWatcher(dir: string, onChange: (path: string) => void) {
  const pending = new Map<string, NodeJS.Timeout>();

  const watcher = watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename || !isRelevantFile(filename)) return;

    // Debounce per-file: many editors write multiple events per save
    const existing = pending.get(filename);
    if (existing) clearTimeout(existing);

    pending.set(filename, setTimeout(() => {
      pending.delete(filename);
      onChange(filename);
    }, 50));
  });

  return watcher;
}

function isRelevantFile(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".json");
}
```

### Pattern 2: Topic-Based WebSocket Pub/Sub

**What:** Use Bun's native WebSocket pub/sub rather than manually iterating connections. Clients subscribe to topics (`state`, `chat:{sessionId}`, `preview`). Server publishes to topics. Bun handles fan-out internally at native speed.

**When to use:** For all server-to-client broadcasts. Direct `ws.send()` only for client-specific responses (e.g., initial state hydration on connect).

**Trade-offs:** Less control over per-client message filtering (topic granularity is the filter). But eliminates O(n) iteration over connections and is significantly faster for broadcast scenarios.

**Example:**

```typescript
// server/ws/hub.ts
import type { ServerWebSocket } from "bun";

interface ClientData {
  connectedAt: number;
  sessionId: string;
}

export function createWebSocketHandlers(getState: () => ProjectState) {
  return {
    open(ws: ServerWebSocket<ClientData>) {
      ws.subscribe("state");
      // Send full state on connect (hydration)
      ws.send(JSON.stringify({
        type: "state:full",
        payload: getState(),
      }));
    },

    message(ws: ServerWebSocket<ClientData>, message: string) {
      const msg = JSON.parse(message);
      // Handle client messages (chat input, commands)
      handleClientMessage(ws, msg);
    },

    close(ws: ServerWebSocket<ClientData>) {
      ws.unsubscribe("state");
    },
  };
}

// Called by state deriver when files change
export function broadcastStateUpdate(server: Server, patch: StatePatch) {
  server.publish("state", JSON.stringify({
    type: "state:patch",
    payload: patch,
  }));
}
```

### Pattern 3: Zustand Stores Fed by WebSocket

**What:** A single WebSocket connection feeds multiple Zustand stores. One `useWebSocket` hook manages the connection lifecycle (connect, reconnect, heartbeat). Incoming messages are dispatched to the appropriate store based on message type. Panels subscribe to store slices with selectors for minimal re-renders.

**When to use:** For all client-side state that originates from the server. Local UI state (panel sizes, modals) lives in a separate UI store that is not WebSocket-driven.

**Trade-offs:** Zustand adds a dependency (~1KB) but provides selector-based subscriptions that React Context cannot match for high-frequency updates. The alternative (useReducer + Context) would cause cascade re-renders across all panels on every file change.

**Example:**

```typescript
// client/stores/project.ts
import { create } from "zustand";
import type { ProjectState, StatePatch } from "../../shared/protocol";

interface ProjectStore {
  state: ProjectState | null;
  setFullState: (state: ProjectState) => void;
  applyPatch: (patch: StatePatch) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  state: null,
  setFullState: (state) => set({ state }),
  applyPatch: (patch) =>
    set((prev) => ({
      state: prev.state ? applyStatePatch(prev.state, patch) : null,
    })),
}));

// Panel subscribes to a slice — only re-renders when that slice changes
// MilestoneView.tsx:
// const milestones = useProjectStore((s) => s.state?.milestones);
```

### Pattern 4: Child Process Streaming Bridge

**What:** Claude Code runs as a `Bun.spawn()` child process. Its stdout is a `ReadableStream` that is read chunk-by-chunk and forwarded to WebSocket clients on the `chat` topic. Stdin is piped for sending user messages. Process lifecycle (spawn, kill, restart) is managed by the Chat Manager.

**When to use:** For the chat panel and any future Claude Code integrations.

**Trade-offs:** Child process management adds complexity (handling crashes, timeouts, zombie processes). But it gives full control over the interaction model, unlike file-based or socket-based IPC which would add indirection.

**Example:**

```typescript
// server/chat/manager.ts
export class ChatManager {
  private proc: Subprocess | null = null;

  async start(server: Server, sessionId: string) {
    this.proc = Bun.spawn(["claude", "--json"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      cwd: process.cwd(),
    });

    // Stream stdout to WebSocket clients
    this.streamToClients(this.proc.stdout, server, sessionId);
  }

  private async streamToClients(
    stream: ReadableStream,
    server: Server,
    sessionId: string
  ) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      server.publish(`chat:${sessionId}`, JSON.stringify({
        type: "chat:chunk",
        payload: decoder.decode(value),
      }));
    }
  }

  send(message: string) {
    if (!this.proc?.stdin) return;
    this.proc.stdin.write(message + "\n");
    this.proc.stdin.flush();
  }

  kill() {
    this.proc?.kill();
    this.proc = null;
  }
}
```

## Data Flow

### Primary Flow: File Change to UI Update

```
.planning/ file saved (by Claude Code or gsd-tools.cjs)
    |
    v
fs.watch() fires event (filename, event type)
    |
    v
Debounce (50ms per-file, coalesce rapid saves)
    |
    v
State Deriver reads file, parses content
    |
    v
Differ compares against cached state, produces JSON patch
    |
    v
Cache updated with new state
    |
    v
server.publish("state", patch) -- Bun native pub/sub
    |
    v
All subscribed WebSocket clients receive patch
    |
    v
useWebSocket hook dispatches to Zustand store
    |
    v
useProjectStore.applyPatch(patch)
    |
    v
React panels with selectors re-render only affected slices
```

**Target latency:** File save to panel update under 100ms (per PROJECT.md constraint). The debounce window (50ms) is the main contributor. Parse + diff + broadcast should complete in under 10ms for typical `.planning/` files.

### Chat Flow: User Message to Streaming Response

```
User types message in Chat panel
    |
    v
WebSocket sends { type: "chat:send", payload: "message" }
    |
    v
Server receives, routes to Chat Manager
    |
    v
Intent classifier: is it a /gsd: command or natural language?
    |
    +-- /gsd: command --> gsd-tools.cjs execution --> result back to chat
    |
    +-- Natural language --> Claude Code child process stdin
                                |
                                v
                          Claude Code processes, writes to stdout
                                |
                                v
                          ReadableStream chunks forwarded via
                          server.publish("chat:{session}", chunk)
                                |
                                v
                          Chat panel appends chunks in real-time
                                |
                          (Meanwhile, Claude Code may modify .planning/ files)
                                |
                                v
                          File watcher picks up changes --> state update flow
```

### Preview Flow: Dev Server Proxy

```
User clicks "Preview" or panel loads
    |
    v
React iframe src="/preview/"
    |
    v
Bun HTTP handler matches /preview/* routes
    |
    v
Proxy fetches from localhost:{devServerPort}
    |
    v
Strip credentials, rewrite relative URLs
    |
    v
Return proxied response to iframe
```

### State Management

```
Server Side:                          Client Side:
+------------------+                  +------------------+
| In-Memory Cache  |   WebSocket      | Zustand Stores   |
|                  | ==============>  |                  |
| roadmap: {...}   |   state:full     | useProjectStore  |
| milestones: []   |   state:patch    | useChatStore     |
| activePlan: {}   |                  | useUIStore       |
+------------------+                  +------------------+
        ^                                     |
        |                              Selectors (minimal re-render)
  File parsers                                |
        ^                              +------+------+
        |                              |      |      |
  .planning/ files                   Panel  Panel  Panel
```

### Key Data Flows

1. **State hydration:** On WebSocket connect, server sends `state:full` with complete derived state. Client replaces entire Zustand store. This handles page refreshes and reconnects identically.

2. **Incremental updates:** After hydration, server sends `state:patch` messages containing only changed fields. Client applies patches to existing store state. This keeps bandwidth minimal and re-renders targeted.

3. **Chat streaming:** Chat output arrives as `chat:chunk` messages (raw text fragments). The chat store appends chunks to the current message buffer. A `chat:complete` message signals end of response.

4. **Bidirectional chat:** Client sends `chat:send` over WebSocket. Server routes to appropriate handler. Responses flow back on the same WebSocket connection via topic pub/sub.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user (primary case) | Single Bun process, single WebSocket connection. No concerns. |
| 2-5 users (team view) | Bun pub/sub handles multiple connections natively. No code changes needed. File watcher is shared. |
| 10+ connections | Consider rate-limiting state broadcasts. Batch multiple file changes into single update. Already debounced, but batch window may need widening. |

### Scaling Priorities

1. **First bottleneck: Parser throughput.** If `.planning/` has hundreds of files changing simultaneously (unlikely but possible during large code generation), the synchronous parse-diff cycle could block the event loop. Mitigation: parse only changed files (already the design), and if needed, move parsing to a worker thread.

2. **Second bottleneck: WebSocket message size.** Full state hydration for a large project could be substantial. Mitigation: the `state:full` message is only sent on connect. Patches are small. If full state exceeds ~1MB, split into per-domain messages.

## Anti-Patterns

### Anti-Pattern 1: Polling Files Instead of Watching

**What people do:** Set up a `setInterval` to re-read `.planning/` files every N seconds.
**Why it's wrong:** Adds latency (up to N seconds), wastes CPU reading unchanged files, and misses the 100ms update target. Bun's `fs.watch()` uses OS-level notifications (inotify/kqueue/ReadDirectoryChangesW) which are near-instant.
**Do this instead:** Use `fs.watch({ recursive: true })` with per-file debounce.

### Anti-Pattern 2: Full State Broadcast on Every Change

**What people do:** Re-derive and broadcast the entire project state every time any file changes.
**Why it's wrong:** Causes unnecessary re-renders across all panels. A change to a single plan file should not re-render the milestone list. Wastes bandwidth and CPU on serialization.
**Do this instead:** Parse only the changed file, diff against cached state, broadcast a targeted patch. Client stores apply patches with selectors ensuring only affected panels re-render.

### Anti-Pattern 3: React Context for WebSocket State

**What people do:** Put WebSocket-received state in React Context at the app root.
**Why it's wrong:** Every state update triggers re-renders in every consuming component, regardless of whether the specific data they use changed. With 5+ panels receiving high-frequency updates, this causes visible jank.
**Do this instead:** Use Zustand with selector-based subscriptions. Each panel subscribes to its specific slice of state. Zustand uses `useSyncExternalStore` internally, which is the React-recommended pattern for external state sources.

### Anti-Pattern 4: Spawning Claude Code Per Message

**What people do:** Spawn a new child process for each chat message, wait for it to complete, return the full output.
**Why it's wrong:** Process spawn overhead (~100ms), no streaming (user waits for full response), and no conversational context between messages.
**Do this instead:** Maintain a long-lived child process per session. Write to stdin, stream from stdout. Kill and respawn only on session end or crash.

### Anti-Pattern 5: Client-Side File Reading

**What people do:** Expose `.planning/` files over HTTP and have the React client fetch and parse them directly.
**Why it's wrong:** Moves parsing logic to the client (duplicated, slower, no caching), requires polling for changes, and exposes raw file contents over HTTP.
**Do this instead:** Server owns all file reading and parsing. Client receives pre-processed state over WebSocket. Clean separation of concerns.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| File Watcher -> State Deriver | Function call (same process) | Watcher calls `deriver.onFileChanged(path)`. Synchronous within the debounce callback. |
| State Deriver -> WebSocket Hub | Function call (same process) | Deriver calls `hub.broadcast(patch)` which calls `server.publish()`. |
| HTTP Router -> Chat Manager | Function call (same process) | WebSocket message handler calls `chatManager.send(message)`. |
| Chat Manager -> Claude Code | Child process stdin/stdout | `Bun.spawn()` with piped streams. Unidirectional streaming for output. |
| Server -> Client | WebSocket (binary/text) | JSON messages over persistent WebSocket connection. Protocol defined in `shared/protocol.ts`. |
| Client -> Server | WebSocket (text) | Client sends commands and chat messages. Server never polls client. |
| Preview Proxy -> Dev Server | HTTP fetch | Bun fetches from `localhost:{port}`, returns response to iframe. |

### External Interfaces

| Interface | Direction | Notes |
|-----------|-----------|-------|
| `.planning/` filesystem | Server reads only | Mission Control never writes to `.planning/`. Mutations go through `gsd-tools.cjs` or Claude Code. |
| `gsd-tools.cjs` | Server spawns for `/gsd:` commands | Stateless CLI invocations. Output captured and sent to chat. |
| Claude Code | Server spawns as child process | Long-lived process per chat session. Stdin/stdout streaming. |
| Local dev server | Server proxies HTTP | Configurable port. Preview panel renders proxied content in iframe. |

## Build Order (Dependency Chain)

The following build order respects dependencies -- each layer requires the previous one to be functional:

1. **Shared types + protocol** (`shared/`) -- Everything depends on the message contract.
2. **File watcher + parsers** (`server/watcher.ts`, `server/state/parsers/`) -- Core data source. Can be tested independently by watching a real `.planning/` directory and logging output.
3. **State deriver + cache + differ** (`server/state/`) -- Depends on parsers. Produces the state patches that everything downstream consumes.
4. **Bun server + WebSocket hub** (`server/index.ts`, `server/ws/`) -- Depends on state deriver for broadcast content. This is the integration point that makes state available to clients.
5. **React shell + WebSocket hook + Zustand stores** (`client/`) -- Depends on the WebSocket server being available. Start with a single panel displaying raw state to verify the full pipeline.
6. **Panel components** (`client/panels/`) -- Depends on stores being populated. Build panels one at a time: Sidebar first (simplest), then MilestoneView, SliceDetail, ActiveTask.
7. **Chat manager + intent classifier** (`server/chat/`, `client/panels/Chat/`) -- Depends on WebSocket infrastructure but is otherwise independent of the state pipeline. Can be built in parallel with later panels.
8. **Preview proxy** (`server/proxy.ts`, `client/panels/Preview/`) -- Fully independent of state pipeline. Lowest priority since it is a convenience feature.

**Critical path:** Steps 1-5 form the critical path. Until the full file-to-UI pipeline works end-to-end, no panel can display real data. Prioritize getting a "hello world" through the entire pipeline before building out individual panels.

## Sources

- [Bun WebSocket API](https://bun.com/docs/runtime/http/websockets) -- Official docs for ServerWebSocket, pub/sub topics, upgrade pattern
- [Bun File Watching](https://bun.com/docs/guides/read-file/watch) -- Official guide for fs.watch() in Bun
- [Bun Child Process](https://bun.com/docs/runtime/child-process) -- Official docs for Bun.spawn() and ReadableStream stdout
- [Bun HTML/Static Sites](https://bun.com/docs/bundler/html-static) -- Official docs for serving React SPAs with Bun
- [Bun ServerWebSocket Reference](https://bun.com/reference/bun/ServerWebSocket) -- API reference for ServerWebSocket methods
- [React State Management 2025](https://dev.to/saswatapal/do-you-need-state-management-in-2025-react-context-vs-zustand-vs-jotai-vs-redux-1ho) -- Zustand vs alternatives analysis
- [State Management Trends](https://makersden.io/blog/react-state-management-in-2025) -- Zustand for dashboard real-time state

---
*Architecture research for: GSD Mission Control -- Bun-powered local dashboard*
*Researched: 2026-03-10*
