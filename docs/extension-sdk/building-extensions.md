# Building Extensions

// GSD-2 Extension SDK — Practical guide to building extensions

This guide covers each extension capability with working code examples. All patterns are verified against the GSD-2 codebase.

For manifest configuration, see [manifest-spec.md](manifest-spec.md). For testing, see [testing.md](testing.md).

---

## Extension Entry Point

Every extension exports a default function that receives the `ExtensionAPI` object (`pi`). This function runs once at load time and is where you register all capabilities.

```typescript
import type { ExtensionAPI } from "@gsd/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Register tools, commands, events, shortcuts here
}
```

---

## Tools — Giving the LLM New Abilities

Tools appear in the LLM's system prompt and are called autonomously when appropriate. They are the most powerful extension capability.

### Basic Tool

```typescript
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@gsd/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this does (shown to LLM in system prompt)",
  promptSnippet: "Short one-liner for system prompt",
  promptGuidelines: ["When to use this tool", "When NOT to use it"],
  parameters: Type.Object({
    action: StringEnum(["list", "add", "delete"] as const),
    text: Type.Optional(Type.String({ description: "Item text" })),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // Check for cancellation in long-running operations
    if (signal?.aborted) {
      return { content: [{ type: "text", text: "Cancelled" }] };
    }

    // Stream progress updates to the UI
    onUpdate?.({
      content: [{ type: "text", text: "Working..." }],
      details: { progress: 50 },
    });

    // Do the work
    const result = await doSomething(params);

    return {
      content: [{ type: "text", text: "Result for LLM" }],
      details: { state: result },  // For rendering and branching support
    };
  },
});
```

### Tool Rendering (Optional)

Tools can customize how they appear in the TUI:

```typescript
import { Text } from "@gsd/pi-tui";
import { keyHint } from "@gsd/pi-coding-agent";

pi.registerTool({
  name: "my_tool",
  // ... parameters, execute, etc.

  renderCall(args, theme) {
    let text = theme.fg("toolTitle", theme.bold("my_tool "));
    text += theme.fg("muted", args.action);
    return new Text(text, 0, 0);
  },

  renderResult(result, { expanded, isPartial }, theme) {
    if (isPartial) {
      return new Text(theme.fg("warning", "Processing..."), 0, 0);
    }
    let text = theme.fg("success", "Done");
    if (!expanded) {
      text += ` (${keyHint("expandTools", "to expand")})`;
    }
    if (expanded && result.details?.items) {
      for (const item of result.details.items) {
        text += "\n  " + theme.fg("dim", item);
      }
    }
    return new Text(text, 0, 0);
  },
});
```

### Output Truncation

Tools **must** truncate output to avoid overwhelming the LLM context. The built-in limit is 50KB / 2000 lines (whichever is reached first).

```typescript
import {
  truncateHead, truncateTail, formatSize,
  DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES,
} from "@gsd/pi-coding-agent";

async execute(toolCallId, params, signal, onUpdate, ctx) {
  const output = await runCommand();
  const truncation = truncateHead(output, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let result = truncation.content;
  if (truncation.truncated) {
    result += `\n\n[Output truncated: ${truncation.outputLines}/${truncation.totalLines} lines]`;
  }
  return { content: [{ type: "text", text: result }] };
}
```

### Dynamic Tool Registration

Tools can be registered at any time — during load, in `session_start`, or in command handlers. New tools are available immediately without `/reload`.

```typescript
pi.on("session_start", async (_event, ctx) => {
  pi.registerTool({ name: "dynamic_tool", /* ... */ });
});

pi.registerCommand("add-tool", {
  description: "Register a tool at runtime",
  handler: async (args, ctx) => {
    pi.registerTool({ name: "runtime_tool", /* ... */ });
    ctx.ui.notify("Tool registered!", "info");
  },
});
```

### Key Tool Rules

- **Use `StringEnum` for string enums** — `Type.Union([Type.Literal("a"), Type.Literal("b")])` breaks Google's API.
- **Truncate output** to 50KB / 2000 lines max.
- **Store state in `details`** for branching support.
- **Check `signal?.aborted`** in long-running operations.
- **Strip leading `@` from path params** — some models add it.
- **Use `pi.exec()` instead of `child_process`** for shell commands.

---

## Commands — User-Facing Slash Commands

Commands let users invoke your extension directly via `/mycommand`.

### Basic Command

```typescript
pi.registerCommand("deploy", {
  description: "Deploy to environment: /deploy dev|staging|prod",

  getArgumentCompletions: (prefix) => {
    const envs = ["dev", "staging", "prod"];
    const parts = prefix.trim().split(/\s+/);
    if (parts.length <= 1) {
      return envs
        .filter((e) => e.startsWith(parts[0] ?? ""))
        .map((e) => ({ value: e, label: e }));
    }
    return [];
  },

  handler: async (args, ctx) => {
    await ctx.waitForIdle();
    ctx.ui.notify(`Deploying to ${args}`, "info");
  },
});
```

### Subcommand Pattern

For commands with multiple operations (like `/watch start|stop`), register a single command and treat the first argument as a subcommand:

```typescript
pi.registerCommand("watch", {
  description: "Watch dashboard: /watch start|stop",

  getArgumentCompletions: (prefix) => {
    const subs = ["start", "stop"];
    const parts = prefix.trim().split(/\s+/);
    if (parts.length <= 1) {
      return subs
        .filter((s) => s.startsWith(parts[0] ?? ""))
        .map((s) => ({ value: s, label: s }));
    }
    return [];
  },

  handler: async (args, ctx) => {
    const [sub, ...rest] = args.trim().split(/\s+/);
    switch (sub) {
      case "start":
        ctx.ui.notify("Watch started", "info");
        return;
      case "stop":
        ctx.ui.notify("Watch stopped", "info");
        return;
      default:
        ctx.ui.notify("Usage: /watch start|stop", "info");
    }
  },
});
```

### Dynamic Second-Argument Completion

Later arguments can depend on the first:

```typescript
getArgumentCompletions: (prefix) => {
  const parts = prefix.trim().split(/\s+/);
  const sub = parts[0];

  if (parts.length <= 1) {
    return ["new", "list", "delete"]
      .filter((s) => s.startsWith(sub ?? ""))
      .map((s) => ({ value: s, label: s }));
  }

  if (sub === "delete") {
    const items = getCurrentItems();
    const namePrefix = parts[1] ?? "";
    return items
      .filter((item) => item.startsWith(namePrefix))
      .map((item) => ({ value: `delete ${item}`, label: item }));
  }

  return [];
},
```

### Empty Prefix Gotcha

`"".trim().split(/\s+/)` returns `['']`, not `[]`. That is why the pattern uses `parts.length <= 1` to handle both empty input and partially typed first arguments.

### Command Context Extras

Command handlers receive `ExtensionCommandContext`, which extends `ExtensionContext` with session control methods:

| Method | Purpose |
|--------|---------|
| `ctx.waitForIdle()` | Wait for agent to finish streaming |
| `ctx.newSession(options?)` | Create a new session |
| `ctx.fork(entryId)` | Fork from an entry |
| `ctx.navigateTree(targetId, options?)` | Navigate the session tree |
| `ctx.reload()` | Hot-reload extensions, skills, prompts, themes |

**These methods are only available in commands, not in event handlers** — they would deadlock there.

---

## Events — Lifecycle Hooks

The event system is your primary mechanism for interacting with the agent lifecycle. Every meaningful thing that happens emits an event, and most events let you modify or block the behavior.

### Event Flow

```
User types a prompt
  ├── input (can intercept/transform)
  ├── before_agent_start (inject message, modify system prompt)
  ├── agent_start
  │   ┌── Turn loop (repeats while LLM calls tools)
  │   │ turn_start
  │   │ context (can modify messages sent to LLM)
  │   │ LLM responds → may call tools:
  │   │   tool_call (can BLOCK)
  │   │   tool_execution_start/update/end
  │   │   tool_result (can MODIFY)
  │   │ turn_end
  │   └──
  └── agent_end
```

### Session Events

```typescript
// React to session start
pi.on("session_start", async (event, ctx) => {
  ctx.ui.notify("Extension loaded!", "info");
});

// React to session switch (user changes conversation)
pi.on("session_switch", async (event, ctx) => {
  // Rebuild state for the new session
});

// React to branch navigation
pi.on("session_tree", async (event, ctx) => {
  // Rebuild state for the new branch
});
```

### Blocking Tool Calls

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName === "bash" && event.input.command?.includes("rm -rf /")) {
    return { block: true, reason: "Blocked dangerous command" };
  }
});
```

### Modifying Tool Results

```typescript
pi.on("tool_result", async (event, ctx) => {
  if (event.toolName === "my_tool") {
    return { result: { ...event.result, modified: true } };
  }
});
```

### System Prompt Modification

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  return {
    // Modify the system prompt for this turn
    systemPrompt: event.systemPrompt + "\n\nAlways be concise.",
    // Optionally inject a persistent message
    message: {
      customType: "my-extension",
      content: "Additional context for the LLM",
      display: true,
    },
  };
});
```

### Context Manipulation

Modify the messages sent to the LLM on every turn:

```typescript
pi.on("context", async (event, ctx) => {
  // event.messages is a deep copy — safe to modify
  const filtered = event.messages.filter((m) => !isIrrelevant(m));
  return { messages: filtered };
});
```

### Tool-Specific Prompt Content

Tools can add to the system prompt when they are active:

```typescript
pi.registerTool({
  name: "my_tool",
  promptSnippet: "Summarize or transform text",       // Replaces description in "Available tools"
  promptGuidelines: [
    "Use my_tool when the user asks to summarize text.",
    "Prefer my_tool over direct output for structured data.",
  ],  // Added to "Guidelines" section when tool is active
  // ...
});
```

---

## UI — User Interface

### Built-in Dialogs

```typescript
const choice = await ctx.ui.select("Pick:", ["A", "B", "C"]);
const ok = await ctx.ui.confirm("Delete?", "Cannot undo");
const name = await ctx.ui.input("Name:", "placeholder");
const text = await ctx.ui.editor("Edit:", "prefilled text");

// Timed dialog — auto-dismisses after timeout
const ok = await ctx.ui.confirm("Auto-confirm?", "Proceeds in 5s", { timeout: 5000 });
```

Always check `ctx.hasUI` first — it is `false` in print/JSON output modes.

### Persistent UI Elements

```typescript
// Footer status (persistent until cleared)
ctx.ui.setStatus("my-ext", "Active");
ctx.ui.setStatus("my-ext", undefined);       // Clear

// Widget panel (above editor by default)
ctx.ui.setWidget("my-id", ["Line 1", "Line 2"]);

// Widget below editor
ctx.ui.setWidget("my-id", ["Below!"], { placement: "belowEditor" });

// Widget with theme callback
ctx.ui.setWidget("my-id", (_tui, theme) => ({
  render: () => [theme.fg("accent", "Styled widget")],
  invalidate: () => {},
}));

// Working message during streaming
ctx.ui.setWorkingMessage("Processing...");
ctx.ui.setWorkingMessage();                   // Restore default

// Editor control
ctx.ui.setEditorText("Prefill");
const current = ctx.ui.getEditorText();
ctx.ui.pasteToEditor("pasted content");

// Tool expansion
ctx.ui.setToolsExpanded(true);
```

### Custom Components

For complex UI, `ctx.ui.custom()` temporarily replaces the editor with your component:

```typescript
import { matchesKey, Key, truncateToWidth } from "@gsd/pi-tui";

const result = await ctx.ui.custom<string | null>((tui, theme, keybindings, done) => {
  return {
    render(width: number): string[] {
      return [truncateToWidth("Press Enter to confirm, Escape to cancel", width)];
    },
    handleInput(data: string) {
      if (matchesKey(data, Key.enter)) done("confirmed");
      if (matchesKey(data, Key.escape)) done(null);
      return true;
    },
    invalidate() {},
  };
});
```

### Overlays (Floating Modals)

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => ({
    render(width) { return [theme.fg("accent", "Hello!")]; },
    handleInput(key) { if (matchesKey(key, Key.escape)) done(null); return true; },
    invalidate() {},
  }),
  {
    overlay: true,
    overlayOptions: {
      anchor: "center",
      width: "50%",
      maxHeight: "80%",
      margin: 2,
      visible: (w, h) => w >= 80,  // Hide on narrow terminals
    },
  }
);
```

### Custom Component Rules

- Lines must not exceed `width` — use `truncateToWidth()`.
- Use `theme` from callback params, never import directly.
- Call `tui.requestRender()` after state changes in `handleInput`.
- Return `{ render, invalidate, handleInput }` from the factory.
- Overlay components are disposed when closed — create fresh instances each time.

### Keyboard Input

```typescript
import { matchesKey, Key } from "@gsd/pi-tui";

handleInput(data: string) {
  if (matchesKey(data, Key.up)) { /* arrow up */ }
  if (matchesKey(data, Key.enter)) { /* enter */ }
  if (matchesKey(data, Key.escape)) { /* escape */ }
  if (matchesKey(data, Key.ctrl("c"))) { /* ctrl+c */ }
  if (matchesKey(data, Key.shift("tab"))) { /* shift+tab */ }
}
```

### Theme Colors Reference

```typescript
// Foreground: theme.fg(color, text)
"text" | "accent" | "muted" | "dim"           // General
"success" | "error" | "warning"                 // Status
"border" | "borderAccent" | "borderMuted"       // Borders
"toolTitle" | "toolOutput"                      // Tools
"toolDiffAdded" | "toolDiffRemoved"             // Diffs
"mdHeading" | "mdLink" | "mdCode"              // Markdown
"syntaxKeyword" | "syntaxFunction" | "syntaxString"  // Syntax

// Background: theme.bg(color, text)
"selectedBg" | "userMessageBg" | "customMessageBg"
"toolPendingBg" | "toolSuccessBg" | "toolErrorBg"
```

### Built-in TUI Components

Import from `@gsd/pi-tui`:

| Component | Purpose |
|-----------|---------|
| `Text` | Multi-line text with word wrapping |
| `Box` | Container with padding and background |
| `Container` | Groups children vertically |
| `Spacer` | Empty vertical space |
| `Markdown` | Rendered markdown with syntax highlighting |
| `Image` | Image rendering (Kitty, iTerm2, etc.) |
| `SelectList` | Interactive selection from list |
| `SettingsList` | Toggle settings UI |
| `Input` | Text input field |

Import from `@gsd/pi-coding-agent`:

| Component | Purpose |
|-----------|---------|
| `DynamicBorder` | Border line with theming |
| `BorderedLoader` | Spinner with cancel support |

---

## State Management

### State in Tool Result Details (Recommended)

Store state in `details` so it works correctly with branching/forking:

```typescript
export default function (pi: ExtensionAPI) {
  let items: string[] = [];

  pi.registerTool({
    name: "my_tool",
    // ...
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      items.push(params.text);
      return {
        content: [{ type: "text", text: "Added" }],
        details: { items: [...items] },  // Snapshot state here
      };
    },
  });
}
```

### Complete State Reconstruction

Extensions **must** handle all three session lifecycle events to keep in-memory state consistent:

- **`session_start`** — Initial load or reload (app startup, extension reload)
- **`session_switch`** — User switches between sessions (different conversations)
- **`session_tree`** — User navigates to a different conversation branch

```typescript
function reconstructState(ctx: ExtensionContext): string[] {
  const items: string[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.role === "toolResult") {
      if (entry.message.toolName === "my_tool") {
        items.length = 0;
        items.push(...(entry.message.details?.items ?? []));
      }
    }
  }
  return items;
}

export default function (pi: ExtensionAPI) {
  let items: string[] = [];

  const rebuild = async (_event: unknown, ctx: ExtensionContext) => {
    items = reconstructState(ctx);
  };

  pi.on("session_start", rebuild);    // Initial load
  pi.on("session_switch", rebuild);   // Session change
  pi.on("session_tree", rebuild);     // Branch navigation
}
```

### Extension-Private State (appendEntry)

For state that does not participate in LLM context but needs to survive restarts:

```typescript
// Write private state
pi.appendEntry("my-state", { count: 42, lastRun: Date.now() });

// Restore on reload
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "my-state") {
      const data = entry.data;  // { count: 42, lastRun: ... }
    }
  }
});
```

---

## Keyboard Shortcuts

```typescript
pi.registerShortcut("Ctrl+Shift+W", {
  description: "Toggle watch dashboard",
  handler: async (ctx) => {
    // ctx is ExtensionContext
    ctx.ui.notify("Toggled!", "info");
  },
});
```

---

## Inter-Extension Communication

Use `pi.events` (shared EventBus) for extension-to-extension messaging. Every extension receives the same `pi.events` instance.

### Basic Pub/Sub

```typescript
// Publisher extension
pi.events.emit("my-ext:data-ready", { items: [...] });

// Subscriber extension — returns an unsubscribe function
const unsub = pi.events.on("my-ext:data-ready", (data) => {
  const payload = data as { items: string[] };  // data is typed as unknown
  // React to data
});

// Later: stop listening
unsub();
```

### Event Bus as State Channel

```typescript
// Extension A: authoritative state owner
let items: string[] = [];

function addItem(item: string) {
  items.push(item);
  pi.events.emit("items:updated", { items: [...items] });
}

// Extension B: state consumer
let mirroredItems: string[] = [];

pi.events.on("items:updated", (data) => {
  mirroredItems = (data as { items: string[] }).items;
});
```

### Session Entries as Coordination Points

Extensions can read each other's `appendEntry` data from the session:

```typescript
// Extension A writes:
pi.appendEntry("ext-a-config", { theme: "dark", verbose: true });

// Extension B reads during session_start:
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "ext-a-config") {
      const config = entry.data as { theme: string; verbose: boolean };
    }
  }
});
```

### Event Bus Characteristics

| Property | Behavior |
|----------|----------|
| Typing | `data` is `unknown` — cast at the consumer |
| Error handling | Handlers are wrapped in try/catch; errors log but do not propagate |
| Ordering | Handlers fire in subscription order |
| Persistence | No replay, no persistence — emit before subscribe and the event is lost |
| Scope | Shared across all extensions in the session |
| Lifecycle | Cleared on `/reload` — old subscriptions are gone |

### Naming Convention

Use descriptive channel names to avoid collisions: `"myext:event"` rather than `"update"`.

---

## Messaging

Send messages into the session programmatically:

```typescript
// Inject a message (default: "steer" mode — interrupts streaming)
pi.sendMessage({
  customType: "my-extension",
  content: "Status update",
  display: true,
  details: { foo: "bar" },
});

// Send a user message (triggers a new agent turn)
pi.sendUserMessage("Please analyze the latest changes");
```

### Delivery Modes

| Mode | Behavior |
|------|----------|
| `"steer"` (default) | Interrupts streaming. Delivered after current tool finishes, remaining tools skipped. |
| `"followUp"` | Waits for agent to finish. Delivered when agent has no more tool calls. |
| `"nextTurn"` | Queued for next user prompt. Does not interrupt. |

### Custom Message Rendering

Register a renderer for your custom message types:

```typescript
import { Text } from "@gsd/pi-tui";

pi.registerMessageRenderer("my-extension", (message, options, theme) => {
  const { expanded } = options;
  let text = theme.fg("accent", `[${message.customType}] `) + message.content;
  if (expanded && message.details) {
    text += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2));
  }
  return new Text(text, 0, 0);
});
```

---

## Tool Management

Control which tools are active at runtime:

```typescript
// Get currently active tool names
const active = pi.getActiveTools();

// Get all registered tools (name + description)
const all = pi.getAllTools();

// Enable/disable tools at runtime
pi.setActiveTools(["bash", "read", "my_tool"]);
```

---

## Model Management

```typescript
// Switch model (returns false if no API key)
pi.setModel("claude-sonnet-4-20250514");

// Thinking level control
const level = pi.getThinkingLevel();
pi.setThinkingLevel("high");  // "off" through "xhigh"
```

---

## Key Rules and Gotchas

1. **Use `StringEnum` for string enums** — `Type.Union`/`Type.Literal` breaks Google's API.
2. **Truncate tool output** — 50KB / 2000 lines max.
3. **Use theme from callback params** — never import theme directly.
4. **Call `tui.requestRender()`** after state changes in `handleInput`.
5. **Lines must not exceed `width`** in `render()` — use `truncateToWidth()`.
6. **Session control methods only in commands** — `waitForIdle()`, `newSession()`, `fork()`, `navigateTree()`, `reload()` will deadlock in event handlers.
7. **Strip leading `@` from path arguments** — some models add it.
8. **Store state in tool result `details`** for branching support.
9. **Handle all three session events** — `session_start`, `session_switch`, `session_tree`.
10. **Use `pi.exec()` instead of `child_process`** for shell commands.
11. **Treat `ctx.reload()` as terminal** — code after it runs from the pre-reload version.
12. **Overlay components are disposed when closed** — create fresh instances each time.

---

## ExtensionAPI Quick Reference

### Registration

| Method | Purpose |
|--------|---------|
| `pi.registerTool(definition)` | Register a tool the LLM can call |
| `pi.registerCommand(name, options)` | Register a `/command` |
| `pi.registerShortcut(key, options)` | Register a keyboard shortcut |
| `pi.registerFlag(name, options)` | Register a CLI flag |
| `pi.registerMessageRenderer(type, renderer)` | Custom message rendering |
| `pi.registerProvider(name, config)` | Register/override a model provider |
| `pi.on(event, handler)` | Subscribe to events |

### Messaging and State

| Method | Purpose |
|--------|---------|
| `pi.sendMessage(message, options?)` | Inject a message into the session |
| `pi.sendUserMessage(content, options?)` | Send a user message (triggers a turn) |
| `pi.appendEntry(customType, data?)` | Persist extension state (not sent to LLM) |
| `pi.events` | Shared event bus for inter-extension communication |

### Runtime Control

| Method | Purpose |
|--------|---------|
| `pi.getActiveTools()` | Get currently active tool names |
| `pi.setActiveTools(names)` | Enable/disable tools at runtime |
| `pi.setModel(model)` | Switch model |
| `pi.setThinkingLevel(level)` | Set thinking level |
| `pi.exec(command, args, options?)` | Execute a shell command |

---

## ExtensionContext Quick Reference

The `ctx` object is passed to event handlers, command handlers, and tool execute functions:

| Property/Method | Purpose |
|-----------------|---------|
| `ctx.ui` | Dialog methods, notifications, widgets |
| `ctx.sessionManager` | Read session state |
| `ctx.model` | Current model |
| `ctx.cwd` | Working directory |
| `ctx.hasUI` | `false` in print/JSON mode |
| `ctx.isIdle()` | Agent state |
| `ctx.abort()` | Abort current operation |
| `ctx.getContextUsage()` | Token usage |
| `ctx.compact()` | Trigger compaction |
| `ctx.getSystemPrompt()` | Current system prompt |
