# External Integrations

**Analysis Date:** 2026-03-10

## APIs & External Services

**Claude Code CLI:**
- Primary integration - Mission Control spawns Claude Code as a child process
- Binary: `claude` (must be on PATH)
- Invocation: `claude -p "<prompt>" --output-format stream-json --verbose --include-partial-messages`
- Session continuity: `--resume <sessionId>` flag for multi-turn conversations
- Implementation: `packages/mission-control/src/server/claude-process.ts` (ClaudeProcessManager class)
- Uses Node.js `child_process.spawn` (not Bun.spawn) for Windows compatibility
- Streams NDJSON events parsed by `packages/mission-control/src/server/ndjson-parser.ts`
- CLAUDECODE env var is stripped to avoid "nested session" rejection

**Brave Web Search API:**
- Optional integration for web search capability
- Endpoint: `https://api.search.brave.com/res/v1/web/search`
- Auth: `X-Subscription-Token` header with API key
- API key sources: `BRAVE_API_KEY` env var or `~/.gsd/brave_api_key` file
- Implementation: `get-shit-done/bin/lib/commands.cjs` (cmdWebsearch function)
- Graceful degradation: returns `{ available: false }` when key is not set
- Options: `--limit N`, `--freshness day|week|month`

**AI Runtime Targets (Installer):**
- Claude Code - Primary target (`~/.claude/commands/`)
- OpenCode - Secondary target
- Gemini CLI - Secondary target
- Codex CLI - Secondary target (with TOML config for sandbox permissions)
- Implementation: `bin/install.js` (installs GSD slash commands into each runtime)

## Data Storage

**Databases:**
- None - All state is file-based

**File Storage (`.planning/` directory):**
- `STATE.md` - Project state with YAML frontmatter (parsed by `gray-matter`)
- `ROADMAP.md` - Phase checklist in markdown format
- `REQUIREMENTS.md` - Requirement checklist in markdown format
- `config.json` - Project configuration (model profiles, workflow toggles, branching strategy)
- `phases/<NN>-<name>/` - Phase directories containing PLAN.md, SUMMARY.md, VERIFICATION.md files
- State deriver: `packages/mission-control/src/server/state-deriver.ts`

**User Data (`~/.gsd/`):**
- `recent-projects.json` - Last 20 opened projects (managed by `packages/mission-control/src/server/recent-projects.ts`)
- `brave_api_key` - Optional Brave Search API key file
- `last-update-check.json` - Update check timestamp (managed by `hooks/gsd-check-update.js`)

**Caching:**
- None - State is rebuilt from files on every change via the pipeline

## Authentication & Identity

**Auth Provider:**
- Not applicable - Mission Control is a local-only development tool
- No user authentication or identity management
- Claude Code CLI handles its own authentication with Anthropic's API

**API Security:**
- File system API validates paths against traversal attacks (`packages/mission-control/src/server/fs-api.ts`, `validatePath()`)
- CORS headers set to `*` (local development only)
- No API keys or tokens for the Mission Control server itself

## Monitoring & Observability

**Error Tracking:**
- None - Console.error logging only

**Logs:**
- `console.log` / `console.error` with `[module-name]` prefixes
- Prefixes used: `[pipeline]`, `[claude-process]`, `[ws-server]`, `[watcher]`
- Claude process logs first 5 stdout chunks for debugging

**Context Monitoring:**
- `hooks/gsd-context-monitor.js` - Tracks Claude Code context window usage
- Writes monitoring data to `~/.gsd/` directory

## CI/CD & Deployment

**Hosting:**
- Local development tool only - runs on developer machines
- Mission Control: HTTP on port 4000, WebSocket on port 4001

**CI Pipeline:**
- Not detected in repository

**Distribution:**
- npm package: `get-shit-done-cc`
- `npm run prepublishOnly` triggers `build:hooks` before publish
- Published files: `bin/`, `commands/`, `get-shit-done/`, `agents/`, `hooks/dist/`, `scripts/`

## Environment Configuration

**Required env vars:**
- None strictly required for core functionality

**Optional env vars:**
- `BRAVE_API_KEY` - Enables Brave web search integration
- `CLAUDECODE` - Stripped by ClaudeProcessManager to prevent nested session detection

**Config files (not secrets):**
- `.planning/config.json` - Per-project GSD configuration
- `~/.gsd/brave_api_key` - Alternative to BRAVE_API_KEY env var
- `~/.gsd/recent-projects.json` - Recent project list

## WebSocket Protocol

**Server:** `packages/mission-control/src/server/ws-server.ts`
- Port: 4001
- Topics: `planning-state` (state updates), `chat` (Claude chat events)

**Client -> Server Messages:**
- `"refresh"` (string) - Request full state resend
- `{ type: "chat", prompt: "..." }` (JSON) - Send chat message to Claude

**Server -> Client Messages:**
- `{ type: "full", state: PlanningState, sequence, timestamp }` - Full state (on connect or refresh)
- `{ type: "diff", changes: Partial<PlanningState>, sequence, timestamp }` - Incremental state update
- `{ type: "custom_commands", commands: [...] }` - Slash command autocomplete data
- `{ type: "chat_event", event: StreamEvent }` - Streaming Claude response chunk
- `{ type: "chat_complete", sessionId? }` - Claude turn complete
- `{ type: "chat_error", error: string }` - Chat error

## REST API Endpoints

**File System API (`packages/mission-control/src/server/fs-api.ts`):**
- `GET /api/fs/list?path=X` - List directory contents with GSD project detection
- `GET /api/fs/detect-project?path=X` - Check if directory is a GSD project
- `POST /api/fs/mkdir` - Create directory (recursive)

**Project Management (`packages/mission-control/src/server/recent-projects.ts`):**
- `GET /api/projects/recent` - Get recent projects list
- `POST /api/projects/recent` - Add/update recent project entry

**Pipeline Control (`packages/mission-control/src/server.ts`):**
- `POST /api/project/switch` - Switch to different project directory (with guard against concurrent switches)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

---

*Integration audit: 2026-03-10*
