# Coding Conventions

**Analysis Date:** 2026-03-10

## Naming Patterns

**Files:**
- CLI library modules: `kebab-case.cjs` (e.g., `get-shit-done/bin/lib/core.cjs`, `get-shit-done/bin/lib/frontmatter.cjs`)
- React components: `PascalCase.tsx` (e.g., `src/components/milestone/PhaseRow.tsx`, `src/components/layout/AppShell.tsx`)
- Server modules: `kebab-case.ts` (e.g., `src/server/state-deriver.ts`, `src/server/ws-server.ts`)
- React hooks: `camelCase.ts` prefixed with `use` (e.g., `src/hooks/usePlanningState.ts`, `src/hooks/useReconnectingWebSocket.ts`)
- Utility modules: `kebab-case.ts` (e.g., `src/lib/utils.ts`, `src/lib/layout-storage.ts`)
- Test files: `<module-name>.test.cjs` (root CLI) or `<module-name>.test.ts`/`.test.tsx` (mission-control)
- Type definition files: `types.ts` or `<domain>-types.ts` (e.g., `src/server/types.ts`, `src/server/chat-types.ts`, `src/server/fs-types.ts`)

**Functions:**
- Use `camelCase` for all functions in both CJS and TS code
- CLI command handlers: prefix with `cmd` (e.g., `cmdStateLoad`, `cmdGenerateSlug`, `cmdListTodos`)
- Internal/shared helpers: suffix with `Internal` (e.g., `resolveModelInternal`, `findPhaseInternal`, `generateSlugInternal`, `getRoadmapPhaseInternal`)
- React hooks: prefix with `use` (e.g., `usePlanningState`, `useReconnectingWebSocket`, `useChat`)
- React components: `PascalCase` named exports matching filename (e.g., `export function PhaseRow()`, `export function AppShell()`)
- Factory/builder functions: prefix with `create` or `build` (e.g., `createFileWatcher`, `buildFullState`, `createWsServer`, `createSwitchGuard`)

**Variables:**
- Use `camelCase` for local variables and parameters
- Use `UPPER_SNAKE_CASE` for module-level constants (e.g., `MODEL_PROFILES`, `TOOLS_PATH`, `DEFAULT_WS_URL`)
- Default state objects: `DEFAULT_<NAME>` (e.g., `DEFAULT_PROJECT_STATE`, `DEFAULT_CONFIG_STATE`)

**Types:**
- Use `PascalCase` for TypeScript interfaces and types
- Interface names describe the data shape without `I` prefix (e.g., `PhaseState`, `PlanningState`, `PipelineOptions`)
- Props interfaces: `<ComponentName>Props` (e.g., `PhaseRowProps`)
- Return type interfaces: `<HookName>Result` (e.g., `UsePlanningStateResult`)
- Status unions: string literal unions (e.g., `type PhaseStatus = "not_started" | "in_progress" | "complete"`)

## Code Style

**Formatting:**
- No Prettier or ESLint config in the project -- formatting is convention-based
- Use 2-space indentation throughout
- Use double quotes for strings in TypeScript files
- Use single quotes for strings in CJS files
- Trailing commas in multi-line structures

**Linting:**
- No linter configured at project level
- TypeScript strict mode enabled in `packages/mission-control/tsconfig.json` (`"strict": true`)
- `noEmit: true` -- TypeScript is used for type checking only, Bun handles compilation

## Import Organization

**CJS files (`get-shit-done/bin/lib/*.cjs`):**
1. Node built-ins (`require('fs')`, `require('path')`, `require('child_process')`)
2. Internal module imports (`require('./core.cjs')`, `require('./frontmatter.cjs')`)
3. No external npm dependencies (zero-dep design)

**TypeScript files (mission-control `src/`):**
1. External packages (`react`, `lucide-react`, `gray-matter`)
2. Internal absolute imports using `@/` alias (`@/lib/utils`, `@/components/shared/ProgressBar`)
3. Relative imports for same-directory or server modules (`./types`, `../server/types`)
4. Type-only imports: use `import type { ... }` for types

**Path Aliases:**
- `@/*` maps to `./src/*` in `packages/mission-control/tsconfig.json`
- Always use `@/` for cross-directory imports within mission-control

## Error Handling

**CJS CLI tools (`get-shit-done/bin/lib/*.cjs`):**
- Use `error(message)` helper from `core.cjs` which writes to stderr and exits with code 1
- Use `try/catch` with empty catch blocks for non-critical operations (e.g., file reads that may fail):
  ```javascript
  function safeReadFile(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
  ```
- Return `null` for missing data rather than throwing
- All CLI output goes through `output(result, raw, rawValue)` helper for consistent JSON formatting

**TypeScript server code (`packages/mission-control/src/server/`):**
- Async functions return `null` on failure rather than throwing:
  ```typescript
  async function readFileText(path: string): Promise<string | null> {
    try {
      return await Bun.file(path).text();
    } catch {
      return null;
    }
  }
  ```
- HTTP route handlers use try/catch with appropriate status codes (400, 409, 500)
- File watcher events wrapped in try/catch to prevent crashes on filesystem errors

**React components:**
- Use conditional rendering for missing/null data rather than error boundaries
- Pass `error` objects as props to `PanelError` component for display

## Logging

**Framework:** `console` (no logging library)

**Patterns:**
- Server startup messages: `console.log("File-to-state pipeline running. WebSocket on :4001")`
- Pipeline events: `console.log(\`[pipeline] ...\`)` with bracketed module prefix
- No logging in CLI tools -- output is structured JSON to stdout, errors to stderr

## Comments

**When to Comment:**
- Module-level JSDoc describing purpose of the file (every `.cjs` and `.ts` file starts with a `/** ... */` block)
- Section separators using ASCII art: `// --- Section Name ---` or `// ─── Section Name ────────`
- Regression test documentation: reference bug ID in comments (e.g., `// Bug: loadConfig previously omitted model_overrides from return value`)
- Known limitations documented with `REG-XX` identifiers

**JSDoc/TSDoc:**
- Use JSDoc `/** */` blocks for exported functions with `@param` tags in CJS helpers
- TypeScript code relies on type signatures rather than JSDoc for parameter documentation
- Interface fields occasionally have inline `/** */` comments for non-obvious fields

## Function Design

**Size:** Functions are generally compact (10-40 lines). Larger functions are split into helpers.

**Parameters:**
- CJS command functions: `(cwd, ...args, raw)` pattern where `cwd` is working directory and `raw` is boolean for raw output mode
- TypeScript: use options objects for 3+ parameters (e.g., `PipelineOptions`, `WatcherOptions`)
- React components: destructure props interface inline (e.g., `{ phase, description }: PhaseRowProps`)

**Return Values:**
- CJS commands: call `output(result, raw, rawValue)` which writes JSON and exits -- they do not return
- Internal helpers: return typed objects or `null` for "not found" cases
- React hooks: return typed result objects (e.g., `{ state, status }`)

## Module Design

**Exports (CJS):**
- Each module file in `get-shit-done/bin/lib/` exports all public functions via `module.exports = { ... }`
- Internal helpers exported alongside commands when needed by other modules (suffixed with `Internal`)
- Constants exported alongside functions (e.g., `MODEL_PROFILES`, `FRONTMATTER_SCHEMAS`)

**Exports (TypeScript):**
- Named exports for all public APIs -- no default exports except `App.tsx`
- Types exported with `export interface` / `export type` directly in the types file
- React components: one component per file, named export matching filename

**Barrel Files:**
- Not used. Import directly from the source file path.

## Component Patterns

**React Components (`packages/mission-control/src/components/`):**
- Functional components only (no class components)
- Props interface defined above the component in the same file
- Const objects for static mappings (e.g., `STATUS_ICONS` in `PhaseRow.tsx`)
- Use `cn()` utility from `@/lib/utils` for conditional className merging (clsx + tailwind-merge)
- Tailwind CSS classes inline, using design token colors (e.g., `bg-navy-base`, `text-cyan-accent`, `text-status-success`)

**State Management:**
- No external state library (no Redux, Zustand, etc.)
- `useState` + `useRef` for local state
- WebSocket-driven global state via `usePlanningState` hook
- Props drilling from `AppShell` to child components

---

*Convention analysis: 2026-03-10*
