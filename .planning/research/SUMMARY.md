# Project Research Summary

**Project:** GSD Mission Control
**Domain:** Local Bun-powered React dashboard with real-time file watching, WebSocket state sync, and AI chat integration
**Researched:** 2026-03-10
**Confidence:** HIGH

## Executive Summary

GSD Mission Control is a local-only developer dashboard that visualizes project lifecycle state derived from `.planning/` files in real time, while providing an integrated AI chat interface powered by Claude Code as a child process. The expert approach for this class of tool is a single Bun process serving both the HTTP/WebSocket backend and the React SPA frontend, with a unidirectional data pipeline: file system events flow through debounce, parse, diff, and broadcast stages before reaching Zustand-powered React panels. This eliminates the need for databases, external services, or framework overhead -- the file system IS the database, and Bun IS the entire toolchain (runtime, bundler, dev server, test runner, package manager).

The recommended stack centers on Bun 1.3.x as the single runtime replacing 10+ traditional Node.js dependencies, React 19.2.x with its compiler and Actions API, Tailwind CSS v4 for styling, shadcn/ui for accessible component primitives, Zustand 5.x for store-based state management, and react-resizable-panels for the five-panel layout. This stack is well-documented, version-compatible, and avoids unnecessary abstractions. The architecture is deliberately simple: one server process, one WebSocket connection, topic-based pub/sub, and selector-based store subscriptions to prevent re-render storms.

The primary risks are: (1) Claude Code child process management on Windows, including spawn hanging and orphaned processes, (2) file watcher race conditions where partial files are read mid-write, (3) WebSocket state divergence during idle disconnections, and (4) Bun's Windows-specific rough edges. All four are mitigatable with patterns identified in the research -- debounce-and-validate for file watching, version-based sync protocol for WebSocket, PID tracking for process cleanup, and early Windows validation of all Bun APIs. The critical path is getting the file-to-UI pipeline working end-to-end before building individual panels.

## Key Findings

### Recommended Stack

Bun 1.3.x serves as the single runtime, replacing Node.js, Vite, webpack, chokidar, ws, and jest with native equivalents. This eliminates 10+ dependencies and configuration files. The frontend uses React 19.2.x (auto-memoization via React Compiler, no forwardRef), Tailwind CSS v4 (CSS-first config, 100x faster builds), and shadcn/ui (copy-paste components with full React 19 compatibility).

**Core technologies:**
- **Bun 1.3.x**: Runtime, server, bundler, package manager, test runner -- single binary replaces entire Node.js toolchain
- **React 19.2.x**: UI rendering with React Compiler auto-memoization and Actions API for async state
- **Zustand 5.x**: Store-based state management (~1KB) with selector subscriptions and external-to-React updates from WebSocket handlers
- **react-resizable-panels 2.x**: Five-panel resizable layout with min/max constraints and persistence
- **shadcn/ui + radix-ui**: Accessible component primitives with ownership of source code for custom design system
- **Tailwind CSS 4.2.x**: CSS-first utility framework with native Bun bundling
- **Remotion 4.x**: Logo animation and future video export capabilities

### Expected Features

**Must have (table stakes):**
- Real-time state updates via WebSocket push from file watcher (every modern dashboard does this)
- Resizable multi-panel layout (Cursor, VS Code, DevTools standard)
- AI chat with streaming responses (token-by-token is the 2026 baseline)
- Loading/empty/error states for every panel (skeleton screens, not spinners)
- Keyboard shortcuts with command palette (Ctrl+Shift+P)
- Dark theme (non-negotiable for dev tools)
- Session persistence derived from `.planning/` files (files ARE the state)
- Project detection and context awareness (auto-detect `.planning/` directory)

**Should have (competitive edge):**
- Unified build loop: chat triggers Claude Code, code changes trigger file watcher, panels update in real time
- Live preview iframe with viewport switching via Bun proxy
- Hybrid intent classifier (local prefix matching for `/gsd:` commands, API only for ambiguous input)
- Discuss mode with structured question cards and decision logging
- Review mode with 6-pillar scoring and design contract enforcement

**Defer (v2+):**
- D3 force graph boundary maps (HIGH complexity, LOW ROI vs. text lists)
- Multi-agent lane view (requires non-existent GSD 2.0 parallel agent support)
- Real-time diff viewer (VS Code handles this)
- Cloud sync, prompt library, plugin system, telemetry dashboard

**Anti-features (deliberately NOT building):**
- Direct file editing (Mission Control is a viewer and command center, not an IDE)
- Character-by-character real-time updates (creates noise; diff-based is better)
- Snapshot/replay timeline (git already does this)

### Architecture Approach

The architecture is a single Bun process running seven components in one event loop: File Watcher, State Deriver, WebSocket Hub, HTTP Router, Chat Manager, Preview Proxy, and the React Panel System. Data flows unidirectionally from file system events through a parse-diff-broadcast pipeline to Zustand stores consumed by React panels with selector-based subscriptions. The server never writes to `.planning/` -- all mutations go through Claude Code or `gsd-tools.cjs`. The client never reads files directly -- it receives pre-processed state over WebSocket.

**Major components:**
1. **File Watcher + State Deriver** -- Monitor `.planning/`, parse changed files, diff against cache, produce minimal JSON patches
2. **WebSocket Hub** -- Bun native pub/sub with topics (`state`, `chat:{sessionId}`, `preview`), full state on connect, patches during session
3. **Chat Manager** -- Long-lived Claude Code child process per session, stdin pipe for input, stdout ReadableStream for streaming output
4. **HTTP Router** -- Bun.serve() fetch handler for SPA static files and REST API endpoints
5. **Preview Proxy** -- HTTP proxy to local dev server for iframe rendering
6. **React Panel System** -- Five resizable panels consuming Zustand stores fed by a single WebSocket connection
7. **Shared Protocol** -- TypeScript types defining the WebSocket message contract between server and client

### Critical Pitfalls

1. **Claude Code spawn hanging from JS runtimes** -- Stdin pipe buffering can deadlock. Use `stdio: ['inherit', 'pipe', 'pipe']` or explicitly `stdin.end()` after writing. Build a proof-of-concept on Windows BEFORE committing to the architecture.
2. **Claude Code process orphaning** -- Crashed parents leave child processes consuming 50-100MB each. Track PIDs in a Set, register cleanup on all exit signals, write PIDs to `.planning/.mc-pids` for cross-session cleanup, scan and kill orphans on startup.
3. **File watcher race conditions** -- Events fire mid-write, causing empty/partial file reads. Debounce 50ms per-file-path, validate content before processing, never replace valid state with invalid state, retry once on parse failure.
4. **WebSocket state divergence** -- Bun closes idle connections after 120s by default. Set `idleTimeout: 0`, implement ping/pong, use monotonic version numbers, send full state on reconnect with version-based diff fallback.
5. **Bun Windows instability** -- File watchers, child process spawning, and path handling have more rough edges on Windows. Validate every Bun API on Windows early, use `path.join()` everywhere, pin Bun version, have chokidar as fallback.
6. **Bun.serve TypeScript type conflict** -- Routes + WebSocket config triggers a known type bug (#17871). Encapsulate in a single typed wrapper with one controlled `as any` assertion.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation -- Bun Server and File-to-State Pipeline
**Rationale:** Everything depends on this. No panel can display real data until the file-to-UI pipeline works end-to-end. Architecture research identifies steps 1-5 as the critical path. Pitfalls research flags file watcher race conditions, WebSocket state divergence, Bun Windows instability, and the TypeScript type conflict as Phase 1 concerns.
**Delivers:** Bun server with file watcher, state deriver with parsers for `.planning/` file types, WebSocket hub with pub/sub, shared protocol types, and a single "debug panel" proving the full pipeline works.
**Addresses:** Real-time state updates (table stakes), project detection, session persistence via file-based state.
**Avoids:** File watcher race conditions (debounce-and-validate pattern), WebSocket state divergence (version-based sync), Bun type conflicts (typed wrapper), Windows issues (early API validation).

### Phase 2: Panel Layout and UI Shell
**Rationale:** With the data pipeline proven, build the visual shell. The five-panel resizable layout is the product's visual identity and must be right before filling panels with content. Architecture research shows panels depend on stores being populated (step 6).
**Delivers:** Five-panel resizable layout with react-resizable-panels, Zustand stores (project, chat, UI), design system implementation (dark theme, Tailwind v4, shadcn/ui components), loading/empty/error states for every panel, keyboard shortcuts and command palette.
**Addresses:** Resizable multi-panel layout, dark theme, loading states, keyboard shortcuts (all table stakes).
**Avoids:** React re-render storms (selector-based Zustand subscriptions, not React Context).

### Phase 3: Chat Panel and Claude Code Integration
**Rationale:** The chat panel is the core interaction model -- "build loop in one window" requires it. Architecture research shows chat is independent of the state pipeline and can build on WebSocket infrastructure from Phase 1. Pitfalls research identifies Claude Code spawn and process management as the highest-risk integration.
**Delivers:** Chat panel with Claude Code child process, streaming response display, process lifecycle management (spawn, kill, orphan cleanup), basic intent routing.
**Addresses:** AI chat with streaming responses (table stakes), unified build loop (differentiator).
**Avoids:** Claude Code spawn hanging (proof-of-concept first, explicit stdin management), process orphaning (PID tracking, startup cleanup, idle timeout).

### Phase 4: State Panels -- Sidebar, Milestone, Slice, Active Task
**Rationale:** With data flowing and chat working, build out the individual panels that display project state. These are largely independent of each other and can be built incrementally. Architecture suggests: Sidebar first (simplest), then MilestoneView, SliceDetail, ActiveTask.
**Delivers:** Sidebar with project navigation, milestone view with phase/task hierarchy, slice detail panel, active task panel with status indicators, real-time updates across all panels.
**Addresses:** Clear visual hierarchy for task status (table stakes), milestone/phase lifecycle visualization (differentiator).
**Avoids:** Full state broadcast on every change (targeted patches already in place from Phase 1).

### Phase 5: Enhanced Features -- Preview, Discuss, Review Modes
**Rationale:** These are differentiators that layer on top of the working core. Preview requires server proxy infrastructure. Discuss and Review modes enhance the chat panel. All are P2 priority per feature research.
**Delivers:** Live preview iframe with dev server proxy, viewport switching, discuss mode with question cards, review mode with 6-pillar scoring, hybrid intent classifier, Remotion logo animation.
**Addresses:** Live preview (differentiator), discuss mode (differentiator), review mode (differentiator), design contract enforcement (differentiator), branded animation (differentiator).
**Avoids:** Preview iframe security (sandbox attributes, credential stripping).

### Phase 6: Polish and Production Readiness
**Rationale:** Final hardening before release. Responsive layout, error boundary coverage, accessibility audit, performance optimization.
**Delivers:** Mobile/tablet responsive layout, comprehensive error boundaries, accessibility pass, performance profiling and optimization, documentation.
**Addresses:** Responsive layout (table stakes), remaining UX pitfalls from research.

### Phase Ordering Rationale

- **Phase 1 before everything:** The file-to-UI pipeline is the foundation. Architecture research explicitly marks it as the critical path. Three of the six critical pitfalls must be addressed here.
- **Phase 2 before panels:** The layout shell with stores must exist before individual panels can be built. Design system decisions affect all subsequent UI work.
- **Phase 3 before state panels:** Chat is the primary interaction model and the highest-risk integration. De-risking it early is essential. Claude Code spawn issues on Windows could force architecture changes -- better to discover this before building 4 panels.
- **Phase 4 after chat:** State panels are lower risk (well-understood rendering of parsed data) and benefit from the full pipeline being proven. They are also independently buildable.
- **Phase 5 after core:** Enhanced features layer on top of working infrastructure. They are differentiators, not table stakes. Shipping core first validates the concept.
- **Phase 6 last:** Polish is wasted on features that might change. Do it when the product is functionally complete.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Bun `fs.watch()` behavior on Windows needs hands-on validation. The Bun.serve routes+WebSocket type workaround needs testing. Research the exact `ReadDirectoryChangesW` behavior for `.planning/` directory structures.
- **Phase 3:** Claude Code child process integration is the highest-risk area. The spawn-from-JS hanging issue and `--output-format stream-json` parsing need proof-of-concept testing before detailed planning. The `--dangerously-skip-permissions` first-time setup flow needs design research.
- **Phase 5:** Preview iframe proxy security model and CSP headers need research. Remotion integration with Bun's bundler needs verification.

Phases with standard patterns (skip research-phase):
- **Phase 2:** React panel layouts with react-resizable-panels, Zustand stores, and shadcn/ui components are well-documented with extensive examples.
- **Phase 4:** Rendering parsed data in React panels is straightforward UI work. Markdown/JSON parsing is a solved problem.
- **Phase 6:** Responsive design, error boundaries, and accessibility are established patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against official docs with version compatibility confirmed. Bun 1.3.x features (HTML imports, HMR, WebSocket pub/sub) confirmed from official blog posts and docs. |
| Features | HIGH | Feature landscape mapped against real competitors (Cursor, Windsurf, VS Code). Clear differentiation identified. Anti-features well-reasoned. |
| Architecture | HIGH | Patterns verified against Bun official API docs. Unidirectional pipeline is an established pattern for real-time dashboards. Code examples use verified APIs. |
| Pitfalls | HIGH | Most pitfalls sourced from actual GitHub issues (Bun #17871, #23536, #27667; Claude Code #771, #142) with community-confirmed workarounds. |

**Overall confidence:** HIGH

### Gaps to Address

- **Claude Code spawn on Windows:** No research source confirmed successful Bun.spawn of Claude Code specifically on Windows 11. This MUST be validated with a proof-of-concept in Phase 3 planning. If it fails, fallback is spawning via `node` child process or using the Claude API SDK directly.
- **Bun HTML imports maturity:** Bun 1.3 HTML imports with HMR are relatively new. If edge cases emerge (CSS module issues, PostCSS plugin incompatibility), Vite is the documented fallback.
- **react-resizable-panels + React 19:** Version compatibility noted as "verify at install time." No known issues but no explicit confirmation either.
- **Remotion 4.x + Bun bundler:** Remotion typically uses its own bundler. Integration with Bun's native bundling needs verification. May need to use Remotion's bundler for the animation component.
- **`.planning/` file format stability:** The state deriver depends on parsing `.planning/` files. If GSD's file formats change, parsers break. Consider versioning the parser contract.

## Sources

### Primary (HIGH confidence)
- [Bun WebSocket docs](https://bun.com/docs/runtime/http/websockets) -- pub/sub API, message handlers, compression
- [Bun child process docs](https://bun.com/docs/runtime/child-process) -- Bun.spawn() stdout ReadableStream API
- [Bun 1.3 blog post](https://bun.com/blog/bun-v1.3) -- HTML imports, HMR, React Fast Refresh
- [Bun file watching](https://bun.com/docs/guides/read-file/watch) -- fs.watch() in Bun
- [React 19 release](https://react.dev/blog/2024/12/05/react-19) -- Actions, compiler, forwardRef removal
- [Tailwind CSS v4 announcement](https://tailwindcss.com/blog/tailwindcss-v4) -- CSS-first config
- [shadcn/ui docs](https://ui.shadcn.com/docs/changelog) -- unified radix-ui, Tailwind v4 support
- [Zustand npm](https://www.npmjs.com/package/zustand) -- v5.0.11, 1KB bundle

### Secondary (MEDIUM confidence)
- [Bun.serve routes+WebSocket type bug (#17871)](https://github.com/oven-sh/bun/issues/17871) -- confirmed type conflict, runtime works
- [Claude Code spawn from Node.js (#771)](https://github.com/anthropics/claude-code/issues/771) -- confirmed hanging behavior
- [Claude Code orphaned processes (#142)](https://github.com/anthropics/claude-agent-sdk-typescript/issues/142) -- confirmed orphaning pattern
- [Bun Windows stability (#27664)](https://github.com/oven-sh/bun/issues/27664) -- Windows-specific issues
- [Cursor vs Windsurf vs Claude Code 2026](https://dev.to/pockit_tools/cursor-vs-windsurf-vs-claude-code-in-2026-the-honest-comparison-after-using-all-three-3gof) -- competitor analysis

### Tertiary (LOW confidence)
- Remotion 4.x + Bun bundler compatibility -- inferred from peer deps, not tested
- react-resizable-panels + React 19 -- no known issues but not explicitly confirmed

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
