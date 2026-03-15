# External Integrations

**Analysis Date:** 2026-03-12

## APIs & External Services

**AI / LLM:**
- Claude Code CLI (`claude` binary) - Core AI integration. GSD spawns it as a child process per user message using `node:child_process.spawn`. Communicates via `--output-format stream-json --verbose --include-partial-messages`. Session continuity via `--resume <sessionId>`.
  - Client: `ClaudeProcessManager` at `packages/mission-control/src/server/claude-process.ts`
  - Auth: Claude Code's own auth (managed by the `claude` CLI, not by GSD)
  - Key env concern: `CLAUDECODE` env var is explicitly deleted before spawning to prevent "nested session" rejection

**Documentation Lookup:**
- Context7 API (`https://api.context7.com`) - Fetches library documentation on demand
  - SDK: Native `fetch` in `src/resources/extensions/context7/index.ts`
  - Auth: `CONTEXT7_API_KEY` env var (optional; increases rate limits)
  - Endpoints used: `GET /api/v2/libs/search?libraryName=&query=` and `GET /api/v2/context?libraryId=&query=&tokens=`

**Web Search:**
- Tavily Search API (`https://api.tavily.com/search`) - Web search for agent research tasks
  - SDK: Native `fetch` in `src/resources/extensions/search-the-web/tavily.ts`
  - Auth: `TAVILY_API_KEY` env var (required for search functionality)
  - Used by: `src/resources/extensions/search-the-web/tool-search.ts`

## Data Storage

**Databases:**
- None. No database is used.

**File-based storage (primary data layer):**
- `.planning/` directory tree within each project — the canonical state store for GSD
  - Markdown files with YAML front-matter parsed by `gray-matter`
  - Watched by `packages/mission-control/src/server/watcher.ts` for live updates
  - Derived into `PlanningState` by `packages/mission-control/src/server/state-deriver.ts`
- `~/.gsd/defaults.json` - Global user settings
- `~/.gsd/agent/` - Agent runtime files (synced from `src/resources/` at postinstall)
- `.planning/config.json` - Per-project settings

**Session Persistence:**
- Session metadata stored under `.planning/` by `SessionManager`
  - `packages/mission-control/src/server/session-manager.ts`
  - `packages/mission-control/src/server/session-persistence-api.ts`

**File Storage:**
- Local filesystem only. No cloud storage.

**Caching:**
- In-memory only. Context7 search results and doc pages are cached in-session memory (see `src/resources/extensions/context7/index.ts`). No persistent cache layer.

## Authentication & Identity

**Auth Provider:**
- No auth provider. Mission Control is a local-only tool running on `localhost:4000`.
- Claude authentication is handled entirely by the `claude` CLI — GSD does not manage API keys for Anthropic.
- Context7 and Tavily use API keys passed as environment variables.

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry, Datadog, or equivalent.

**Logs:**
- `console.log` / `console.error` to stdout/stderr throughout server code
- Prefixed by module: `[pipeline]`, `[claude-process]`, `[git-api]`, `[worktree-api]`, etc.
- No structured logging framework

## CI/CD & Deployment

**Hosting:**
- npm registry — `gsd-pi` package published publicly

**CI Pipeline:**
- GitHub Actions at `.github/workflows/publish.yml`
- Triggers on git tags matching `v*`
- Steps: checkout → Node.js 22 setup → `npm ci` → `npm run build` → `npm publish --access public`
- Auth: `NPM_TOKEN` GitHub secret

## Webhooks & Callbacks

**Incoming:**
- None. No external webhook endpoints.

**Outgoing:**
- None. GSD does not push to external webhooks.

## Inter-Process Communication

**WebSocket Server (internal):**
- Bun WebSocket server on port 4001 — `packages/mission-control/src/server/ws-server.ts`
- Clients: React frontend connects via `useReconnectingWebSocket` hook at `packages/mission-control/src/hooks/useReconnectingWebSocket.ts`
- Topics: `planning-state` (file state diffs), `chat` (Claude streaming events + session updates)
- Protocol: JSON messages with `type` discriminant (`full`, `diff`, `chat_event`, `chat_complete`, `session_update`, `project_switched`, `preview_open`, etc.)

**HTTP API Server (internal):**
- Bun HTTP server on port 4000 — `packages/mission-control/src/server.ts`
- Routes:
  - `GET /` — serves SPA HTML
  - `GET|POST /api/fs/*` — file system read/write operations
  - `GET /api/dialog/*` — native OS folder picker (PowerShell on Windows, zenity on Linux)
  - `GET /api/git/log` — git commit history
  - `GET|PUT /api/settings` — two-tier settings (global + project)
  - `GET|POST /api/projects/*` — recent projects list
  - `GET /api/session/*` — session status
  - `GET /api/assets/*` — project asset files
  - `GET /api/preview/*` — fetch-forwarding proxy to project's local dev server

**Dev Server Proxy:**
- `packages/mission-control/src/server/proxy-api.ts` — forwards `/api/preview/*` to `http://localhost:<detectedPort>` stripping `X-Frame-Options` and `Content-Security-Policy` headers to allow iframe embedding

## Native OS Integration

**Folder Picker Dialog:**
- Windows: PowerShell script via `spawn("powershell", [...])`
- Linux: `spawn("zenity", ["--file-selection", "--directory"])`
- Implemented in `packages/mission-control/src/server/dialog-api.ts`

**Git CLI:**
- All git operations use `spawn("git", args, { shell: false })` via Node's `child_process`
- Operations: `git log`, `git worktree add/remove/list`, `git branch -m`, `git branch -D`
- Implemented in `packages/mission-control/src/server/git-api.ts` and `packages/mission-control/src/server/worktree-api.ts`

**Browser Automation (agent extension):**
- Playwright (headless/headed Chromium) for UI verification during agent sessions
- Implemented in `src/resources/extensions/browser-tools/index.ts`
- Shares a single `Browser + BrowserContext + Page` per agent session

---

*Integration audit: 2026-03-12*
