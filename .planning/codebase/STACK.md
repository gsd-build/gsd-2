# Technology Stack

**Analysis Date:** 2026-03-10

## Languages

**Primary:**
- TypeScript (ESNext target) - Mission Control UI and server (`packages/mission-control/src/`)
- JavaScript (CommonJS) - CLI tools, hooks, installer, and test runner (`get-shit-done/bin/`, `hooks/`, `bin/install.js`, `scripts/`)

**Secondary:**
- Markdown - Agent definitions (`agents/*.md`), workflow/command specs (`get-shit-done/workflows/`, `commands/gsd/`), and templates (`get-shit-done/templates/`)

## Runtime

**Environment:**
- Node.js >= 16.7.0 (declared in `package.json` engines field)
- Bun (primary runtime for Mission Control server and dev; `bun --hot` for HMR)

**Package Manager:**
- npm (root monorepo; lockfile: `package-lock.json` present)
- Bun (Mission Control package; lockfile: `bun.lock` present at root)

## Frameworks

**Core:**
- React 19.2.x - Frontend UI (`packages/mission-control/src/`)
- Bun.serve() - HTTP server and WebSocket server (no Express/Hono/Fastify)

**Testing:**
- Node.js built-in test runner (`node --test`) - Root-level tests (`tests/*.test.cjs`)
- Bun test runner (with `happy-dom` 20.8.x) - Mission Control tests (`packages/mission-control/tests/`)
- c8 11.x - Code coverage for root tests (70% line threshold)

**Build/Dev:**
- esbuild 0.24.x - Hook bundling (`scripts/build-hooks.js`)
- bun-plugin-tailwind 0.1.x - Tailwind CSS integration for Bun's static server (`packages/mission-control/bunfig.toml`)

## Key Dependencies

**Critical (Mission Control - `packages/mission-control/package.json`):**
- `react` ^19.2.4, `react-dom` ^19.2.4 - UI framework
- `gray-matter` ^4.0.3 - YAML frontmatter parsing for .planning/ markdown files
- `tailwindcss` ^4.2.1 - Utility-first CSS framework
- `lucide-react` ^0.577.0 - Icon library
- `react-resizable-panels` ^4.7.2 - Draggable panel layout
- `class-variance-authority` ^0.7.1, `clsx` ^2.1.1, `tailwind-merge` ^3.5.0 - Class management (shadcn/ui pattern)
- `tw-animate-css` ^1.4.0 - CSS animations

**Infrastructure (Root - `package.json`):**
- `esbuild` ^0.24.0 - Build tool for hooks
- `c8` ^11.0.0 - V8 code coverage

**Fonts:**
- `@fontsource/jetbrains-mono` ^5.2.8 - Monospace font
- `@fontsource/share-tech-mono` ^5.2.7 - Display monospace font

**Dev Dependencies (Mission Control):**
- `@types/react` ^19.2.14, `@types/react-dom` ^19.2.3 - TypeScript type definitions
- `happy-dom` ^20.8.3 - DOM implementation for tests

## Monorepo Structure

**Workspaces:** npm workspaces declared in root `package.json`
- `packages/*` - Contains `@gsd/mission-control`

**Root package:** `get-shit-done-cc` v1.22.4
- Published to npm as CLI tool (`bin.get-shit-done-cc` -> `bin/install.js`)

## Configuration

**TypeScript (`packages/mission-control/tsconfig.json`):**
- Target: ESNext, Module: ESNext, ModuleResolution: bundler
- JSX: react-jsx with React import source
- Strict mode enabled
- Path alias: `@/*` -> `./src/*`

**Bun (`packages/mission-control/bunfig.toml`):**
- Static serve plugin: `bun-plugin-tailwind`

**shadcn/ui (`packages/mission-control/components.json`):**
- Style: default, Base color: neutral, CSS variables: enabled
- Icon library: lucide
- Not using React Server Components (rsc: false)

**Build:**
- `npm run build:hooks` - Copies hook JS files to `hooks/dist/` (run as prepublishOnly)
- `npm run dev` - Starts Mission Control via `bun run --cwd packages/mission-control dev`

## CLI Tools

**`get-shit-done/bin/gsd-tools.cjs`** - Central CLI utility (CommonJS, no build step):
- Commands: state management, model resolution, phase operations, roadmap operations, web search
- All lib modules in `get-shit-done/bin/lib/*.cjs` (11 modules)

**`hooks/*.js`** - Claude Code hooks (CommonJS, no external dependencies):
- `gsd-check-update.js` - Version update checker
- `gsd-context-monitor.js` - Context usage monitoring
- `gsd-statusline.js` - Status line display

## Platform Requirements

**Development:**
- Node.js >= 16.7.0 (for CLI tools and tests)
- Bun (for Mission Control server; uses Bun.serve(), Bun.file(), Bun.spawn())
- Claude Code CLI (`claude` binary) - Required for chat integration in Mission Control

**Production/Distribution:**
- Published as npm package (`get-shit-done-cc`)
- Installs as slash commands into Claude Code, OpenCode, Gemini CLI, and Codex CLI
- Mission Control runs locally on port 4000 (HTTP) and 4001 (WebSocket)

---

*Stack analysis: 2026-03-10*
