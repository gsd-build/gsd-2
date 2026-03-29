# API Reference

// GSD-2 Extension SDK — Complete API surface reference

This document covers every public method and type exposed by the Extension SDK. For usage patterns and examples, see [Building Extensions](./building-extensions.md).

---

## ExtensionAPI (`pi`)

The `pi` object is passed to your extension's default export function. It persists for the extension's lifetime and is used during initialization to register tools, commands, event handlers, and providers.

```typescript
export default function activate(pi: ExtensionAPI): void {
  // Registration happens here
}
```

### Event Subscription

| Method | Purpose |
|--------|---------|
| `pi.on(event, handler)` | Subscribe to a lifecycle event. See [Lifecycle Events](#lifecycle-events) for the full list. |

Handler signature: `(event: E, ctx: ExtensionContext) => Promise<R \| void> \| R \| void`

Handlers receive the event payload and an `ExtensionContext`. Return values vary by event type — see each event's result type below.

### Registration

| Method | Signature | Purpose |
|--------|-----------|---------|
| `pi.registerTool(definition)` | `registerTool<TParams, TDetails>(tool: ToolDefinition<TParams, TDetails>)` | Register an LLM-callable tool |
| `pi.registerCommand(name, options)` | `registerCommand(name: string, options: { description?, getArgumentCompletions?, handler })` | Register a `/command` |
| `pi.registerShortcut(key, options)` | `registerShortcut(shortcut: KeyId, options: { description?, handler })` | Register a keyboard shortcut |
| `pi.registerFlag(name, options)` | `registerFlag(name: string, options: { description?, type: "boolean" \| "string", default? })` | Register a CLI flag |
| `pi.registerMessageRenderer(customType, renderer)` | `registerMessageRenderer<T>(customType: string, renderer: MessageRenderer<T>)` | Custom rendering for `CustomMessageEntry` |
| `pi.registerProvider(name, config)` | `registerProvider(name: string, config: ProviderConfig)` | Register or override a model provider |
| `pi.unregisterProvider(name)` | `unregisterProvider(name: string)` | Remove a previously registered provider |

#### Lifecycle Hook Registration

| Method | Purpose |
|--------|---------|
| `pi.registerBeforeInstall(handler)` | Hook run before package installation starts |
| `pi.registerAfterInstall(handler)` | Hook run after package installation completes |
| `pi.registerBeforeRemove(handler)` | Hook run before package removal starts |
| `pi.registerAfterRemove(handler)` | Hook run after package removal completes |

### Messaging

| Method | Signature | Purpose |
|--------|-----------|---------|
| `pi.sendMessage(message, options?)` | `sendMessage<T>(message, options?: { triggerTurn?, deliverAs? })` | Inject a custom message into the session |
| `pi.sendUserMessage(content, options?)` | `sendUserMessage(content: string \| ContentBlock[], options?: { deliverAs? })` | Send a user message (always triggers a turn) |
| `pi.retryLastTurn()` | `retryLastTurn()` | Retry last turn (no-op if last message is not an assistant error) |

#### Delivery Modes (`deliverAs`)

| Mode | Behavior |
|------|----------|
| `"steer"` | **(default)** Interrupts the current agent turn immediately |
| `"followUp"` | Waits for the agent to finish, then delivers |
| `"nextTurn"` | Queued for the next turn (only for `sendMessage`) |

### State and Session

| Method | Signature | Purpose |
|--------|-----------|---------|
| `pi.appendEntry(customType, data?)` | `appendEntry<T>(customType: string, data?: T)` | Persist extension state (not sent to LLM) |
| `pi.setSessionName(name)` | `setSessionName(name: string)` | Set session display name |
| `pi.getSessionName()` | `getSessionName(): string \| undefined` | Get current session name |
| `pi.setLabel(entryId, label)` | `setLabel(entryId: string, label: string \| undefined)` | Bookmark an entry for `/tree` navigation |

### Tool Management

| Method | Signature | Purpose |
|--------|-----------|---------|
| `pi.getActiveTools()` | `getActiveTools(): string[]` | Get currently active tool names |
| `pi.getAllTools()` | `getAllTools(): ToolInfo[]` | Get all registered tools (name, description, parameters) |
| `pi.setActiveTools(names)` | `setActiveTools(toolNames: string[])` | Enable/disable tools at runtime |

### Model Management

| Method | Signature | Purpose |
|--------|-----------|---------|
| `pi.setModel(model, options?)` | `setModel(model: Model, options?: { persist?: boolean }): Promise<boolean>` | Switch model. Returns `false` if no API key available. |
| `pi.getThinkingLevel()` | `getThinkingLevel(): ThinkingLevel` | Get current thinking level |
| `pi.setThinkingLevel(level)` | `setThinkingLevel(level: ThinkingLevel)` | Set thinking level (clamped to model capabilities) |

`ThinkingLevel` values: `"off"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`

### Utilities

| Method | Signature | Purpose |
|--------|-----------|---------|
| `pi.exec(command, args, options?)` | `exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>` | Execute a shell command |
| `pi.getFlag(name)` | `getFlag(name: string): boolean \| string \| undefined` | Get a registered CLI flag's value |
| `pi.getCommands()` | `getCommands(): SlashCommandInfo[]` | Get all available slash commands |
| `pi.events` | `events: EventBus` | Shared event bus for inter-extension communication |

---

## ExtensionContext (`ctx`)

Passed to event handlers and command handlers. Provides a window into runtime state.

```typescript
pi.on("session_start", (event, ctx) => {
  // ctx is ExtensionContext
});
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `ctx.ui` | `ExtensionUIContext` | UI methods for user interaction |
| `ctx.hasUI` | `boolean` | `false` in print/JSON/RPC mode — check before calling dialogs |
| `ctx.cwd` | `string` | Current working directory |
| `ctx.sessionManager` | `ReadonlySessionManager` | Session access: `getEntries()`, `getBranch()`, `getLeafId()`, `getSessionFile()` |
| `ctx.modelRegistry` | `ModelRegistry` | Model registry for API key resolution |
| `ctx.model` | `Model \| undefined` | Current model (may be undefined) |

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `ctx.isIdle()` | `isIdle(): boolean` | Whether the agent is idle (not streaming) |
| `ctx.abort()` | `abort(): void` | Abort the current agent operation |
| `ctx.hasPendingMessages()` | `hasPendingMessages(): boolean` | Whether there are queued messages waiting |
| `ctx.shutdown()` | `shutdown(): void` | Graceful shutdown and exit |
| `ctx.getContextUsage()` | `getContextUsage(): ContextUsage \| undefined` | Token usage: `{ tokens, contextWindow, percent }` |
| `ctx.compact(options?)` | `compact(options?: CompactOptions): void` | Trigger compaction without awaiting |
| `ctx.getSystemPrompt()` | `getSystemPrompt(): string` | Get current effective system prompt |

### ctx.ui — User Interaction

#### Dialogs (blocking, async)

```typescript
// Selection — returns chosen option, or undefined if dismissed
await ctx.ui.select("Pick one:", ["Option A", "Option B"], opts?);

// Multi-select — set opts.allowMultiple = true, returns string[]
await ctx.ui.select("Pick many:", items, { allowMultiple: true });

// Confirmation — returns boolean
await ctx.ui.confirm("Delete file?", "This cannot be undone", opts?);

// Text input — returns string or undefined
await ctx.ui.input("Enter name:", "placeholder text", opts?);

// Multi-line editor — returns string or undefined
await ctx.ui.editor("Edit content:", "prefilled text");
```

**Dialog options** (`ExtensionUIDialogOptions`):

| Option | Type | Description |
|--------|------|-------------|
| `signal` | `AbortSignal` | Programmatically dismiss the dialog |
| `timeout` | `number` | Auto-dismiss after N milliseconds (shows countdown) |
| `allowMultiple` | `boolean` | Enable multi-select (for `select()` only) |

#### Non-blocking UI

```typescript
// Notification toast
ctx.ui.notify("Operation complete!", "success");  // "info" | "warning" | "error" | "success"

// Status bar text (pass undefined to clear)
ctx.ui.setStatus("my-ext", "Active");

// Widget above/below editor (string[] or component factory)
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"], { placement: "aboveEditor" });

// Set the working/loading message during streaming
ctx.ui.setWorkingMessage("Analyzing...");

// Prefill the input editor
ctx.ui.setEditorText("Prefilled content");

// Get current editor text
const text = ctx.ui.getEditorText();

// Paste into editor (triggers paste handling for large content)
ctx.ui.pasteToEditor(text);

// Set terminal window/tab title
ctx.ui.setTitle("My Extension");
```

#### Advanced UI

| Method | Purpose |
|--------|---------|
| `ctx.ui.custom(factory, options?)` | Show a custom component with keyboard focus. Supports overlay mode. |
| `ctx.ui.setFooter(factory)` | Replace the built-in footer with a custom component |
| `ctx.ui.setHeader(factory)` | Replace the built-in header with a custom component |
| `ctx.ui.setEditorComponent(factory)` | Replace the input editor with a custom `EditorComponent` |
| `ctx.ui.onTerminalInput(handler)` | Listen to raw terminal input (interactive mode only). Returns unsubscribe function. |
| `ctx.ui.theme` | Get the current `Theme` for styling |
| `ctx.ui.getAllThemes()` | Get available themes: `{ name, path }[]` |
| `ctx.ui.getTheme(name)` | Load a theme by name without switching |
| `ctx.ui.setTheme(theme)` | Set theme by name or `Theme` object |
| `ctx.ui.getToolsExpanded()` | Get tool output expansion state |
| `ctx.ui.setToolsExpanded(expanded)` | Set tool output expansion state |

---

## ExtensionCommandContext (commands only)

Extends `ExtensionContext` with session control methods. **Only available in command handlers** — using these in event handlers causes deadlocks.

```typescript
pi.registerCommand("my-cmd", {
  description: "My command",
  handler: async (args, ctx) => {
    // ctx is ExtensionCommandContext
    await ctx.waitForIdle();
  },
});
```

| Method | Signature | Purpose |
|--------|-----------|---------|
| `ctx.waitForIdle()` | `waitForIdle(): Promise<void>` | Wait for the agent to finish streaming |
| `ctx.newSession(options?)` | `newSession(options?: { parentSession?, setup? }): Promise<{ cancelled: boolean }>` | Create a new session |
| `ctx.fork(entryId)` | `fork(entryId: string): Promise<{ cancelled: boolean }>` | Fork from a specific entry |
| `ctx.navigateTree(targetId, options?)` | `navigateTree(targetId, options?): Promise<{ cancelled: boolean }>` | Navigate to a different point in the session tree |
| `ctx.switchSession(sessionPath)` | `switchSession(sessionPath: string): Promise<{ cancelled: boolean }>` | Switch to a different session file |
| `ctx.reload()` | `reload(): Promise<void>` | Hot-reload extensions, skills, prompts, and themes |

`navigateTree` options: `{ summarize?, customInstructions?, replaceInstructions?, label? }`

---

## ToolDefinition

The object passed to `pi.registerTool()`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Tool name used in LLM tool calls |
| `label` | `string` | Yes | Human-readable label for UI |
| `description` | `string` | Yes | Description sent to LLM |
| `promptSnippet` | `string` | No | One-line snippet for the "Available tools" system prompt section |
| `promptGuidelines` | `string[]` | No | Guideline bullets appended to system prompt when tool is active |
| `parameters` | `TSchema` | Yes | Parameter schema (TypeBox) |
| `execute` | `(toolCallId, params, signal, onUpdate, ctx) => Promise<AgentToolResult>` | Yes | Tool execution function |
| `renderCall` | `(args, theme) => Component \| undefined` | No | Custom rendering for tool call display |
| `renderResult` | `(result, options, theme) => Component \| undefined` | No | Custom rendering for tool result display |

---

## ProviderConfig

Configuration for `pi.registerProvider()`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `authMode` | `"apiKey" \| "oauth" \| "externalCli" \| "none"` | No | Auth behavior. Defaults to `"apiKey"`. |
| `isReady` | `() => boolean` | No | Readiness check before auth checks |
| `baseUrl` | `string` | Conditional | API endpoint. Required when defining models. |
| `apiKey` | `string` | Conditional | API key or env var name. Required when defining models (unless OAuth). |
| `api` | `Api` | Conditional | API type (`"anthropic-messages"`, `"openai-responses"`, etc.). Required at provider or model level. |
| `streamSimple` | `(model, context, options?) => AssistantMessageEventStream` | No | Custom API stream handler |
| `headers` | `Record<string, string>` | No | Custom request headers |
| `authHeader` | `boolean` | No | If true, adds `Authorization: Bearer` header |
| `models` | `ProviderModelConfig[]` | No | Models to register. Replaces all existing models for this provider. |
| `oauth` | `OAuthConfig` | No | OAuth provider for `/login` support |

### ProviderModelConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Model ID (e.g., `"claude-sonnet-4-20250514"`) |
| `name` | `string` | Yes | Display name |
| `api` | `Api` | No | API type override for this model |
| `reasoning` | `boolean` | Yes | Whether the model supports extended thinking |
| `input` | `("text" \| "image")[]` | Yes | Supported input types |
| `cost` | `{ input, output, cacheRead, cacheWrite }` | Yes | Cost per token (can be 0) |
| `contextWindow` | `number` | Yes | Maximum context window in tokens |
| `maxTokens` | `number` | Yes | Maximum output tokens |
| `headers` | `Record<string, string>` | No | Custom headers for this model |
| `compat` | `Model["compat"]` | No | OpenAI compatibility settings |

---

## Lifecycle Events

All events are subscribed via `pi.on(eventName, handler)`. Handlers receive `(event, ctx: ExtensionContext)` unless noted otherwise.

### Session Events

| Event | Type | Return Type | Description |
|-------|------|-------------|-------------|
| `session_directory` | `SessionDirectoryEvent` | `SessionDirectoryResult` | Custom session directory resolution. **No `ctx` parameter** — receives only the event. |
| `session_start` | `SessionStartEvent` | — | Initial session load or reload |
| `session_before_switch` | `SessionBeforeSwitchEvent` | `SessionBeforeSwitchResult` | Before switching sessions. Return `{ cancel: true }` to block. |
| `session_switch` | `SessionSwitchEvent` | — | After switching sessions |
| `session_before_fork` | `SessionBeforeForkEvent` | `SessionBeforeForkResult` | Before forking. Can cancel or skip conversation restore. |
| `session_fork` | `SessionForkEvent` | — | After forking a session |
| `session_before_compact` | `SessionBeforeCompactEvent` | `SessionBeforeCompactResult` | Before compaction. Can cancel or provide custom compaction result. |
| `session_compact` | `SessionCompactEvent` | — | After compaction |
| `session_before_tree` | `SessionBeforeTreeEvent` | `SessionBeforeTreeResult` | Before tree navigation. Can cancel, provide summary, or supply custom instructions. |
| `session_tree` | `SessionTreeEvent` | — | After navigating to a different branch |
| `session_shutdown` | `SessionShutdownEvent` | — | Before process exit |

### Resource Events

| Event | Type | Return Type | Description |
|-------|------|-------------|-------------|
| `resources_discover` | `ResourcesDiscoverEvent` | `ResourcesDiscoverResult` | Provide additional skill, prompt, or theme paths. Fired after `session_start`. |

`ResourcesDiscoverResult`: `{ skillPaths?, promptPaths?, themePaths? }`

### Agent Events

| Event | Type | Return Type | Description |
|-------|------|-------------|-------------|
| `before_agent_start` | `BeforeAgentStartEvent` | `BeforeAgentStartEventResult` | After user submits prompt, before agent loop. Can inject system prompt or message. |
| `agent_start` | `AgentStartEvent` | — | Agent loop started |
| `agent_end` | `AgentEndEvent` | — | Agent loop ended. Includes `messages` array. |
| `turn_start` | `TurnStartEvent` | — | Start of each turn. Includes `turnIndex` and `timestamp`. |
| `turn_end` | `TurnEndEvent` | — | End of each turn. Includes `turnIndex`, `message`, and `toolResults`. |
| `context` | `ContextEvent` | `ContextEventResult` | Before each LLM call. Can modify `messages` array. |
| `before_provider_request` | `BeforeProviderRequestEvent` | `unknown` | Before provider request is sent. Can replace the payload. |

### Message Events

| Event | Type | Return Type | Description |
|-------|------|-------------|-------------|
| `message_start` | `MessageStartEvent` | — | A message started (user, assistant, or toolResult) |
| `message_update` | `MessageUpdateEvent` | — | Token-by-token streaming updates during assistant message |
| `message_end` | `MessageEndEvent` | — | A message ended |

### Tool Events

| Event | Type | Return Type | Description |
|-------|------|-------------|-------------|
| `tool_call` | `ToolCallEvent` | `ToolCallEventResult` | Before a tool executes. Return `{ block: true, reason? }` to block. |
| `tool_result` | `ToolResultEvent` | `ToolResultEventResult` | After a tool executes. Can modify `content`, `details`, or `isError`. |
| `tool_execution_start` | `ToolExecutionStartEvent` | — | Tool started executing |
| `tool_execution_update` | `ToolExecutionUpdateEvent` | — | Tool streaming/partial output |
| `tool_execution_end` | `ToolExecutionEndEvent` | — | Tool finished executing |

`ToolCallEvent` is a discriminated union by `toolName`. Use `isToolCallEventType()` and `isToolResultEventType()` type guards for narrowing:

```typescript
import { isToolCallEventType } from "@gsd/pi-coding-agent";

pi.on("tool_call", (event, ctx) => {
  if (isToolCallEventType("bash", event)) {
    event.input.command; // typed as string
  }
});
```

### Input Events

| Event | Type | Return Type | Description |
|-------|------|-------------|-------------|
| `input` | `InputEvent` | `InputEventResult` | User input received, before agent processing |
| `user_bash` | `UserBashEvent` | `UserBashEventResult` | User executed a `!` or `!!` bash command |
| `bash_transform` | `BashTransformEvent` | `BashTransformEventResult` | Before bash tool executes a command. Can transform the command string. |

`InputEventResult` is one of:
- `{ action: "continue" }` — pass through unchanged
- `{ action: "transform", text, images? }` — modify the input
- `{ action: "handled" }` — input was fully consumed by the handler

### Model Events

| Event | Type | Return Type | Description |
|-------|------|-------------|-------------|
| `model_select` | `ModelSelectEvent` | — | Model changed. Includes `model`, `previousModel`, and `source` (`"set"`, `"cycle"`, `"restore"`). |

---

## Type Guards

The SDK exports type guards for narrowing tool events by tool name:

```typescript
import { isToolCallEventType, isToolResultEventType } from "@gsd/pi-coding-agent";

// Built-in tools narrow automatically
if (isToolCallEventType("bash", event)) {
  event.input.command; // string
}

// Custom tools require explicit type parameters
if (isToolResultEventType<"my_tool", MyDetails>("my_tool", event)) {
  event.details; // MyDetails
}
```

---

## Key Types

| Type | Import | Description |
|------|--------|-------------|
| `ExtensionAPI` | `@gsd/pi-coding-agent` | The `pi` object |
| `ExtensionContext` | `@gsd/pi-coding-agent` | Context for event handlers |
| `ExtensionCommandContext` | `@gsd/pi-coding-agent` | Extended context for command handlers |
| `ExtensionUIContext` | `@gsd/pi-coding-agent` | UI methods on `ctx.ui` |
| `ToolDefinition` | `@gsd/pi-coding-agent` | Tool registration shape |
| `AgentToolResult` | `@gsd/pi-coding-agent` | Tool execution result |
| `ProviderConfig` | `@gsd/pi-coding-agent` | Provider registration config |
| `ExtensionFactory` | `@gsd/pi-coding-agent` | `(pi: ExtensionAPI) => void \| Promise<void>` |
| `ContextUsage` | `@gsd/pi-coding-agent` | `{ tokens, contextWindow, percent }` |
| `ThinkingLevel` | `@gsd/pi-agent-core` | `"off" \| "low" \| "medium" \| "high" \| "xhigh"` |
| `TSchema` | `@sinclair/typebox` | TypeBox schema type for tool parameters |
