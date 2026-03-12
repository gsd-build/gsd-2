# Stack Research

**Domain:** Local Bun-powered React dashboard with real-time updates, file watching, and child process management
**Researched:** 2026-03-10
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Bun | 1.3.x (latest stable) | Runtime, server, bundler, package manager | Single binary replaces Node + Vite + webpack. Native WebSocket in `Bun.serve()`, native file watching via `Bun.file()` / `fs.watch()`, built-in HTML imports with HMR and React Fast Refresh. Zero-config frontend dev — `bun ./index.html` starts a dev server with TypeScript/JSX/CSS bundling out of the box. Child process via `Bun.spawn()` returns `ReadableStream` on stdout. Eliminates entire Vite/webpack toolchain. |
| React | 19.2.x (19.2.4 latest) | UI rendering | Stable since Dec 2024, now at 19.2.4 with hardened server components. Removes `forwardRef` requirement (cleaner component APIs). Actions API simplifies async state transitions. React Compiler auto-memoizes — no more manual `useMemo`/`useCallback`. |
| TypeScript | 5.7.x | Type safety | Bun transpiles TypeScript natively — no `tsc` build step needed. Use for type checking only (`bun --check` or IDE). |
| Tailwind CSS | 4.2.x | Styling | CSS-first config via `@theme` directive — no `tailwind.config.js`. One-line setup: `@import "tailwindcss"`. Incremental builds 100x faster than v3. Cascade layers and `@property` support. Bun bundles CSS natively. |

### UI Components

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| shadcn/ui | latest (copy-paste, not versioned) | Component primitives | Not a dependency — copies component source into your project. Full React 19 compatibility (no forwardRef). Uses unified `radix-ui` package (not individual `@radix-ui/react-*`). Tailwind v4 support. Gives you ownership of the code — critical for the custom retro-futuristic design system. |
| radix-ui | unified package | Accessible primitives under shadcn | shadcn/ui now imports from unified `radix-ui` instead of individual packages. Handles accessibility (ARIA, focus management, keyboard nav) so you don't have to. |
| react-resizable-panels | 2.x | Five-panel resizable layout | 2.7M weekly downloads. PanelGroup/Panel/PanelResizeHandle API maps directly to Mission Control's five-panel layout. Supports min/max constraints, collapsible panels, horizontal/vertical nesting. |
| lucide-react | 0.577.x | Icons | Tree-shakeable SVG icons. Default icon set for shadcn/ui. 1500+ icons. |

### State Management

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Zustand | 5.0.x | Global client state | ~1KB bundle. Store-based model fits Mission Control's architecture: one store per domain (project state, WebSocket connection, chat session, UI layout). Middleware for `devtools`, `persist`, `subscribeWithSelector`. No boilerplate. Works outside React (useful for WebSocket message handlers). |

### Real-Time and Process Management

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Bun.serve() WebSocket | built-in | Server-to-client push | Native pub/sub with `.subscribe(topic)` / `.publish(topic, message)`. Per-message deflate compression. No `ws` or `socket.io` dependency needed. Topics map naturally to file paths — subscribe clients to `.planning/` file change events. |
| Bun fs.watch() | built-in | File system watching | Uses platform-native APIs (ReadDirectoryChangesW on Windows, inotify on Linux, kqueue on macOS). Recursive watching supported. No `chokidar` dependency. |
| Bun.spawn() | built-in | Claude Code child process | Returns `Subprocess` with `stdout` as `ReadableStream`. Stream chunks directly to WebSocket clients for real-time chat output. `onExit` callback for process lifecycle. Supports `stdin` pipe for interactive use. |

### Animation

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Remotion | 4.0.x (4.0.434 latest) | Logo animation, future video exports | React-based — animations are React components. 600ms pixel-art logo build animation is a natural fit. Same composition reusable for V2 marketing video exports. Actively maintained (published days ago). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Bun test runner | Testing | Built into Bun. Jest-compatible API. No separate test framework needed. |
| Biome | Linting + formatting | Single tool replaces ESLint + Prettier. Faster (Rust-based). Bun-friendly. |
| @types/bun | TypeScript types for Bun APIs | Install as dev dependency for IDE support with Bun.serve, Bun.spawn, etc. |

## Installation

```bash
# Initialize workspace (from repo root)
# In root package.json, add: "workspaces": ["packages/*"]

# Core dependencies (from packages/mission-control/)
bun add react react-dom zustand react-resizable-panels lucide-react

# shadcn/ui setup (initializes with Tailwind v4)
bunx shadcn@latest init

# Remotion (for logo animation)
bun add remotion @remotion/player

# Dev dependencies
bun add -D @types/bun @types/react @types/react-dom typescript @biomejs/biome

# Tailwind CSS (v4 — installed via shadcn init, but explicit if needed)
bun add -D tailwindcss @tailwindcss/postcss
```

## Monorepo Structure

```
get-shit-done/
  package.json              # root: "workspaces": ["packages/*"]
  packages/
    mission-control/
      package.json           # workspace package
      src/
        server/              # Bun.serve() + WebSocket + file watcher
        client/              # React app entry
        components/          # UI components (shadcn copies + custom)
        stores/              # Zustand stores
        hooks/               # React hooks
        lib/                 # Shared utilities
      index.html             # Bun HTML import entry point
      tsconfig.json
```

Bun workspaces use `"workspace:*"` version specifiers for cross-package references. The root `package.json` declares `"private": true` and lists workspace globs.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Bun.serve() WebSocket | socket.io | Never for this project. socket.io adds 50KB+ for features we don't need (rooms, namespaces, auto-reconnect). Bun's native WebSocket with pub/sub covers our use case. Only consider socket.io if you need cross-browser transport fallback (SSE, long-polling) — we don't since this is localhost only. |
| Bun.serve() static | Vite dev server | Only if you hit Bun HTML import limitations (edge cases with CSS modules, certain PostCSS plugins). Bun 1.3 HMR + React Fast Refresh eliminates the primary Vite use case. |
| Zustand | Jotai | If state is heavily atom-shaped (many independent pieces with fine-grained subscriptions). Mission Control's state is store-shaped (project state, connection state, chat state) — Zustand's model fits better. |
| Zustand | React Context | Never for frequently-updating state. Context triggers full subtree re-renders. Fine for static config (theme, user prefs). |
| react-resizable-panels | allotment | allotment is decent but less maintained. react-resizable-panels has 2.7M weekly downloads and active maintenance. |
| Biome | ESLint + Prettier | Only if you need ESLint plugins not available in Biome (e.g., eslint-plugin-react-hooks — though Biome now has its own). ESLint is significantly slower. |
| Remotion | Framer Motion | If you only need simple UI transitions (hover, mount/unmount). But Remotion is specified for V2 video export reuse, and the logo animation benefits from Remotion's timeline/composition model. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Next.js / Remix | SSR framework overhead is pointless for a local-only dashboard. No SEO, no SSR, no RSC needed. Adds routing complexity. | Bun.serve() with HTML imports — single server process, zero framework overhead. |
| Express / Hono (for HTTP) | Bun.serve() is a fully capable HTTP server with native WebSocket upgrade. Adding a framework is unnecessary indirection for a handful of API routes. | Bun.serve() `fetch()` handler with simple path matching. |
| Vite | Bun 1.3 has built-in HMR, React Fast Refresh, and CSS bundling. Vite adds a second tool and config surface. | Bun's native dev server via HTML imports. |
| Redux / Redux Toolkit | 15KB bundle, excessive boilerplate (slices, actions, reducers) for a dashboard with 4-5 stores. | Zustand — 1KB, no boilerplate. |
| chokidar | Bun has native `fs.watch()` with recursive support. chokidar is a Node.js polyfill for inconsistent `fs.watch` behavior — Bun doesn't have those inconsistencies. | `fs.watch()` from `"node:fs"` or Bun's native file watching in dev server. |
| ws (npm package) | Bun.serve() has native WebSocket support with pub/sub. Adding `ws` is redundant. | Bun.serve() `websocket` handler. |
| socket.io | Massive bundle, protocol overhead, features (rooms, namespaces, reconnect) not needed for localhost single-client dashboard. | Native WebSocket + manual reconnect (3 lines of code). |
| Electron | This is a web dashboard served locally, not a native app. Electron bundles a full Chromium — absurd for `localhost:3000`. | `bun run dev` and open a browser tab. |
| styled-components / CSS Modules | Tailwind v4 is specified in the PRD. Runtime CSS-in-JS adds bundle weight and hydration cost. CSS Modules add build complexity. | Tailwind CSS v4 utility classes. |
| @radix-ui/react-* (individual packages) | shadcn/ui has migrated to the unified `radix-ui` package. Individual packages are the old pattern. | `radix-ui` unified package (handled by shadcn init). |

## Stack Patterns by Variant

**For the WebSocket server:**
- Use Bun.serve() with `websocket` handler and topic-based pub/sub
- File watcher publishes to topics matching file paths
- Clients subscribe to topics they care about
- Because: Zero-dependency, native performance, pub/sub eliminates manual broadcast loops

**For state management:**
- Use Zustand with `subscribeWithSelector` middleware
- One store per domain: `useProjectStore`, `useConnectionStore`, `useChatStore`, `useLayoutStore`
- WebSocket messages dispatch to stores from outside React (Zustand supports this)
- Because: Stores are decoupled from React lifecycle, can be updated from WebSocket handlers

**For the five-panel layout:**
- Use react-resizable-panels with nested PanelGroups
- Outer group: sidebar | main content (horizontal)
- Inner group: top panels | bottom panels (vertical)
- Because: Supports min/max constraints, collapsible panels, persisted sizes via `onLayout`

**For Claude Code integration:**
- Use `Bun.spawn(["claude", ...args])` with `stdout: "pipe"`
- Read stdout as `ReadableStream`, chunk into WebSocket messages
- Track process via `subprocess.exited` promise
- Because: Native streaming, no buffering, direct pipe to WebSocket

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| React 19.2.x | radix-ui (unified) | No forwardRef needed. shadcn/ui components updated. |
| React 19.2.x | Zustand 5.x | Zustand 5 is React 19 compatible with `useSyncExternalStore`. |
| React 19.2.x | react-resizable-panels 2.x | Verify at install time — no known issues but check peer deps. |
| Tailwind CSS 4.2.x | shadcn/ui (latest) | shadcn init handles Tailwind v4 config automatically. |
| Bun 1.3.x | TypeScript 5.7.x | Bun transpiles TS natively. TypeScript is only for type checking. |
| Remotion 4.0.x | React 19.x | Remotion 4.x supports React 18 and 19. Verify peer deps at install. |

## Bun-Specific Advantages

This stack leverages Bun as a **single runtime** replacing multiple tools:

| Traditional Stack | Bun Equivalent | Eliminated Dependency |
|-------------------|----------------|----------------------|
| Node.js runtime | `bun run` | node |
| npm/yarn/pnpm | `bun install` | npm |
| Vite/webpack dev server | `bun ./index.html` | vite, webpack, webpack-dev-server |
| Vite/webpack bundler | Bun bundler (HTML imports) | vite, esbuild, webpack |
| ws / socket.io | `Bun.serve({ websocket })` | ws, socket.io |
| chokidar | `fs.watch()` (native) | chokidar |
| jest / vitest | `bun test` | jest, vitest, ts-jest |
| child_process (Node) | `Bun.spawn()` | n/a (cleaner API) |

Total dependencies eliminated: **10+ packages** that would be needed in a Node.js stack.

## Sources

- [Bun WebSocket docs](https://bun.com/docs/runtime/http/websockets) -- verified pub/sub API, message handlers, compression options (HIGH confidence)
- [Bun child process docs](https://bun.com/docs/runtime/child-process) -- verified Bun.spawn() stdout ReadableStream API (HIGH confidence)
- [Bun 1.3 blog post](https://bun.com/blog/bun-v1.3) -- HTML imports, HMR, React Fast Refresh (HIGH confidence)
- [React 19.2 release](https://react.dev/blog/2025/10/01/react-19-2) -- partial pre-rendering, current stable 19.2.4 (HIGH confidence)
- [React 19 release](https://react.dev/blog/2024/12/05/react-19) -- Actions, compiler, forwardRef removal (HIGH confidence)
- [Tailwind CSS v4.0 announcement](https://tailwindcss.com/blog/tailwindcss-v4) -- CSS-first config, performance (HIGH confidence)
- [shadcn/ui changelog](https://ui.shadcn.com/docs/changelog) -- unified radix-ui package, Tailwind v4 support (HIGH confidence)
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) -- setup instructions (HIGH confidence)
- [Zustand npm](https://www.npmjs.com/package/zustand) -- v5.0.11 latest, 1KB bundle (HIGH confidence)
- [react-resizable-panels npm](https://www.npmjs.com/package/react-resizable-panels) -- 2.7M weekly downloads (HIGH confidence)
- [Remotion npm](https://www.npmjs.com/package/remotion) -- v4.0.434, actively maintained (HIGH confidence)
- [lucide-react npm](https://www.npmjs.com/package/lucide-react) -- v0.577.x, shadcn default icons (HIGH confidence)
- [Bun workspaces docs](https://bun.com/docs/guides/install/workspaces) -- workspace:* protocol, glob patterns (HIGH confidence)
- [Bun 1.2 release info](https://socket.dev/blog/bun-1-2-released-90-node-js-compatibility-built-in-s3-object-support) -- Node.js compat improvements (MEDIUM confidence)

---
*Stack research for: Bun-powered local React dashboard (Mission Control)*
*Researched: 2026-03-10*
