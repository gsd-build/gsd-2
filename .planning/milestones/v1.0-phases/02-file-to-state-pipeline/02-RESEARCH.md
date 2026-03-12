# Phase 2: File-to-State Pipeline - Research

**Researched:** 2026-03-10
**Domain:** File watching, state derivation, WebSocket real-time push, diff-only updates
**Confidence:** HIGH

## Summary

Phase 2 builds the core data pipeline that all future phases depend on: file changes in `.planning/` must be detected, parsed into typed JSON state, diffed against previous state, and pushed to connected browser clients via WebSocket -- all within 100ms. This is a pure server-side + thin client phase with no UI beyond a WebSocket connection test.

Bun v1.3.10 (installed in Phase 1) provides all the primitives: `fs.watch()` with recursive support (rewritten for Windows reliability in recent releases), `Bun.serve()` with native WebSocket pub/sub, and `Bun.file()` for fast file reads. The main technical risks are: (1) debouncing partial writes from editors and GSD tools that write files in stages, (2) parsing heterogeneous `.planning/` file formats (YAML frontmatter markdown, pure markdown, JSON), and (3) achieving the 100ms budget from file event to WebSocket push. All three are solvable with well-known patterns documented below.

**Primary recommendation:** Use Bun's native `fs.watch({ recursive: true })` with a 50ms debounce window, `gray-matter` for YAML frontmatter parsing, a simple deep-equality diff (no library needed for this scale), and Bun's built-in WebSocket pub/sub for broadcasting.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-02 | File watcher monitors `.planning/` recursively, detecting all file changes | Bun `fs.watch({ recursive: true })` with debounce; Windows rewrite in v1.3.10 |
| SERV-03 | State derivation engine parses `.planning/` files into structured state objects | gray-matter for frontmatter, JSON.parse for config, regex/structured parsing for ROADMAP.md |
| SERV-04 | WebSocket server on :4001 pushes diff-only state updates to all connected clients | Bun.serve() WebSocket with pub/sub topics; shallow diff to compute changed keys |
| SERV-05 | File event to panel update completes under 100ms | Debounce 50ms + parse + diff + publish fits in budget; benchmark in tests |
| SERV-08 | WebSocket reconnects with exponential backoff on disconnect | Client-side reconnect logic with base 1s, max 30s, jitter |
| SERV-09 | Bun process restart reconstructs full state from `.planning/` files | `buildFullState()` function called at startup and on reconnect; no in-memory-only state |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun fs.watch | built-in (1.3.10) | File system monitoring | Native recursive watching, Windows rewrite in v1.3.10 for reliability. Uses ReadDirectoryChangesW on Windows. No chokidar needed. |
| Bun.serve() WebSocket | built-in (1.3.10) | Real-time server-to-client push | Native pub/sub with `ws.subscribe(topic)` / `server.publish(topic, msg)`. Zero dependencies. Per-message deflate available. |
| Bun.file() | built-in (1.3.10) | Fast file reads | Returns typed file handle, `.text()` for string content, `.json()` for parsed JSON. |
| gray-matter | 4.0.3 | YAML frontmatter parsing | Battle-tested (used by Gatsby, Astro, Netlify). Parses STATE.md and PLAN.md frontmatter into typed objects. Returns `{ data, content }`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zustand | 5.0.x | Client-side state store | Receives WebSocket messages and updates UI state. Already planned from stack research. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gray-matter | js-yaml + manual split | gray-matter handles edge cases (empty frontmatter, malformed delimiters). Not worth hand-rolling. |
| Manual shallow diff | jsondiffpatch | jsondiffpatch (4.7M downloads) is overkill for our flat state objects. A 20-line `shallowDiff()` comparing top-level keys is sufficient and avoids a dependency. |
| Bun fs.watch | chokidar | chokidar is a Node.js polyfill for inconsistent fs.watch. Bun v1.3.10 has rewritten Windows fs.watch -- use native first, add chokidar only if real bugs surface. |

**Installation:**
```bash
cd packages/mission-control
bun add gray-matter
```

## Architecture Patterns

### Recommended Project Structure
```
packages/mission-control/src/
  server/
    watcher.ts          # File watcher with debounce
    state-deriver.ts    # Parses .planning/ files into typed state
    differ.ts           # Computes diff between old and new state
    ws-server.ts        # WebSocket server on :4001
    index.ts            # Orchestrates watcher -> deriver -> differ -> ws
  shared/
    types.ts            # Shared types: PlanningState, StateDiff, etc.
  server.ts             # Existing HTTP server on :4000 (from Phase 1)
```

### Pattern 1: Debounced File Watcher

**What:** Wrap `fs.watch()` with a debounce window to coalesce rapid file events (editor save + format, partial writes) into a single state rebuild.

**When to use:** Always -- raw fs.watch fires multiple events per save (rename + change, or multiple change events for formatters).

**Example:**
```typescript
// Source: Bun docs + standard debounce pattern
import { watch } from "node:fs";

interface WatcherOptions {
  planningDir: string;
  debounceMs?: number;
  onChange: (changedFiles: Set<string>) => void;
}

export function createFileWatcher({ planningDir, debounceMs = 50, onChange }: WatcherOptions) {
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(planningDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    // Ignore dotfiles, temp files, swap files
    if (filename.startsWith(".") && !filename.startsWith(".planning")) return;
    if (filename.endsWith("~") || filename.endsWith(".swp")) return;

    pending.add(filename);

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const files = new Set(pending);
      pending.clear();
      timer = null;
      onChange(files);
    }, debounceMs);
  });

  return {
    close: () => watcher.close(),
  };
}
```

### Pattern 2: State Deriver (File-to-State)

**What:** Parse all `.planning/` files into a single typed `PlanningState` object. Called on startup (full rebuild) and on file change (incremental -- could rebuild full state since file count is small).

**When to use:** Every time files change. The `.planning/` directory has ~25 files; full parse takes <10ms.

**Example:**
```typescript
import matter from "gray-matter";

// Source: project .planning/ file structure analysis
interface PlanningState {
  roadmap: RoadmapState;
  state: ProjectState;
  config: ConfigState;
  phases: PhaseState[];
  requirements: RequirementState[];
}

interface ProjectState {
  milestone: string;
  status: string;
  progress: { total_phases: number; completed_phases: number; percent: number };
  // ... from STATE.md frontmatter
}

interface PhaseState {
  number: number;
  name: string;
  status: "not_started" | "in_progress" | "complete";
  plans: PlanState[];
}

interface PlanState {
  phase: string;
  plan: number;
  wave: number;
  requirements: string[];
  autonomous: boolean;
  // ... from PLAN.md frontmatter
}

export async function buildFullState(planningDir: string): Promise<PlanningState> {
  const [stateRaw, configRaw, roadmapRaw] = await Promise.all([
    Bun.file(`${planningDir}/STATE.md`).text(),
    Bun.file(`${planningDir}/config.json`).json(),
    Bun.file(`${planningDir}/ROADMAP.md`).text(),
  ]);

  const stateParsed = matter(stateRaw);
  const roadmapParsed = parseRoadmap(roadmapRaw);

  // Parse all plan files
  const phases = await parseAllPhases(planningDir);

  return {
    state: stateParsed.data as ProjectState,
    config: configRaw as ConfigState,
    roadmap: roadmapParsed,
    phases,
    requirements: parseRequirements(/* ... */),
  };
}
```

### Pattern 3: Shallow Diff for WebSocket Push

**What:** Compare old and new state at the top-level key level. Send only changed sections to clients.

**When to use:** After every state rebuild. Clients receive `{ type: "diff", changes: { state: {...}, phases: [...] } }` instead of the full state.

**Example:**
```typescript
interface StateDiff {
  type: "full" | "diff";
  changes: Partial<PlanningState>;
  timestamp: number;
}

export function computeDiff(oldState: PlanningState, newState: PlanningState): StateDiff | null {
  const changes: Partial<PlanningState> = {};
  let hasChanges = false;

  for (const key of Object.keys(newState) as (keyof PlanningState)[]) {
    if (JSON.stringify(oldState[key]) !== JSON.stringify(newState[key])) {
      (changes as any)[key] = newState[key];
      hasChanges = true;
    }
  }

  if (!hasChanges) return null;

  return { type: "diff", changes, timestamp: Date.now() };
}
```

### Pattern 4: WebSocket Server with Pub/Sub

**What:** Separate WebSocket server on :4001. Clients connect, subscribe to "state" topic. Server publishes diffs on file changes.

**Example:**
```typescript
// Source: Bun WebSocket pub/sub docs
const wsServer = Bun.serve({
  port: 4001,
  fetch(req, server) {
    if (server.upgrade(req, { data: { connectedAt: Date.now() } })) {
      return; // upgraded
    }
    return new Response("WebSocket server", { status: 200 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("planning-state");
      // Send full state on connect
      ws.send(JSON.stringify({ type: "full", state: currentState, timestamp: Date.now() }));
    },
    message(ws, message) {
      // Client can request full state refresh
      if (message === "refresh") {
        ws.send(JSON.stringify({ type: "full", state: currentState, timestamp: Date.now() }));
      }
    },
    close(ws) {
      ws.unsubscribe("planning-state");
    },
  },
});

// When file changes produce a diff:
function broadcastDiff(diff: StateDiff) {
  wsServer.publish("planning-state", JSON.stringify(diff));
}
```

### Pattern 5: Client Reconnect with Exponential Backoff

**What:** Browser-side WebSocket wrapper that reconnects automatically on close/error.

**Example:**
```typescript
export function createReconnectingWebSocket(url: string) {
  let ws: WebSocket | null = null;
  let attempt = 0;
  const maxDelay = 30_000;
  const baseDelay = 1_000;

  function connect() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      attempt = 0; // Reset on successful connection
    };

    ws.onclose = () => {
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = delay * 0.1 * Math.random();
      attempt++;
      setTimeout(connect, delay + jitter);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "full") {
        // Replace entire state
      } else if (msg.type === "diff") {
        // Merge changes into existing state
      }
    };
  }

  connect();
  return { getWs: () => ws };
}
```

### Anti-Patterns to Avoid

- **Polling instead of watching:** Never use `setInterval` + file reads. `fs.watch` is event-driven and near-instant.
- **No debounce on file watcher:** Raw fs.watch fires 2-6 events per editor save. Without debounce, you parse and diff multiple times per save.
- **Storing state in memory only:** State MUST be derivable from `.planning/` files. Never store state that cannot be reconstructed from disk. Process crash + restart must produce identical state.
- **Single WebSocket for HTTP + WS:** Keep HTTP (:4000) and WebSocket (:4001) as separate servers. Mixing them complicates the Bun.serve config and makes testing harder.
- **Deep recursive diff:** For ~25 files producing a state object with 5-6 top-level keys, `JSON.stringify` comparison per key is fast enough (<1ms). Do not add jsondiffpatch complexity.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom regex split on `---` | gray-matter | Edge cases: empty frontmatter, nested YAML, malformed delimiters, BOM markers |
| WebSocket transport | Raw TCP sockets or polling | Bun.serve() WebSocket | Built-in compression, pub/sub, backpressure handling |
| File watching | setInterval + stat | Bun fs.watch() | Kernel-level events vs polling; ReadDirectoryChangesW on Windows |
| Exponential backoff math | Fixed retry interval | Standard formula: `min(base * 2^attempt, max) + jitter` | Without jitter, reconnecting clients thundering-herd the server |

**Key insight:** This phase uses almost entirely Bun built-ins. The only external dependency is `gray-matter` for frontmatter parsing. Keep it that way.

## Common Pitfalls

### Pitfall 1: Partial Write Race Condition
**What goes wrong:** Editor saves file in stages (write temp file, rename over original) or formatter runs after save. fs.watch fires an event mid-write. State deriver reads a half-written file, gets parse error or stale data.
**Why it happens:** `fs.watch` fires on first file system event, not on write completion.
**How to avoid:** Debounce with 50ms window. Collect all changed filenames, process batch after quiet period. Wrap file reads in try/catch -- if parse fails, skip that file and wait for next event.
**Warning signs:** Intermittent `SyntaxError` in YAML/JSON parsing, state flickering.

### Pitfall 2: Missing Events on Windows
**What goes wrong:** `fs.watch` silently stops firing events for new files or deeply nested changes on Windows.
**Why it happens:** Known Bun issue (#15085) -- though v1.3.10 rewrote Windows fs.watch for reliability. May still have edge cases.
**How to avoid:** Add a periodic full-state reconciliation (every 5 seconds) as a safety net. Compare derived state from a fresh file scan against current in-memory state. Log any drift detected. This is cheap (<10ms for 25 files) and ensures eventual consistency even if fs.watch misses an event.
**Warning signs:** Dashboard shows stale data that only updates on server restart.

### Pitfall 3: WebSocket Message Ordering
**What goes wrong:** Client receives diff messages out of order after reconnect, resulting in inconsistent state.
**Why it happens:** Client reconnects, gets full state, but a queued diff from before disconnect arrives after the full state.
**How to avoid:** Include a monotonic `sequence` number in every message. Client ignores any message with sequence <= its last processed sequence. On reconnect, send full state with current sequence; client resets its counter.
**Warning signs:** UI shows data that doesn't match files on disk.

### Pitfall 4: Blocking the Event Loop During Parse
**What goes wrong:** Parsing 25+ markdown files synchronously blocks the event loop, causing WebSocket ping/pong timeouts and UI freezes.
**Why it happens:** `Bun.file().text()` is async but if you accidentally use `readFileSync` or process results synchronously in a tight loop, you block.
**How to avoid:** Use `Promise.all()` to read files concurrently. Use `Bun.file().text()` (async) not `readFileSync`. State derivation should complete in <10ms for the expected file count.
**Warning signs:** WebSocket connections dropping during state rebuilds.

### Pitfall 5: Infinite Watch Loop
**What goes wrong:** State deriver or another process writes to `.planning/` (e.g., updating STATE.md), triggering the watcher, which triggers another derivation, which triggers another write.
**Why it happens:** Watching the same directory you write to.
**How to avoid:** Mission Control NEVER writes to `.planning/` -- it is read-only. All mutations go through `gsd-tools.cjs` or Claude Code. If any future feature needs to write (session file), use `.planning/.mission-control-session.json` and exclude that specific file from the watcher via filename filter.
**Warning signs:** CPU spikes, rapid WebSocket messages, state oscillating between values.

## Code Examples

### File Format Inventory (What the State Deriver Must Parse)

From analysis of the actual `.planning/` directory:

| File | Format | Parser Needed |
|------|--------|--------------|
| `STATE.md` | YAML frontmatter + markdown body | gray-matter |
| `ROADMAP.md` | Pure markdown with checkbox lists and structured headers | Regex/line parsing |
| `config.json` | JSON | `Bun.file().json()` |
| `REQUIREMENTS.md` | Markdown with checkbox lists and tables | Regex/line parsing |
| `PROJECT.md` | Markdown with tables | Regex/line parsing |
| `phases/*/XX-YY-PLAN.md` | YAML frontmatter + markdown body | gray-matter |
| `phases/*/XX-YY-SUMMARY.md` | Markdown | gray-matter (may have frontmatter) |
| `phases/*/XX-RESEARCH.md` | Markdown | Not needed for dashboard state |
| `codebase/*.md` | Markdown | Not needed for dashboard state (v1) |

**Priority for v1 dashboard panels:** STATE.md (progress), ROADMAP.md (phases), config.json (settings), PLAN.md files (task details), REQUIREMENTS.md (requirement status).

### Parsing STATE.md Frontmatter

```typescript
import matter from "gray-matter";

const raw = await Bun.file(".planning/STATE.md").text();
const { data, content } = matter(raw);
// data = {
//   gsd_state_version: "1.0",
//   milestone: "v1.0",
//   status: "completed",
//   progress: { total_phases: 10, completed_phases: 1, percent: 100 },
//   ...
// }
```

### Parsing ROADMAP.md Phase List

```typescript
function parseRoadmap(content: string): RoadmapState {
  const phases: RoadmapPhase[] = [];
  const phaseRegex = /^- \[([ x])\] \*\*Phase (\d+): (.+?)\*\* - (.+)$/gm;
  let match;

  while ((match = phaseRegex.exec(content)) !== null) {
    phases.push({
      completed: match[1] === "x",
      number: parseInt(match[2]),
      name: match[3],
      description: match[4],
    });
  }

  return { phases };
}
```

### Complete Pipeline Orchestration

```typescript
// server/index.ts -- ties watcher, deriver, differ, and ws together
import { createFileWatcher } from "./watcher";
import { buildFullState } from "./state-deriver";
import { computeDiff } from "./differ";
import { createWsServer } from "./ws-server";

const PLANNING_DIR = process.cwd() + "/.planning";

let currentState = await buildFullState(PLANNING_DIR);
let sequence = 0;

const wsServer = createWsServer({
  port: 4001,
  getFullState: () => ({ type: "full" as const, state: currentState, sequence }),
});

createFileWatcher({
  planningDir: PLANNING_DIR,
  debounceMs: 50,
  onChange: async (changedFiles) => {
    try {
      const newState = await buildFullState(PLANNING_DIR);
      const diff = computeDiff(currentState, newState);

      if (diff) {
        currentState = newState;
        sequence++;
        wsServer.broadcast({ ...diff, sequence });
      }
    } catch (err) {
      console.error("[state-deriver] Parse error, skipping:", err);
      // Don't update state on parse failure -- wait for next clean write
    }
  },
});

// Safety net: periodic reconciliation
setInterval(async () => {
  try {
    const freshState = await buildFullState(PLANNING_DIR);
    const diff = computeDiff(currentState, freshState);
    if (diff) {
      console.warn("[reconcile] Detected drift, pushing update");
      currentState = freshState;
      sequence++;
      wsServer.broadcast({ ...diff, sequence });
    }
  } catch { /* ignore */ }
}, 5000);

console.log("File-to-state pipeline running. WebSocket on :4001");
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| chokidar for file watching | Bun native fs.watch | Bun 1.3.10 (Feb 2026) | Windows fs.watch rewritten for reliability; chokidar unnecessary |
| ws npm package for WebSocket | Bun.serve() WebSocket | Bun 1.0+ | Zero-dependency WebSocket with pub/sub built in |
| socket.io for real-time | Native WebSocket + manual reconnect | General trend | socket.io adds 50KB+ for features not needed on localhost |
| Deep recursive JSON diff libs | Shallow key-level comparison | N/A | For 5-6 top-level state keys, JSON.stringify per key is faster than importing a diff library |

**Deprecated/outdated:**
- chokidar: Not needed with Bun's native fs.watch (though keep as fallback option if bugs surface)
- Individual `@radix-ui/react-*` packages: Unified `radix-ui` package now (from Phase 1 research)

## Open Questions

1. **fs.watch new-file detection on Windows**
   - What we know: Bun issue #15085 reports fs.watch may not detect changes in files created after the watcher starts. v1.3.10 rewrote Windows fs.watch but issue status is open.
   - What's unclear: Whether v1.3.10 fully resolves this for recursive watching of new files in subdirectories.
   - Recommendation: The 5-second reconciliation safety net handles this. Test explicitly during implementation by creating a new plan file while watcher is running.

2. **100ms Budget Feasibility**
   - What we know: 50ms debounce + ~5ms file reads + ~2ms parse + ~1ms diff + ~1ms WS publish = ~59ms theoretical.
   - What's unclear: Real-world Windows I/O latency for 25 concurrent file reads.
   - Recommendation: Measure end-to-end latency in tests. If >100ms, reduce debounce to 30ms or implement incremental parsing (only re-parse changed files).

3. **ROADMAP.md Progress Table vs Checkbox Parsing**
   - What we know: ROADMAP.md has both a checkbox list and a progress table. They could drift.
   - What's unclear: Which is the source of truth for phase completion status.
   - Recommendation: Use the checkbox list (`- [x]` / `- [ ]`) as primary since gsd-tools updates those. The progress table is display-only.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none -- bun:test works zero-config |
| Quick run command | `bun test packages/mission-control/tests/` |
| Full suite command | `bun test packages/mission-control/tests/ --timeout 30000` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SERV-02 | File watcher detects recursive changes | integration | `bun test packages/mission-control/tests/watcher.test.ts -x` | Wave 0 |
| SERV-03 | State deriver parses .planning/ files | unit | `bun test packages/mission-control/tests/state-deriver.test.ts -x` | Wave 0 |
| SERV-04 | WebSocket pushes diff-only updates | integration | `bun test packages/mission-control/tests/ws-server.test.ts -x` | Wave 0 |
| SERV-05 | File-to-update under 100ms | integration | `bun test packages/mission-control/tests/pipeline-perf.test.ts -x` | Wave 0 |
| SERV-08 | Client reconnects with backoff | unit | `bun test packages/mission-control/tests/reconnect.test.ts -x` | Wave 0 |
| SERV-09 | Process restart reconstructs state | integration | `bun test packages/mission-control/tests/state-deriver.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test packages/mission-control/tests/ --timeout 15000`
- **Per wave merge:** `bun test packages/mission-control/tests/ --timeout 30000`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/watcher.test.ts` -- covers SERV-02 (file watcher with debounce, recursive detection)
- [ ] `tests/state-deriver.test.ts` -- covers SERV-03, SERV-09 (parsing all .planning/ file types, full state rebuild)
- [ ] `tests/ws-server.test.ts` -- covers SERV-04 (WebSocket connection, diff push, full state on connect)
- [ ] `tests/pipeline-perf.test.ts` -- covers SERV-05 (end-to-end latency measurement)
- [ ] `tests/reconnect.test.ts` -- covers SERV-08 (exponential backoff logic, sequence numbering)

## Sources

### Primary (HIGH confidence)
- [Bun fs.watch docs](https://bun.com/docs/guides/read-file/watch) - recursive option, callback API, close method
- [Bun WebSocket pub/sub docs](https://bun.com/docs/guides/websocket/pubsub) - subscribe/publish/unsubscribe API, server upgrade pattern
- [Bun v1.3.10 release](https://bun.com/blog/bun-v1.3.10) - Windows fs.watch rewrite for reliability
- [gray-matter npm](https://www.npmjs.com/package/gray-matter) - v4.0.3, YAML frontmatter parsing with TypeScript types
- Project `.planning/` files (STATE.md, ROADMAP.md, PLAN.md, config.json) - actual file formats analyzed directly

### Secondary (MEDIUM confidence)
- [Bun issue #15085](https://github.com/oven-sh/bun/issues/15085) - fs.watch may miss new files created after start (open issue, may be fixed in v1.3.10 rewrite)
- [Bun issue #2987](https://github.com/oven-sh/bun/issues/2987) - hot reload debounce, partial write detection (closed but incomplete fix)
- [WebSocket reconnect patterns](https://dev.to/hexshift/robust-websocket-reconnection-strategies-in-javascript-with-exponential-backoff-40n1) - exponential backoff with jitter

### Tertiary (LOW confidence)
- None -- all findings verified with official docs or project files

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All Bun built-ins verified against official docs; gray-matter is widely used and stable
- Architecture: HIGH - Pipeline pattern (watch -> parse -> diff -> push) is standard for file-driven real-time systems
- Pitfalls: HIGH - Debounce and partial-write issues are well-documented across fs.watch implementations; Windows concern is validated by open Bun issue
- Performance budget: MEDIUM - 100ms is achievable theoretically but unverified on Windows with real file I/O; needs measurement

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- Bun APIs unlikely to break in patch releases)
