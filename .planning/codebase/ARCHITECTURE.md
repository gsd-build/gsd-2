# Architecture

**Analysis Date:** 2026-03-10

## Pattern Overview

**Overall:** Multi-runtime CLI meta-prompting system with companion dashboard UI

This is a spec-driven development orchestration system that installs into AI coding assistants (Claude Code, OpenCode, Gemini CLI, Codex) as slash commands. It uses markdown-based workflows, agent definitions, and a Node.js CLI toolchain to manage project planning, execution, and verification. A companion Bun+React dashboard (`mission-control`) provides real-time visualization.

**Key Characteristics:**
- Two distinct subsystems: CLI toolchain (Node.js/CJS) and dashboard UI (Bun/TypeScript/React)
- Markdown-first architecture: commands, workflows, agents, and templates are all `.md` files interpreted by AI runtimes
- File-based state management: all project state lives in `.planning/` as markdown and JSON files
- Agent-oriented: specialized AI agents (`gsd-planner`, `gsd-executor`, `gsd-verifier`, etc.) each with dedicated system prompts
- CLI tool (`gsd-tools.cjs`) provides deterministic operations that AI agents call via Bash

## Layers

**Installer Layer:**
- Purpose: Registers GSD commands, agents, hooks, and workflows into AI runtime config directories
- Location: `bin/install.js`
- Contains: Multi-runtime installer supporting Claude Code, OpenCode, Gemini CLI, Codex
- Depends on: Package files (`commands/`, `agents/`, `get-shit-done/workflows/`, `hooks/`)
- Used by: End users via `npx get-shit-done-cc`

**Command Layer (Slash Commands):**
- Purpose: Entry points that AI runtimes invoke when users type `/gsd:<command>`
- Location: `commands/gsd/*.md`
- Contains: 33 markdown command definitions with frontmatter (name, description, allowed-tools)
- Depends on: Workflow layer (references via `@~/.claude/get-shit-done/workflows/`)
- Used by: AI runtimes (Claude Code, OpenCode, Gemini, Codex)

**Workflow Layer:**
- Purpose: Full implementation logic for each command, loaded as context by the AI runtime
- Location: `get-shit-done/workflows/*.md`
- Contains: 35 detailed workflow documents with step-by-step process definitions
- Depends on: CLI tools layer (calls `gsd-tools` for deterministic operations), reference layer
- Used by: Command layer (loaded via `@` references in `<execution_context>`)

**Agent Layer:**
- Purpose: System prompts for specialized AI sub-agents spawned by orchestrator commands
- Location: `agents/*.md`
- Contains: 12 agent definitions (`gsd-planner`, `gsd-executor`, `gsd-verifier`, `gsd-codebase-mapper`, `gsd-debugger`, `gsd-roadmapper`, etc.)
- Depends on: Workflow layer, CLI tools layer
- Used by: Workflow orchestrators that spawn sub-agents via `Task` tool

**CLI Tools Layer:**
- Purpose: Deterministic Node.js operations that AI agents call via Bash for state manipulation
- Location: `get-shit-done/bin/gsd-tools.cjs` (dispatcher), `get-shit-done/bin/lib/*.cjs` (modules)
- Contains: CLI dispatcher + 11 library modules (core, state, phase, roadmap, milestone, commands, init, verify, template, frontmatter, config)
- Depends on: `.planning/` filesystem (reads/writes markdown and JSON)
- Used by: Workflows and agents via `node ~/.claude/get-shit-done/bin/gsd-tools.cjs <command>`

**Reference Layer:**
- Purpose: Shared reference documents providing behavioral guidelines
- Location: `get-shit-done/references/*.md`
- Contains: 13 reference docs (checkpoints, git integration, model profiles, TDD, UI brand, verification patterns, etc.)
- Depends on: Nothing
- Used by: Workflows and agents (loaded via `@` references)

**Template Layer:**
- Purpose: Markdown templates for project artifacts and codebase mapping
- Location: `get-shit-done/templates/*.md`, `get-shit-done/templates/codebase/*.md`
- Contains: Project templates (project.md, requirements.md, state.md, roadmap.md, etc.) and 7 codebase mapping templates
- Depends on: Nothing
- Used by: Workflows (for scaffolding new artifacts)

**Hook Layer:**
- Purpose: Background scripts that run alongside AI sessions (update checking, context monitoring, status display)
- Location: `hooks/*.js`
- Contains: 3 hooks (`gsd-check-update.js`, `gsd-context-monitor.js`, `gsd-statusline.js`)
- Depends on: CLI tools layer
- Used by: AI runtime hook systems

**Mission Control Layer (Dashboard):**
- Purpose: Real-time browser dashboard for visualizing project state
- Location: `packages/mission-control/`
- Contains: Bun HTTP server + WebSocket server + React SPA
- Depends on: `.planning/` filesystem (reads via file watcher), Claude Code process (for chat)
- Used by: Developers via `bun run dev` → `http://localhost:4000`

## Data Flow

**Command Execution Flow:**

1. User types `/gsd:execute-phase 3` in AI runtime
2. AI runtime loads command definition from `commands/gsd/execute-phase.md`
3. Command's `<execution_context>` loads workflow from `get-shit-done/workflows/execute-phase.md`
4. Workflow calls `gsd-tools init execute-phase 3` to gather phase metadata (plans, config, models)
5. Orchestrator spawns `gsd-executor` sub-agents (one per plan) via `Task` tool
6. Sub-agents execute plans, writing code and calling `gsd-tools` for state updates
7. `gsd-tools state update` writes changes to `.planning/STATE.md`
8. Optional: `gsd-verifier` agent validates work against must-haves

**Mission Control Data Flow:**

1. `startPipeline()` in `src/server/pipeline.ts` initializes the system
2. `createFileWatcher()` in `src/server/watcher.ts` watches `.planning/` directory recursively
3. On file change: `buildFullState()` in `src/server/state-deriver.ts` parses all `.planning/` files into `PlanningState`
4. `computeDiff()` in `src/server/differ.ts` computes delta between old and new state
5. `createWsServer()` in `src/server/ws-server.ts` broadcasts `StateDiff` to connected WebSocket clients
6. React app receives updates via `usePlanningState()` hook in `src/hooks/usePlanningState.ts`
7. Components render current state (milestone progress, phase status, plan details)

**State Management:**
- All state persists as files in `.planning/` directory
- `STATE.md` is the central state file with YAML frontmatter
- `ROADMAP.md` tracks phase structure and completion
- `REQUIREMENTS.md` tracks requirement completion
- `config.json` stores workflow preferences
- Phase directories (`phases/NN-slug/`) contain `PLAN.md`, `SUMMARY.md`, and `VERIFICATION.md` files

## Key Abstractions

**GSD Tools CLI:**
- Purpose: Single deterministic CLI that all AI agents share for state operations
- Examples: `get-shit-done/bin/gsd-tools.cjs`, `get-shit-done/bin/lib/core.cjs`
- Pattern: Dispatcher routes subcommand to function, outputs JSON to stdout (or `@file:/tmp/...` for large payloads)

**Model Profiles:**
- Purpose: Maps agent types to AI model tiers (opus/sonnet/haiku) based on quality/balanced/budget profile
- Examples: `MODEL_PROFILES` in `get-shit-done/bin/lib/core.cjs`
- Pattern: Config-driven lookup table; user sets `model_profile` in `config.json`, agents resolve via `gsd-tools resolve-model`

**Frontmatter System:**
- Purpose: YAML frontmatter in markdown files serves as structured metadata
- Examples: `get-shit-done/bin/lib/frontmatter.cjs`
- Pattern: Custom YAML parser (not a library) handles extraction, reconstruction, and CRUD for plan/summary/verification schemas

**PlanningState:**
- Purpose: Typed aggregate of all `.planning/` file contents for the dashboard
- Examples: `packages/mission-control/src/server/types.ts`
- Pattern: Derived state — rebuilt from filesystem on every change, never stored as single file

**Phase Lifecycle:**
- Purpose: Progression engine for phases through planning → execution → verification → completion
- Examples: `get-shit-done/bin/lib/phase.cjs`, `get-shit-done/bin/lib/state.cjs`
- Pattern: Phase directories contain lifecycle artifacts; state transitions tracked in `STATE.md` and `ROADMAP.md`

## Entry Points

**NPM Install / CLI:**
- Location: `bin/install.js`
- Triggers: `npx get-shit-done-cc` or `npm install -g get-shit-done-cc`
- Responsibilities: Copies commands, agents, workflows, templates, hooks to AI runtime config directories

**GSD Tools Dispatcher:**
- Location: `get-shit-done/bin/gsd-tools.cjs`
- Triggers: AI agents call via `node gsd-tools.cjs <command> [args]`
- Responsibilities: Routes 50+ subcommands to appropriate library functions, outputs JSON

**Mission Control Server:**
- Location: `packages/mission-control/src/server.ts`
- Triggers: `bun run dev` or `bun --hot src/server.ts`
- Responsibilities: Serves React SPA on `:4000`, WebSocket state updates on `:4001`, REST APIs for filesystem and project management

**Slash Commands:**
- Location: `commands/gsd/*.md` (33 commands)
- Triggers: User types `/gsd:<name>` in AI runtime
- Responsibilities: Define entry point metadata (allowed tools, arguments) and reference workflow implementations

## Error Handling

**Strategy:** Fail-fast with JSON error output for CLI tools; graceful degradation for dashboard

**Patterns:**
- CLI tools: `error(message)` writes to stderr and exits with code 1
- File operations: `safeReadFile()` returns null on failure, callers handle missing data
- Dashboard pipeline: try/catch around file parsing with defaults for missing files
- WebSocket: Reconnecting client with exponential backoff (`useReconnectingWebSocket`)
- Large output: JSON payloads >50KB written to tmpfile, path returned as `@file:<path>`

## Cross-Cutting Concerns

**Logging:** Console-based. CLI tools write JSON to stdout, errors to stderr. Dashboard uses `console.log` with `[pipeline]`/`[watcher]` prefixes.

**Validation:** `gsd-tools validate consistency` checks phase numbering and disk/roadmap sync. `validate health [--repair]` checks `.planning/` integrity. Frontmatter validation enforces schemas for plan/summary/verification files.

**Authentication:** None. This is a local development tool. No auth layer.

**Configuration:** Two-level config: global user defaults in `~/.gsd/defaults.json`, project-level in `.planning/config.json`. Config merges with sensible defaults in `loadConfig()`.

---

*Architecture analysis: 2026-03-10*
