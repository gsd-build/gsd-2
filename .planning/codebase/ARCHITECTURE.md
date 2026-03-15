# Architecture

**Analysis Date:** 2026-03-12

## Pattern Overview

**Overall:** Dual-surface, plugin-extended CLI agent + Web dashboard

The project has two independently deployable surfaces that share no runtime code:

1. **GSD CLI** (`src/`) — A Node.js CLI tool that wraps `@mariozechner/pi-coding-agent` (the "Pi" SDK) with GSD-specific extensions, commands, and resources. Users run `gsd` in a terminal. The agent operates interactively or in headless print/RPC modes.

2. **Mission Control** (`packages/mission-control/`) — A Bun-served React web UI that reads `.planning/` files from a project directory, streams Claude Code output, and displays live project state in a browser window. It is a separate application that runs alongside GSD (not required).

**Key Characteristics:**
- File-system as the single source of truth: both surfaces read/write `.gsd/` and `.planning/` markdown files
- Extension plugin model: GSD CLI loads extensions from `~/.gsd/agent/extensions/` via Pi SDK's `DefaultResourceLoader`
- WebSocket push model: Mission Control server watches `.planning/` for changes and pushes diffs to connected React clients
- No shared runtime module between CLI and Mission Control; they communicate only through the file system and by spawning child processes

## Layers

**CLI Bootstrap Layer:**
- Purpose: Set Pi SDK environment, initialize resources, launch interactive or print mode
- Location: `src/loader.ts`, `src/cli.ts`
- Contains: Environment variable setup, argument parsing, `InteractiveMode` / `runPrintMode` / `runRpcMode` invocation
- Depends on: `@mariozechner/pi-coding-agent`, `src/app-paths.ts`, `src/resource-loader.ts`, `src/wizard.ts`, `src/tool-bootstrap.ts`
- Used by: npm bin entry `gsd` / `gsd-cli` → `dist/loader.js`

**Resource Layer:**
- Purpose: Sync bundled extensions/agents/skills from package to `~/.gsd/agent/` on every launch
- Location: `src/resource-loader.ts`
- Contains: `initResources()` (cpSync from `src/resources/` to `~/.gsd/agent/`), `buildResourceLoader()`
- Depends on: Node `fs`, Pi `DefaultResourceLoader`
- Used by: `src/cli.ts` before creating any sessions

**GSD Extension Layer:**
- Purpose: All GSD-specific AI behaviors — commands (`/gsd`, `/worktree`), lifecycle hooks, auto-mode, state derivation
- Location: `src/resources/extensions/gsd/`
- Key files:
  - `index.ts` — extension entry point, registers commands/tools/hooks
  - `commands.ts` — `/gsd` command handler (next, auto, stop, status, queue, doctor, migrate, remote)
  - `auto.ts` — auto-mode state machine (fresh session per unit)
  - `state.ts` — `deriveState()` reads `.gsd/` files into typed `GSDState`
  - `paths.ts` — ID-based path resolution for `.gsd/milestones/M001/slices/S01/tasks/T01/`
  - `types.ts` — core type definitions (`GSDState`, `Roadmap`, `SlicePlan`, `Summary`, etc.)
  - `files.ts` — file I/O and markdown parsers
  - `prompt-loader.ts` — loads workflow prompts from `prompts/`
- Depends on: Pi SDK `ExtensionAPI`, Node `fs`
- Used by: Pi SDK extension loading via `~/.gsd/agent/extensions/gsd/index.ts`

**Supporting Extensions Layer:**
- Purpose: Auxiliary tools registered as Pi extensions
- Location: `src/resources/extensions/`
- Extensions: `bg-shell/`, `browser-tools/`, `context7/`, `search-the-web/`, `slash-commands/`, `subagent/`, `mac-tools/`, `ask-user-questions.ts`, `get-secrets-from-user.ts`
- Used by: Loaded by `DefaultResourceLoader` from `~/.gsd/agent/extensions/`

**Mission Control Server Layer:**
- Purpose: Bun HTTP + WebSocket server, file watcher, Claude Code process manager
- Location: `packages/mission-control/src/server.ts`, `packages/mission-control/src/server/`
- Key files:
  - `server.ts` — Bun.serve router: mounts REST API handlers, starts pipeline
  - `pipeline.ts` — orchestrates watcher → state deriver → differ → WebSocket broadcast + Claude process sessions
  - `state-deriver.ts` — `buildFullState()` parses `.planning/` files into `PlanningState`
  - `claude-process.ts` — `ClaudeProcessManager` spawns `claude -p` per message, streams NDJSON
  - `session-manager.ts` — multi-session lifecycle (create, close, rename, fork, worktree-aware close)
  - `ws-server.ts` — WebSocket server, fan-out chat events and state diffs
  - `differ.ts` — `computeDiff()` for full vs. partial state pushes
  - `watcher.ts` — `createFileWatcher()` with debounce on `.planning/`
- Depends on: Bun runtime, `gray-matter`, `node:child_process`
- Used by: `bun run packages/mission-control/src/server.ts`

**Mission Control REST API Handlers:**
- Purpose: Thin handlers for filesystem, dialogs, git, projects, settings, assets, session, proxy
- Location: `packages/mission-control/src/server/`
- Files: `fs-api.ts`, `dialog-api.ts`, `git-api.ts`, `recent-projects.ts`, `settings-api.ts`, `assets-api.ts`, `session-status-api.ts`, `proxy-api.ts`
- Routes prefix: `/api/fs/`, `/api/dialog/`, `/api/git/`, `/api/projects/`, `/api/settings`, `/api/session/`, `/api/assets/`, `/api/preview/`, `/api/project/switch`

**Mission Control React Layer:**
- Purpose: Browser UI — sidebar navigation, chat panel, milestone/slice/task views, session tabs
- Location: `packages/mission-control/src/`
- Key files:
  - `App.tsx` — root component, renders `<AppShell />`
  - `frontend.tsx` — Bun bundled entry point
  - `components/layout/AppShell.tsx` — top-level layout, session flow routing (initializing → onboarding → dashboard)
  - `components/layout/Sidebar.tsx` — collapsible nav with project browser
  - `components/layout/SingleColumnView.tsx` — routes `activeView` to view components
  - `components/views/` — feature views (ChatView, MilestoneView, SliceView, HistoryView, etc.)
  - `hooks/` — all data hooks (usePlanningState, useSessionManager, useChatMode, usePreview, etc.)
- Depends on: React 19, Tailwind CSS 4, `lucide-react`, `cmdk`

**Mission Control Hook Layer:**
- Purpose: Encapsulate all WebSocket and API communication; React components are purely presentational
- Location: `packages/mission-control/src/hooks/`
- Key hooks:
  - `usePlanningState.ts` — subscribes to WS `:4001`, applies full/diff updates to `PlanningState`
  - `useSessionManager.ts` — multi-session create/close/rename/select, routes chat messages by `sessionId`
  - `useChatMode.tsx` — discuss/review mode detection from streamed mode tags
  - `useReconnectingWebSocket.ts` — shared WS transport with exponential backoff
  - `useSessionFlow.ts` — initializing/onboarding/resume/dashboard session state machine
  - `usePreview.ts` — live preview panel open/close, port detection

## Data Flow

**GSD Auto-Mode Execution Flow:**

1. User runs `/gsd auto` in terminal
2. `commands.ts` calls `startAuto()` in `auto.ts`
3. `auto.ts` calls `deriveState(process.cwd())` → reads `.gsd/` files → returns `GSDState`
4. Based on `GSDState.phase`, auto selects prompt template from `prompts/` via `loadPrompt()`
5. `pi.sendMessage()` injects prompt into a fresh session created via `ctx.newSession()`
6. LLM executes, writes output files back to `.gsd/milestones/.../`
7. `agent_end` hook fires → `handleAgentEnd()` loops back to step 3

**Mission Control File-to-State Push Flow:**

1. File watcher (`watcher.ts`) detects change in `.planning/` with 50ms debounce
2. `pipeline.ts` calls `buildFullState(planningDir)` → `state-deriver.ts` parses all markdown
3. `computeDiff(currentState, newState)` produces minimal diff or full state
4. `wsServer.broadcast(diff)` pushes JSON to all connected browser clients
5. `usePlanningState` hook in browser applies diff to React state → components re-render
6. Reconciliation interval (every 5s) runs independent full rebuild to catch missed events

**Chat Message Flow (Mission Control):**

1. User types message in `ChatPanel` → `sendMessage(prompt, sessionId)` via `useSessionManager`
2. WebSocket message `{type: "chat", prompt, sessionId}` sent to `ws-server.ts`
3. `pipeline.ts` routes to session's `ClaudeProcessManager.sendMessage()`
4. `ClaudeProcessManager` spawns `claude -p "<prompt>" --output-format stream-json` as child process
5. NDJSON stream parsed by `ndjson-parser.ts`, emitted as `StreamEvent`s
6. `mode-interceptor.ts` strips inline mode tags (`<discuss>`, `<review>`, `<dev_server:PORT>`)
7. Events forwarded via WebSocket to the session's `activeClient` in the browser
8. React `useChatMode` hook interprets mode events, `usePlanningState` picks up file writes

**State Management:**
- GSD CLI: stateless across sessions; all state is on disk in `.gsd/`. In-process auto-mode state held in module-level variables in `auto.ts`
- Mission Control server: in-memory `currentState: PlanningState` kept in `pipeline.ts` closure; authoritative source is always rebuilt from disk
- Mission Control browser: React state in hooks; `usePlanningState` sequence number prevents stale updates

## Key Abstractions

**GSDState (CLI):**
- Purpose: Derived representation of current project progress read from `.gsd/` files
- Location: `src/resources/extensions/gsd/types.ts`, derived by `src/resources/extensions/gsd/state.ts`
- Fields: `activeMilestone`, `activeSlice`, `activeTask`, `phase`, `registry`, `progress`
- Pattern: Pure derivation — always computed from disk, never persisted as a typed object

**PlanningState (Mission Control):**
- Purpose: Structured view of `.planning/` content for the browser
- Location: `packages/mission-control/src/server/types.ts`
- Fields: `state` (STATE.md), `roadmap` (ROADMAP.md), `config` (config.json), `phases` (PLAN.md files), `requirements`
- Pattern: Built by `buildFullState()`, pushed via WebSocket as full replace or diff

**File Path System (.gsd/ hierarchy):**
- Purpose: Canonical ID-based addressing for all planning artifacts
- Location: `src/resources/extensions/gsd/paths.ts`
- Pattern: `<basePath>/.gsd/milestones/<M001>/slices/<S01>/tasks/<T01>-PLAN.md`
- Resolvers handle both bare-ID convention and legacy descriptor-suffixed names

**Extension Entry Point:**
- Purpose: All GSD behaviors registered with Pi SDK in a single `default export function(pi: ExtensionAPI)`
- Location: `src/resources/extensions/gsd/index.ts`
- Pattern: `pi.registerCommand()`, `pi.registerTool()`, `pi.registerShortcut()`, `pi.on(event, handler)`

**SessionManager (Mission Control):**
- Purpose: Multi-session lifecycle; each session has its own `ClaudeProcessManager` and `activeClient` WebSocket
- Location: `packages/mission-control/src/server/session-manager.ts`
- Pattern: Map of `SessionState` keyed by UUID; sessions support worktree-aware close with merge/keep/delete

## Entry Points

**GSD CLI:**
- Location: `dist/loader.js` (compiled from `src/loader.ts`)
- Triggers: `gsd` / `gsd-cli` bin invocation
- Responsibilities: Set env vars, sync resources to `~/.gsd/agent/`, run wizard, launch Pi interactive or print/RPC mode

**Mission Control Dev Server:**
- Location: `packages/mission-control/src/server.ts`
- Triggers: `bun run src/server.ts` (via `npm run mc:dev` from root)
- Responsibilities: Start pipeline on port 4001 (WebSocket) and 4000 (HTTP/React app)

**GSD Extension:**
- Location: `src/resources/extensions/gsd/index.ts` (synced to `~/.gsd/agent/extensions/gsd/index.ts`)
- Triggers: Pi SDK extension loading during `resourceLoader.reload()`
- Responsibilities: Register `/gsd` command, `/worktree` command, lifecycle hooks, dynamic tool wrappers

## Error Handling

**Strategy:** Defensive — all file reads wrapped in try/catch returning null/default; extension errors logged but non-fatal

**Patterns:**
- `loadFile()` in `files.ts` returns `null` on missing files; callers check before parsing
- `buildFullState()` in `state-deriver.ts` returns default state objects when files are missing or unparseable
- `ClaudeProcessManager` emits `result` event with `error` field on non-zero exit; pipeline forwards as `chat_error` to WebSocket client
- Extension load errors in `cli.ts` are logged to stderr but do not prevent startup
- Pipeline reconciliation interval catches drift silently and broadcasts corrected state

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` with `[pipeline]` / `[gsd]` prefixes; no structured logging library
**Validation:** GSD extension uses `observability-validator.ts` to validate plan/execute/complete boundary transitions during auto-mode
**Authentication:** Pi SDK `AuthStorage` manages API keys; `wizard.ts` prompts on first run; keys stored in `~/.gsd/agent/auth.json`

---

*Architecture analysis: 2026-03-12*
