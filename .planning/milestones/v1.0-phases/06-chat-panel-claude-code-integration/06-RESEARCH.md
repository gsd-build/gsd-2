# Phase 6: Chat Panel + Claude Code Integration - Research

**Researched:** 2026-03-10
**Domain:** Child process management, streaming NDJSON parsing, chat UI, slash command autocomplete
**Confidence:** HIGH

## Summary

Phase 6 connects the Mission Control chat panel to Claude Code CLI, spawned as a Bun child process. The core challenge is three-fold: (1) spawning `claude` with the correct flags and stdio configuration to get streaming NDJSON output, (2) parsing that stream token-by-token and forwarding events over the existing WebSocket to the React frontend, and (3) rendering a chat UI with input autocomplete, message differentiation, and command history.

The existing infrastructure is well-suited for this. The Bun server already has a WebSocket server on :4001 with topic-based pub/sub. The pipeline architecture (watcher -> deriver -> differ -> broadcast) means file-based state updates (CHAT-05) come for free -- Claude Code writes files, the watcher detects them, and panels update automatically. The new work is: a process manager on the server, a chat message channel on the WebSocket, and chat UI components on the client.

**Primary recommendation:** Use `claude -p --output-format stream-json --verbose --include-partial-messages` spawned via `Bun.spawn` with `stdin: "inherit"` (to avoid the known stdio deadlock), pipe stdout as a ReadableStream, parse NDJSON line-by-line, and forward parsed events over WebSocket to the React chat renderer.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-01 | Chat input at bottom with `/` prefix hint and autocomplete for GSD slash commands | Slash command list extracted from GSD README; standard combobox/autocomplete pattern |
| CHAT-02 | Claude Code spawned as child process from Bun with piped stdout streaming | Bun.spawn API with ReadableStream stdout; Claude CLI `-p --output-format stream-json` flags |
| CHAT-03 | Streaming responses render token-by-token in real time | NDJSON parsing of `content_block_delta` events with `text_delta` type; WebSocket forwarding |
| CHAT-04 | Agent responses visually distinguished from system messages | Message type discrimination from NDJSON stream (system/assistant/result types) |
| CHAT-05 | State panels animate as files land on disk during execution | Already handled by existing file watcher + state pipeline -- no new work needed |
| CHAT-06 | Command history recalled with up arrow | Client-side array with index pointer; standard terminal input pattern |
| CHAT-07 | Chat routing under 200ms excluding model latency | Local `/gsd:` prefix detection is sub-millisecond; process spawn is the bottleneck |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun.spawn | Built-in (Bun 1.3.10+) | Spawn Claude Code CLI as child process | Native API, returns ReadableStream for stdout, no dependencies |
| Claude Code CLI | Latest (`claude` binary) | AI agent execution | Official CLI with `-p` flag for non-interactive use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | All dependencies already in project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bun.spawn + CLI | @anthropic-ai/claude-agent-sdk (TypeScript) | SDK provides typed messages and callbacks but adds a dependency; CLI `-p` is simpler and already proven in the GSD workflow |
| Raw NDJSON parsing | ndjson npm package | Unnecessary -- line splitting + JSON.parse is trivial and dependency-free |

**Installation:**
```bash
# No new packages needed -- Bun.spawn is built-in, Claude CLI is already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  server/
    claude-process.ts    # Process manager: spawn, lifecycle, stream parsing
    chat-router.ts       # Route messages: /gsd: prefix detection, dispatch
  hooks/
    useChat.ts           # Client hook: send messages, receive stream events
  components/
    chat/
      ChatPanel.tsx      # Container: message list + input
      ChatInput.tsx      # Input with autocomplete + command history
      ChatMessage.tsx    # Single message renderer (agent vs system styling)
      SlashAutocomplete.tsx  # Dropdown for /gsd: command completion
  lib/
    slash-commands.ts    # Command registry with descriptions
    ndjson-parser.ts     # Line-delimited JSON stream parser (pure function)
```

### Pattern 1: Claude Process Manager (Server-Side)
**What:** A server module that manages the Claude Code child process lifecycle
**When to use:** Every time a user sends a chat message
**Example:**
```typescript
// Source: Bun docs + Claude Code docs
import type { Subprocess } from "bun";

interface ClaudeProcessOptions {
  prompt: string;
  cwd: string;
  allowedTools?: string[];
  sessionId?: string;
}

interface StreamEvent {
  type: "system" | "stream_event" | "assistant" | "result";
  event?: {
    type: string;
    delta?: { type: string; text?: string; partial_json?: string };
    content_block?: { type: string; name?: string };
  };
  session_id?: string;
  result?: string;
}

export function spawnClaude(options: ClaudeProcessOptions): {
  process: Subprocess;
  stream: ReadableStream<StreamEvent>;
} {
  const args = [
    "-p", options.prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
  ];
  if (options.allowedTools) {
    args.push("--allowedTools", options.allowedTools.join(","));
  }
  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }

  const proc = Bun.spawn(["claude", ...args], {
    cwd: options.cwd,
    stdin: "inherit",   // CRITICAL: prevents stdio deadlock (Issue #771)
    stdout: "pipe",
    stderr: "pipe",
  });

  // Transform stdout ReadableStream into parsed NDJSON events
  const stream = proc.stdout!.pipeThrough(new TextDecoderStream())
    .pipeThrough(new TransformStream({
      buffer: "",
      transform(chunk, controller) {
        this.buffer += chunk;
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop()!; // keep incomplete line
        for (const line of lines) {
          if (line.trim()) {
            try {
              controller.enqueue(JSON.parse(line));
            } catch { /* skip malformed lines */ }
          }
        }
      },
      flush(controller) {
        if (this.buffer.trim()) {
          try { controller.enqueue(JSON.parse(this.buffer)); } catch {}
        }
      }
    }));

  return { process: proc, stream };
}
```

### Pattern 2: WebSocket Chat Channel
**What:** Extend the existing WebSocket server to handle chat messages bidirectionally
**When to use:** For sending user messages and streaming Claude responses
**Example:**
```typescript
// Extend existing ws-server.ts message handler
// Client sends: { type: "chat", prompt: "..." }
// Server streams back: { type: "chat_event", event: StreamEvent }
// Server sends on completion: { type: "chat_complete", sessionId: "..." }
```

### Pattern 3: NDJSON Stream Event Types
**What:** The documented event lifecycle from Claude Code stream-json output
**When to use:** When parsing and rendering streaming responses

Message flow (verified from official Agent SDK docs):
```
StreamEvent (message_start)
StreamEvent (content_block_start) - text or tool_use block
StreamEvent (content_block_delta) - text_delta or input_json_delta chunks
StreamEvent (content_block_stop)
StreamEvent (message_delta) - stop_reason, usage
StreamEvent (message_stop)
AssistantMessage - complete message
... tool executes (file writes trigger watcher -> panel updates) ...
... more streaming events for next turn ...
ResultMessage - final result with session_id
```

Key event types to handle:
| Event Type | delta.type | Action |
|------------|-----------|--------|
| content_block_delta | text_delta | Append delta.text to current message |
| content_block_delta | input_json_delta | Show tool call indicator |
| content_block_start | tool_use | Show "[Using ToolName...]" |
| content_block_stop | - | End tool indicator |
| message_stop | - | Mark message as complete |

### Pattern 4: Slash Command Autocomplete
**What:** Local prefix matching for `/gsd:` commands with dropdown
**When to use:** When user types `/` in chat input

```typescript
// Source: GSD README command table
const GSD_COMMANDS = [
  { command: "/gsd:new-project", description: "Full initialization", args: "[--auto]" },
  { command: "/gsd:discuss-phase", description: "Capture decisions before planning", args: "[N] [--auto]" },
  { command: "/gsd:plan-phase", description: "Research + plan + verify", args: "[N] [--auto]" },
  { command: "/gsd:execute-phase", description: "Execute all plans in waves", args: "<N>" },
  { command: "/gsd:verify-work", description: "Manual acceptance testing", args: "[N]" },
  { command: "/gsd:progress", description: "Where am I? What's next?", args: "" },
  { command: "/gsd:help", description: "Show all commands", args: "" },
  { command: "/gsd:quick", description: "Ad-hoc task with guarantees", args: "[--full] [--discuss]" },
  { command: "/gsd:pause-work", description: "Create handoff", args: "" },
  { command: "/gsd:resume-work", description: "Restore session", args: "" },
  { command: "/gsd:settings", description: "Configure workflow", args: "" },
  { command: "/gsd:debug", description: "Systematic debugging", args: "[desc]" },
  { command: "/gsd:health", description: "Validate .planning/ integrity", args: "[--repair]" },
  { command: "/gsd:add-phase", description: "Append phase to roadmap", args: "" },
  { command: "/gsd:insert-phase", description: "Insert urgent work", args: "[N]" },
  { command: "/gsd:complete-milestone", description: "Archive milestone, tag release", args: "" },
  { command: "/gsd:new-milestone", description: "Start next version", args: "[name]" },
  { command: "/gsd:map-codebase", description: "Analyze existing codebase", args: "" },
  { command: "/gsd:audit-milestone", description: "Verify milestone done criteria", args: "" },
  { command: "/gsd:add-todo", description: "Capture idea for later", args: "[desc]" },
  { command: "/gsd:check-todos", description: "List pending todos", args: "" },
  { command: "/gsd:update", description: "Update GSD", args: "" },
] as const;
```

### Pattern 5: Command History
**What:** Up/down arrow navigation through previous commands
**When to use:** Chat input keyboard handling

```typescript
function useCommandHistory(maxSize = 50) {
  const history = useRef<string[]>([]);
  const index = useRef(-1);

  const push = (cmd: string) => {
    if (cmd.trim() && cmd !== history.current[0]) {
      history.current.unshift(cmd);
      if (history.current.length > maxSize) history.current.pop();
    }
    index.current = -1;
  };

  const up = (currentValue: string): string => {
    if (index.current < history.current.length - 1) {
      index.current++;
      return history.current[index.current];
    }
    return currentValue;
  };

  const down = (currentValue: string): string => {
    if (index.current > 0) {
      index.current--;
      return history.current[index.current];
    }
    index.current = -1;
    return "";
  };

  return { push, up, down };
}
```

### Anti-Patterns to Avoid
- **Piping stdin to Claude Code:** Setting `stdin: "pipe"` causes a known deadlock (Issue #771). Always use `stdin: "inherit"`.
- **Polling for process output:** Use ReadableStream async iteration, not polling/setTimeout.
- **Accumulating full response before rendering:** Defeats the purpose of streaming. Forward each delta event immediately.
- **Storing chat state on the server:** Keep chat messages in React state. Server is a pass-through for Claude process I/O.
- **Creating multiple Claude processes simultaneously:** One process at a time. Queue or reject concurrent requests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NDJSON parsing | Custom buffered parser | TextDecoderStream + TransformStream split-on-newline | Standard Web Streams API, handles backpressure |
| Process lifecycle | Manual spawn/kill tracking | Bun.spawn with `proc.exited` Promise + AbortController signal | Built-in cleanup, timeout support |
| Slash command matching | Fuzzy search algorithm | Simple `startsWith` prefix filter on static array | Only ~22 commands, fuzzy search is overkill |
| Chat message rendering | Custom markdown renderer | Template literal interpolation (text only for v1) | Markdown rendering can come later; plain text streaming is the priority |

**Key insight:** The streaming infrastructure is the hard part. Chat UI is straightforward. Do not over-invest in rich message rendering before the streaming pipeline is solid.

## Common Pitfalls

### Pitfall 1: stdio Deadlock on Spawn
**What goes wrong:** Claude Code hangs indefinitely when spawned with `stdin: "pipe"`
**Why it happens:** Claude Code's internal process handling conflicts with piped stdin in Node.js/Bun child processes (GitHub Issue #771, closed as resolved with workaround)
**How to avoid:** Always use `stdin: "inherit"` when spawning Claude Code
**Warning signs:** Process spawns but no output appears on stdout

### Pitfall 2: Incomplete NDJSON Lines
**What goes wrong:** JSON.parse fails on partial lines from chunked stdout
**Why it happens:** ReadableStream chunks don't align with newline boundaries
**How to avoid:** Buffer partial lines in the TransformStream, only parse complete lines (split on `\n`, keep last incomplete segment)
**Warning signs:** `SyntaxError: Unexpected end of JSON input` in console

### Pitfall 3: Zombie Claude Processes
**What goes wrong:** Claude Code process outlives the server or continues after user navigates away
**Why it happens:** No cleanup on server shutdown, WebSocket disconnect, or new message sent
**How to avoid:** Track active process reference; kill on: server shutdown, client disconnect, new prompt submission. Use `proc.kill()` and `await proc.exited`.
**Warning signs:** Multiple `claude` processes in task manager, high CPU/memory

### Pitfall 4: WebSocket Message Ordering
**What goes wrong:** Chat stream events arrive interleaved with state diff events
**Why it happens:** Both use the same WebSocket connection
**How to avoid:** Use distinct message types (`chat_event` vs `diff`) and handle independently on the client. Consider using separate WebSocket topics if Bun pub/sub supports it.
**Warning signs:** Chat text appearing in wrong order or state updates blocking chat render

### Pitfall 5: Session Continuity
**What goes wrong:** Each chat message starts a new Claude conversation, losing context
**Why it happens:** Not passing `--resume` or `--continue` flag to subsequent invocations
**How to avoid:** Capture `session_id` from the ResultMessage of each invocation. Pass `--resume <session_id>` on next spawn.
**Warning signs:** Claude asks "what project is this?" on every message

### Pitfall 6: Chat Routing Performance (CHAT-07)
**What goes wrong:** Routing takes too long, violating the 200ms target
**Why it happens:** Waiting for Claude API for intent classification
**How to avoid:** For v1, use purely local routing: if input starts with `/gsd:`, it's a command. Everything else goes to Claude Code as a prompt. No API call needed for routing.
**Warning signs:** Measurable delay between pressing Enter and seeing any response indicator

## Code Examples

### Spawning Claude Code from Bun (Server-Side)
```typescript
// Source: Bun docs (https://bun.com/docs/runtime/child-process) +
//         Claude Code docs (https://code.claude.com/docs/en/headless)
const proc = Bun.spawn([
  "claude",
  "-p", userPrompt,
  "--output-format", "stream-json",
  "--verbose",
  "--include-partial-messages",
  "--allowedTools", "Bash,Read,Edit,Write,Grep,Glob",
], {
  cwd: repoRoot,
  stdin: "inherit",
  stdout: "pipe",
  stderr: "pipe",
});

// Read streaming output
const reader = proc.stdout.getReader();
let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += new TextDecoder().decode(value);
  const lines = buffer.split("\n");
  buffer = lines.pop()!;
  for (const line of lines) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    // Forward to WebSocket clients
    wsServer.publish("chat", JSON.stringify({ type: "chat_event", event }));
  }
}
await proc.exited;
```

### Chat Input with Autocomplete (Client-Side)
```tsx
// Source: Project patterns (lookup pattern from Phase 4/5)
function ChatInput({ onSend }: { onSend: (msg: string) => void }) {
  const [value, setValue] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const { push, up, down } = useCommandHistory();

  const filtered = value.startsWith("/")
    ? GSD_COMMANDS.filter(c => c.command.startsWith(value))
    : [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        push(value);
        onSend(value);
        setValue("");
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setValue(up(value));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setValue(down(value));
    }
  };

  return (
    <div className="relative">
      {filtered.length > 0 && (
        <div className="absolute bottom-full w-full bg-navy-800 border border-navy-600 rounded-t">
          {filtered.map(cmd => (
            <button key={cmd.command} onClick={() => { setValue(cmd.command + " "); setShowAutocomplete(false); }}
              className="w-full text-left px-3 py-2 hover:bg-navy-700 text-xs">
              <span className="text-cyan-accent">{cmd.command}</span>
              <span className="text-slate-400 ml-2">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type / for commands..."
        className="w-full bg-navy-800 text-slate-200 px-4 py-3 text-sm font-mono"
      />
    </div>
  );
}
```

### Streaming Message Renderer
```tsx
function ChatMessage({ message }: { message: ChatMsg }) {
  const isAgent = message.role === "assistant";
  const isSystem = message.role === "system";

  return (
    <div className={cn(
      "px-4 py-3 text-sm font-mono",
      isAgent && "bg-navy-800 border-l-2 border-cyan-accent",
      isSystem && "bg-navy-900 text-slate-500 italic text-xs",
      !isAgent && !isSystem && "bg-navy-base"
    )}>
      {message.toolName && (
        <div className="text-amber-400 text-xs mb-1">
          [Using {message.toolName}...] {message.toolDone && "done"}
        </div>
      )}
      <span className="whitespace-pre-wrap">{message.content}</span>
      {message.streaming && <span className="animate-pulse">|</span>}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `claude --json` (non-streaming) | `claude -p --output-format stream-json --verbose --include-partial-messages` | 2025 Agent SDK release | Token-by-token streaming with typed events |
| Node.js spawn with `stdio: "pipe"` | `stdin: "inherit"` workaround | Issue #771 closed Aug 2025 | Prevents deadlock on spawn |
| Custom Claude API integration | Claude Code CLI as subprocess | 2025 | Get full agent loop (tools, files, context) for free |

**Deprecated/outdated:**
- `--json` flag alone: Does not stream. Use `--output-format stream-json` instead.
- `claude --headless`: Renamed to `claude -p` (--print). Same functionality.

## Open Questions

1. **Session persistence across page reloads**
   - What we know: Claude CLI supports `--resume <session_id>` and `--continue`
   - What's unclear: Whether SERV-07 (session file) should store the Claude session_id for cross-restart continuity
   - Recommendation: Capture session_id from ResultMessage, store in-memory for current session. Defer persistence to Phase 9 (SERV-07).

2. **stdin: "inherit" on Windows with Bun**
   - What we know: The stdio deadlock fix uses `stdin: "inherit"`. Bun.spawn supports this on Windows.
   - What's unclear: Whether `stdin: "inherit"` causes issues when the Bun server is running as a background process (no TTY)
   - Recommendation: Test during implementation. Fallback: use `stdin: "ignore"` if no TTY is available (Claude Code in `-p` mode should not need stdin).

3. **Concurrent message handling**
   - What we know: Claude Code is a long-running process. Users might try to send another message while one is executing.
   - What's unclear: Whether to queue, reject, or kill-and-restart
   - Recommendation: Disable input while a process is active. Show "Claude is working..." state. Allow cancel button that kills the process.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test (built-in, `bun:test`) |
| Config file | bunfig.toml (exists) |
| Quick run command | `bun test --filter <pattern>` |
| Full suite command | `bun test` (from packages/mission-control) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | Slash command autocomplete filters on input | unit | `bun test tests/chat-input.test.tsx` | No - Wave 0 |
| CHAT-02 | Claude process spawns and produces stream events | integration | `bun test tests/claude-process.test.ts` | No - Wave 0 |
| CHAT-03 | NDJSON parser produces typed events from raw text | unit | `bun test tests/ndjson-parser.test.ts` | No - Wave 0 |
| CHAT-04 | Message styling differs for agent vs system | unit | `bun test tests/chat-message.test.tsx` | No - Wave 0 |
| CHAT-05 | File watcher triggers state update during execution | integration | `bun test tests/pipeline-perf.test.ts` | Yes (existing) |
| CHAT-06 | Command history navigates with up/down arrows | unit | `bun test tests/chat-input.test.tsx` | No - Wave 0 |
| CHAT-07 | Chat routing resolves under 200ms | unit | `bun test tests/chat-router.test.ts` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test --filter <changed-module>`
- **Per wave merge:** `bun test` (full suite from packages/mission-control)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/claude-process.test.ts` -- covers CHAT-02 (spawn + stream parsing, can mock the process)
- [ ] `tests/ndjson-parser.test.ts` -- covers CHAT-03 (pure function, easy to test with fixture data)
- [ ] `tests/chat-router.test.ts` -- covers CHAT-07 (routing performance, prefix matching)
- [ ] `tests/chat-input.test.tsx` -- covers CHAT-01, CHAT-06 (autocomplete filtering, command history)
- [ ] `tests/chat-message.test.tsx` -- covers CHAT-04 (visual differentiation by message role)

## Sources

### Primary (HIGH confidence)
- [Bun.spawn docs](https://bun.com/docs/runtime/child-process) - Child process API, ReadableStream stdout, stdin options, process lifecycle
- [Claude Code headless/programmatic docs](https://code.claude.com/docs/en/headless) - CLI flags: `-p`, `--output-format stream-json`, `--verbose`, `--include-partial-messages`, `--resume`, `--continue`
- [Agent SDK streaming output docs](https://platform.claude.com/docs/en/agent-sdk/streaming-output) - StreamEvent types, message flow lifecycle, content_block_delta/text_delta structure

### Secondary (MEDIUM confidence)
- [GitHub Issue #771](https://github.com/anthropics/claude-code/issues/771) - stdin deadlock resolved with `stdin: "inherit"` workaround (closed, confirmed fix)
- [Claude Agent SDK Spec (Gist)](https://gist.github.com/POWERFULMOVES/58bcadab9483bf5e633e865f131e6c25) - NDJSON message types: system, assistant, result, stream_event, user
- [GitHub Issue #24596](https://github.com/anthropics/claude-code/issues/24596) - Documents that stream-json event types are under-documented; confirms event type list

### Tertiary (LOW confidence)
- [Bun Issue #21584](https://github.com/oven-sh/bun/issues/21584) - Bun crash with Claude Code on Windows (fixed in Bun 1.2.20+, project uses 1.3.10+ so not applicable)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Bun.spawn is well-documented, Claude CLI flags verified from official docs
- Architecture: HIGH - Follows existing project patterns (pipeline, hooks, component structure)
- Pitfalls: HIGH - stdio deadlock is a documented, resolved issue with clear workaround; NDJSON parsing is a known problem space
- Streaming protocol: MEDIUM - Event types confirmed from Agent SDK docs but CLI-specific docs acknowledge gaps (Issue #24596)

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- Claude CLI and Bun APIs are mature)
