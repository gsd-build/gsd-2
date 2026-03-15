# Technology Stack

**Analysis Date:** 2026-03-12

## Languages

**Primary:**
- TypeScript 5.4+ - All application code across root CLI package and `packages/mission-control`
- JavaScript (ESM) - Entry scripts in `scripts/`, patching shims in `patches/`

**Secondary:**
- HTML - Single-page shell at `packages/mission-control/public/index.html`
- CSS - Global styles at `packages/mission-control/src/styles/globals.css` (Tailwind v4)

## Runtime

**Environment:**
- Node.js >=20.6.0 (required) - Used by root CLI package (`src/`) for TypeScript compilation and test running
- Bun 1.3.10 (required for mission-control) - Runs the Mission Control dev server (`packages/mission-control/`) via `bun --hot src/server.ts`

**Why two runtimes:**
- Root `gsd-pi` CLI is distributed via npm and must run on Node.js without Bun
- `packages/mission-control` uses Bun-native APIs (`Bun.serve`, `Bun.file`, WebSocket pub/sub) and the `bun-plugin-tailwind` build plugin

**Package Manager:**
- npm - Root package (`package.json`, `package-lock.json`)
- Bun - `packages/mission-control/` (has `bun.lock`)
- Lockfiles: `package-lock.json` present at root; `bun.lock` in `packages/mission-control/`

## Frameworks

**Core (mission-control UI):**
- React 19.2.4 - Frontend UI, `packages/mission-control/src/`
- Tailwind CSS 4.2.1 - Utility-first styling, configured via `bunfig.toml` plugin
- shadcn/ui - Component system via `components.json` (style: default, icon: lucide)

**Core (CLI / agent runtime):**
- `@mariozechner/pi-coding-agent` ^0.57.1 - Agent SDK that provides the interactive TUI, extension API, tool primitives, and session management for the GSD CLI

**Server:**
- Bun.serve() - HTTP + WebSocket server, ports 4000 (HTTP) and 4001 (WebSocket)

**Testing:**
- `bun:test` - Test runner for `packages/mission-control/tests/`
- Node built-in test runner (`node --test`) - Used for root CLI tests in `src/resources/extensions/gsd/tests/` and `src/tests/`
- `happy-dom` ^20.8.3 - DOM environment for React component tests

**Build/Dev:**
- TypeScript compiler (`tsc`) - Root CLI build, outputs to `dist/`
- `bun --hot` - Hot-reload dev server for mission-control
- `bun-plugin-tailwind` ^0.1.2 - Tailwind CSS integration for Bun's bundler

## Key Dependencies

**Critical:**
- `@mariozechner/pi-coding-agent` ^0.57.1 - The entire GSD CLI is built as a pi extension. Provides `ExtensionAPI`, `ExtensionContext`, tool builders (`createBashTool`, `createWriteTool`, etc.), session lifecycle hooks, and the interactive TUI
- `react` ^19.2.4 / `react-dom` ^19.2.4 - Mission Control UI foundation
- `playwright` ^1.58.2 - Browser automation for the `browser-tools` extension; lets the agent verify UI work headlessly

**UI Component Libraries:**
- `lucide-react` ^0.577.0 - Icon library (configured as shadcn icon library)
- `cmdk` ^1.1.1 - Command palette component (`packages/mission-control/src/components/command-palette/`)
- `react-resizable-panels` ^4.7.2 - Resizable panel layout
- `class-variance-authority` ^0.7.1 - CVA for component variant composition
- `clsx` ^2.1.1 + `tailwind-merge` ^3.5.0 - Class merging utilities (`@/lib/utils`)
- `tw-animate-css` ^1.4.0 - CSS animations

**Data Processing:**
- `gray-matter` ^4.0.3 - Parses YAML front-matter from `.planning/` markdown files in the state pipeline

**Typography:**
- `@fontsource/jetbrains-mono` ^5.2.8 - Primary monospace font
- `@fontsource/share-tech-mono` ^5.2.7 - Secondary monospace font

**Dev Tooling:**
- `patch-package` ^8.0.1 - Patches applied to `@mariozechner/pi-coding-agent` (see `patches/`)
- `@sinclair/typebox` - Runtime schema validation for extension tool parameter definitions (transitive from pi-coding-agent, used directly in extensions)
- `gaxios` overridden to 7.1.4 - Dependency conflict resolution

## Configuration

**Environment (runtime secrets/config):**
- `~/.gsd/defaults.json` - Global GSD user settings
- `.planning/config.json` - Per-project GSD settings
- `CONTEXT7_API_KEY` env var - Optional API key for Context7 documentation service (increases rate limits)
- `TAVILY_API_KEY` env var - Required for web search via Tavily API
- `PI_PACKAGE_DIR`, `GSD_CODING_AGENT_DIR`, `GSD_VERSION`, `GSD_BIN_PATH`, `GSD_WORKFLOW_PATH`, `GSD_BUNDLED_EXTENSION_PATHS` - Internal env vars set by `src/loader.ts` at startup

**Build:**
- `tsconfig.json` (root) - Node.js ESM output, target ES2022, `dist/` outDir
- `packages/mission-control/tsconfig.json` - ESNext/bundler mode, `@/*` path alias to `src/`
- `packages/mission-control/bunfig.toml` - Bun static serve plugin (tailwind)
- `packages/mission-control/components.json` - shadcn/ui configuration

## Platform Requirements

**Development:**
- Node.js >=20.6.0 (for root CLI)
- Bun >=1.3.x (for mission-control dev server)
- Git (used at runtime via `child_process.spawn("git", ...)` for worktrees, log, status)
- Claude Code CLI (`claude` command) installed and on PATH (spawned per-message by `ClaudeProcessManager`)

**Production:**
- Distributed as npm package `gsd-pi` (binary: `gsd` / `gsd-cli`)
- `dist/` contains compiled CLI; `packages/mission-control` is a dev-time companion not published to npm
- Mission Control runs locally on port 4000/4001 — not deployed to cloud

---

*Stack analysis: 2026-03-12*
