<!-- GSD:project-start source:PROJECT.md -->
## Project

**GSD Web Remote Access**

Enhancing the GSD web UI (`gsd --web`) to be the primary interaction method over Tailscale. Adds password authentication with persistent cookie sessions, full event replay on reconnect, and Tailscale Serve integration for secure HTTPS access within the tailnet. This is a brownfield feature addition to the existing GSD web UI, not a new application.

**Core Value:** Agent workflows run uninterrupted when the browser is closed — reconnect anytime from any device on the tailnet, see everything that happened, and pick up where you left off.

### Constraints

- **Tailscale Free Plan**: Must use `tailscale serve` only, not Funnel (paid feature)
- **No External Dependencies for Crypto**: Use `node:crypto` (scrypt, HMAC-SHA256), not bcrypt or external packages
- **Backward Compatibility**: Localhost `gsd --web` must work exactly as today — cookie auth is additive
- **No Auto-Confirm**: Password change invalidates all sessions (secret rotation)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.4.0+ - Main language for all core packages and extensions
- JavaScript - Build scripts and some dev utilities
- React 19.2.4 - Web frontend components
- Rust - Native bindings for cross-platform compilation (packages/native)
- Shell - Docker and deployment scripts
## Runtime
- Node.js 22.0.0+ (required in `engines` field at `/Users/mustermann/Documents/coding/gsd-2/package.json`)
- Electron 41.0.3 - Desktop Studio application runtime
- Chromium - Headless browser via Playwright for automation
- npm 10.9.3 (locked and required)
- Lockfile: `package-lock.json` present (monorepo lock)
## Frameworks
- @modelcontextprotocol/sdk 1.27.1 - MCP (Model Context Protocol) server for tool exposure
- @anthropic-ai/claude-agent-sdk 0.2.83 - Claude Agent framework (optional dependency)
- Next.js 16.1.6 - React server framework (`web/` workspace)
- Tailwind CSS 4.2.0 - Utility CSS framework
- React Hook Form 7.54.1 - Form state management
- electron-vite 5.0.0 - Electron build tool
- Electron 41.0.3 - Desktop runtime
- esbuild 0.25.12 - Fast JavaScript bundler
- TypeScript 5.4.0 - Transpilation and type checking
- tsc (TypeScript Compiler) - Main build tool
- Node.js built-in test runner (via `--test` flag)
- c8 11.0.0 - Code coverage reporter
## Key Dependencies
- **@anthropic-ai/sdk** 0.73.0 - Anthropic Claude API client
- **openai** 6.26.0 - OpenAI API client
- **@google/genai** 1.40.0 - Google Generative AI client
- **@mistralai/mistralai** 1.14.1 - Mistral AI API client
- **@aws-sdk/client-bedrock-runtime** 3.983.0 - AWS Bedrock LLM provider
- **@anthropic-ai/vertex-sdk** 0.14.4 - Google Vertex AI integration
- **playwright** 1.58.2 - Headless browser automation (used by browser-tools extension)
- **marked** 15.0.12 - Markdown parsing and rendering
- **yaml** 2.8.2 - YAML parsing/serialization
- **ajv** 8.17.1 - JSON Schema validation
- **zod-to-json-schema** 3.24.6 - Convert Zod schemas to JSON Schema
- **sharp** 0.34.5 - Image processing
- **sql.js** 1.14.1 - SQLite in WebAssembly (in-memory database)
- **undici** 7.24.2 - Modern HTTP client
- **proxy-agent** 6.5.0 - HTTP proxy support
- **@octokit/rest** 22.0.1 - GitHub API client (for GitHub Sync extension)
- **@radix-ui** - Complete set of headless UI primitives (accordion, dialog, select, etc.)
- **lucide-react** 0.564.0 - Icon library
- **recharts** 2.15.0 - React charting library
- **@xterm/xterm** 6.0.0 - Terminal emulator (xterm.js)
- **@uiw/react-codemirror** 4.25.8 - Code editor with syntax highlighting
- **motion** 12.36.0 - Animation library
- **@clack/prompts** 1.1.0 - Interactive CLI prompts
- **chalk** 5.6.2 - Terminal color output
- **picocolors** 1.1.1 - Lightweight color utility
- **chokidar** 5.0.0 - File system watcher
- **glob** 13.0.1 - File globbing
- **extract-zip** 2.0.1 - ZIP extraction
- **file-type** 21.1.1 - Detect file types
- **mime-types** 3.0.1 - MIME type utilities
- **diff** 8.0.2 - Text diffing
- **strip-ansi** 7.1.0 - Remove ANSI color codes
- **@sinclair/typebox** 0.34.41 - JSON Schema builder and validator
- **ajv-formats** 3.0.1 - Additional JSON Schema formats
- **zod** 3.24.1 - TypeScript-first schema validation (web)
## Configuration
- Configuration stored via environment variables (process.env)
- Sensitive keys read from environment (ANTHROPIC_API_KEY, OPENAI_API_KEY, GITHUB_TOKEN, etc.)
- .env files supported but not committed (listed in .gitignore)
- Configuration bootstrapped via extension system
- `tsconfig.json` - Root TypeScript configuration (target: ES2022, strict mode)
- `tsconfig.extensions.json` - Separate config for resource extensions
- Workspace-specific `tsconfig.json` files in each package
- `.eslintrc` - Linting configuration (web)
- `.prettierrc` - Code formatting (implicit, may be in web/)
- `next.config.js` - Next.js configuration (if present)
- `electron-vite.config.ts` - Desktop build config
- `ANTHROPIC_API_KEY` - Claude API authentication
- `OPENAI_API_KEY` - OpenAI API authentication
- `ANTHROPIC_VERTEX_PROJECT_ID` - Google Vertex AI project
- `GITHUB_TOKEN` - GitHub API authentication
- `GSD_*` - Internal GSD configuration
- `NANOCLAW_GROUP_FOLDER` - NanoClaw container context (IPC)
## Platform Requirements
- Node.js 22.0.0+
- npm 10.9.3
- TypeScript knowledge
- Playwright/browser support (Linux requires headless-compatible setup)
- Node.js 22.0.0+
- Docker deployment supported (see Dockerfile)
- Linux, macOS, Windows support via native platform packages
- Browser automation requires Chromium/headless browser capability
- Linux x64 GNU (glibc)
- Linux ARM64 GNU
- macOS x64
- macOS ARM64 (Apple Silicon)
- Windows x64 MSVC
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- TypeScript files: `.ts` extension
- Test files: `{name}.test.ts` or `{name}.test.mjs` (co-located or in tests/ subdirectories)
- Service modules: `{feature}-service.ts` (e.g., `hooks-service.ts`, `web-auth-storage.ts`, `bridge-service.ts`)
- Utilities: `{feature}.ts` (e.g., `extension-registry.ts`, `app-paths.ts`)
- Type files: `*-types.ts` (e.g., `headless-types.ts`)
- Use camelCase exclusively: `loadRegistry()`, `saveRegistry()`, `isExtensionEnabled()`
- Private functions (not exported) still use camelCase: `isRegistry()`, `defaultRegistry()`
- Async functions follow same pattern: `collectHooksData()`, `initTokenCounter()`
- Predicate functions use `is` prefix: `isExtensionEnabled()`, `isRegistry()`, `isManifest()`
- Factory/builder functions use `create` or explicit verb: `createEmptyMapping()`, `createAsyncBashTool()`
- Type guards use `is{TypeName}`: `isRegistry(data: unknown): data is ExtensionRegistry`
- Use camelCase: `tmpDir`, `authPath`, `projectCwd`
- Constants use UPPER_SNAKE_CASE: `HOOKS_MAX_BUFFER`, `HOOKS_MODULE_ENV`, `VALID_OUTPUT_FORMATS`
- Type parameters use PascalCase: `ExtensionRegistry`, `HooksData`, `SyncMapping`
- Interfaces use PascalCase with no prefix: `ExtensionRegistry`, `ExtensionManifest`, `HooksData`
- Type aliases use PascalCase: `OutputFormat` (defined as discriminated union)
- Discriminated unions use string literal type unions: `type OutputFormat = 'text' | 'json' | 'stream-json'`
## Code Style
- No formatter enforced at root (ESLint in web/ uses Next.js ESLint config)
- Indentation: 2 spaces (observed in all source files)
- Line length: practical limit around 100-120 characters (varies by context)
- Semicolons: always included at end of statements
- Root and most packages: No centralized ESLint config
- `web/` package: ESLint with Next.js core-web-vitals and TypeScript config
- TypeScript strict mode enabled: `strict: true` in all tsconfig.json files
- No null unless necessary; use `undefined` where appropriate
- Comments use ASCII separators for section headers:
- Blank lines between logical sections
## Import Organization
- Not used in main codebase; relative imports preferred
- Workspace packages use `@gsd/` scope (monorepo convention)
## Error Handling
- Use try-catch with graceful fallback to defaults:
- For file I/O failures, return null or empty object rather than throwing:
- Type guards validate before casting:
- For subprocess/external command errors, propagate with context:
## Logging
- No consistent logging strategy; each module handles logging independently
- Process output handled via stdout/stderr
- Child processes use error handling with message propagation
## Comments
- Explain non-obvious algorithmic choices
- Document regression tests with issue numbers
- Mark sections with ASCII headers for long modules
- JSDoc for public API functions (file I/O, service exports)
- Used minimally; TypeScript types serve as documentation
- Example:
- Regression test comments include issue numbers:
## Function Design
- Prefer explicit parameters over options objects for <3 params
- Use options object for optional/configuration parameters:
- Type all parameters and return values explicitly
- Async functions return Promise<T>
- Functions returning data use null for "not found" rather than throwing:
- Mutation functions typically return void or error string:
## Module Design
- Grouped by concern: types first, then queries, then mutations
- Section headers separate logical groupings in larger files
- Example from `extension-registry.ts`:
- Not extensively used; prefer explicit imports
- Example: `mod.ts` aggregates shared utility exports:
## Type Safety
- All parameters and returns typed explicitly
- TypeScript strict mode enabled (`"strict": true`)
- Type guards used for runtime validation of external/parsed data
- Use `Record<string, T>` for object maps rather than generic objects
- Discriminated unions preferred: `type OutputFormat = 'text' | 'json' | 'stream-json'`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Monorepo with workspace packages for core functionality
- Headless orchestration pattern for non-interactive execution
- Plugin-based extension system for capabilities
- Session-based state management across multiple modes (interactive, RPC, web)
- Modular resource loading with bundled extensions and skills
- Async-first with event-driven command handling
## Layers
- Purpose: Entry point and argument parsing
- Location: `src/loader.ts`, `src/cli.ts`
- Contains: Environment setup, version checks, mode routing (interactive, headless, web, RPC)
- Depends on: Node runtime, child_process, file system
- Used by: All entry points; spawned by users
- Purpose: Non-interactive command execution with auto-answering and progress streaming
- Location: `src/headless.ts`, `src/headless-answers.ts`, `src/headless-context.ts`, `src/headless-events.ts`, `src/headless-ui.ts`, `src/headless-query.ts`, `src/headless-types.ts`
- Contains: RPC client management, answer injection, event filtering, output formatting, exit code mapping, UI request handling
- Depends on: RpcClient from pi-coding-agent, session management, extension UI request handlers
- Used by: CLI layer for `--print` and `headless` subcommands
- Purpose: Persist and resolve user sessions across invocations
- Location: `src/app-paths.ts`, `src/project-sessions.ts`
- Contains: Directory resolution (~/.gsd/agent/), session ID mapping, project-level sessions
- Depends on: File system, paths
- Used by: CLI layer, resource loader, headless orchestrator
- Purpose: Discover, validate, and sync bundled extensions to agent directory
- Location: `src/resource-loader.ts`, `src/extension-discovery.ts`, `src/extension-registry.ts`, `src/bundled-resource-path.ts`
- Contains: Extension manifest parsing, registry loading, version checking, file synchronization
- Depends on: File system, crypto (for content hashing), semver comparison
- Used by: Loader.ts during startup, agent initialization
- Purpose: Pluggable capabilities that extend GSD functionality
- Location: `src/resources/extensions/{extension-name}/index.ts`
- Contains: 20+ extensions including gsd (core commands), browser-tools, mcp-client, voice, github-sync, etc.
- Depends on: Pi coding agent SDK, shared utilities, external APIs (GitHub, Google, etc.)
- Used by: Agent runtime to load and execute capabilities
- Purpose: Core orchestration, state management, workflow templating
- Location: `src/resources/extensions/gsd/`
- Contains: Auto-mode, command handlers, skill catalog, database, workflow engine, preferences
- Key files:
- Depends on: SQLite, skill definitions, workflow templates
- Used by: Agent runtime for all GSD commands
- Purpose: Domain-specific AI prompts and templates
- Location: `src/resources/skills/{skill-name}/`
- Contains: 20+ skill directories (accessibility, frontend-design, review, test, lint, etc.)
- Structure: README.md + domain-specific guidance
- Used by: GSD extension via skill-catalog.ts
- Purpose: Custom tool definitions for agent interaction
- Location: `src/resources/extensions/gsd/tools/`
- Contains: Tool schemas and handlers
- Used by: Auto-mode and guided-flow for structured interactions
- Purpose: Common utilities across extensions
- Location: `src/resources/extensions/shared/`
- Contains: Shared test helpers, validation utilities
- Purpose: Browser-based interface with real-time terminal emulation
- Location: `web/` (Next.js 14+ app), `src/web/` (backend bridge)
- Contains: React components, web API endpoints, TUI bridge, responsive layout
- Used by: `gsd --web` mode
- `@gsd/pi-coding-agent` - Core agent runtime from PI SDK fork
- `@gsd/pi-agent-core` - PI SDK core functionality
- `@gsd/pi-ai` - AI provider integration
- `@gsd/pi-tui` - Terminal UI framework
- `@gsd/native` - Native binary wrappers (git, fs operations)
- `rpc-client` - RPC protocol implementation
- `daemon` - Daemon mode (experimental)
- `mcp-server` - Model Context Protocol server
## Data Flow
## Key Abstractions
- Purpose: Represents a user's ongoing work in a project
- Files: `src/app-paths.ts`, `src/project-sessions.ts`
- Pattern: UUID-based, stored in ~/.gsd/sessions/{id}/, persisted to gsd-db.ts
- Example: One session per `gsd auto` invocation
- Purpose: Declares a plugin's capabilities, version, dependencies
- Files: `src/resources/extensions/{name}/extension-manifest.json`
- Pattern: JSON schema with id, version, exports, capabilities
- Example: `gsd` extension manifests its `/gsd` command family
- Purpose: Models task lifecycle through defined states
- Files: `src/resources/extensions/gsd/types.ts`, `src/resources/extensions/gsd/state.ts`
- States: idle → milestone-ready → auto-running → awaiting-user → complete/blocked
- Example: State transitions tracked in gsd-db for recovery
- Purpose: Reusable multi-step instructions for common patterns
- Files: `src/resources/extensions/gsd/workflow-templates/`, `src/resources/extensions/gsd/templates/`
- Pattern: Markdown with special directives, loaded into prompt context
- Example: Feature development, bug fix, code review templates
- Purpose: Domain-specific AI guidance baked into prompts
- Files: `src/resources/skills/{skill-name}/README.md`
- Pattern: Skill modules auto-discovered and embedded in system prompt
- Example: react-best-practices, lint, frontend-design
- Purpose: Structured interface for agent → system actions
- Files: `src/resources/extensions/gsd/tools/{tool-name}.ts`
- Pattern: JSON schema + implementation function
- Example: `fs-read`, `git-log`, `browser-screenshot`
## Entry Points
- Location: `src/loader.ts` → `src/cli.ts` → `@gsd/pi-coding-agent` InteractiveMode
- Triggers: `gsd "task"` with no special flags
- Responsibilities: TUI rendering, real-time user interaction, session management
- Location: `src/loader.ts` → `src/headless.ts`
- Triggers: `gsd headless [command]` or `gsd --print [command]`
- Responsibilities: Spawn child RPC process, auto-answer UI requests, stream JSON output, map exit codes
- Location: `src/cli.ts` → `src/web-mode.ts` → `web/` (Next.js)
- Triggers: `gsd --web`
- Responsibilities: Start dev/prod server, serve UI, handle API requests, forward to GSD
- Location: `packages/mcp-server/src/`
- Triggers: `gsd --mcp-server`
- Responsibilities: Expose GSD capabilities via Model Context Protocol
- Location: `src/update-check.ts`
- Triggers: First run or `gsd update`
- Responsibilities: Poll npm registry, compare versions, prompt user
## Error Handling
- **Version Mismatch:** `loader.ts` enforces Node 22+ with clear error message (lines 39-57)
- **Missing Git:** `loader.ts` checks `git --version` before startup (lines 59-70)
- **Broken Installation:** Workspace package checks with helpful recovery instructions (lines 202-214)
- **Session Skew:** `exitIfManagedResourcesAreNewer()` detects resource/binary version mismatch and suggests `npm install -g gsd-pi@latest` (lines 66-79)
- **Extension Load Failure:** Extension registry filters invalid manifests; bad extensions skipped with warning
- **Headless Timeout:** Configurable timeout with clean shutdown (via `--timeout` flag)
- **Answer Injection Errors:** Validation with detailed error reporting (`headless-answers.ts`)
- **RPC Communication:** Error propagation from child process with exit code mapping
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
