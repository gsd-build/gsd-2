# Coding Conventions

**Analysis Date:** 2026-03-12

## Naming Patterns

**Files:**
- React components: PascalCase matching export name — `TaskExecuting.tsx`, `NavItems.tsx`, `AppShell.tsx`
- Hooks: camelCase prefixed with `use` — `useChat.ts`, `usePlanningState.ts`, `useSessionFlow.ts`
- Server modules: kebab-case — `session-manager.ts`, `chat-router.ts`, `claude-process.ts`
- Utility modules: kebab-case — `design-tokens.ts`, `slash-commands.ts`, `layout-storage.ts`
- Test files: kebab-case matching the module under test — `session-manager.test.ts`, `chat-router.test.ts`
- GSD extension source: kebab-case — `files.ts`, `state.ts`, `worktree-manager.ts`

**Directories:**
- Components grouped by feature in kebab-case: `active-task/`, `command-palette/`, `slice-detail/`
- Shared primitives under `shared/` or `ui/`
- All hooks flat in `hooks/`
- Server logic flat in `server/`

**Functions:**
- Components: PascalCase named function exports — `export function TaskExecuting(...)`
- Hooks: camelCase — `export function usePlanningState(...)`
- Pure utilities: camelCase — `export function processStreamEvent(...)`, `export function calculateBackoffDelay(...)`
- Private helpers within modules: camelCase — `getBudgetColor(...)`, `createMessageId()`
- GSD extension pure functions: camelCase — `deriveState(...)`, `parseRoadmap(...)`, `isSliceComplete(...)`

**Variables:**
- Local variables: camelCase
- Constants / lookup tables: SCREAMING_SNAKE_CASE — `BUDGET_COLORS`, `LAYOUT_DEFAULTS`, `MAX_SESSIONS`, `NAV_ITEMS`

**Types/Interfaces:**
- PascalCase — `SessionState`, `IProcessManager`, `StreamEvent`, `UseChatResult`
- Interface prefix `I` only for injected dependency abstractions — `IProcessManager`
- Type aliases use same PascalCase — `PhaseStatus = "not_started" | "in_progress" | "complete"`

## Code Style

**Formatting:**
- No prettier/eslint config file found at project root or package level — formatting is enforced by TypeScript compiler strictness and code review rather than automated tools
- Indentation: 2 spaces throughout
- Trailing commas in multi-line structures
- Double quotes for string literals in TypeScript files

**Linting:**
- No `.eslintrc` or `biome.json` detected
- TypeScript `strict: true` is the primary correctness gate in both `tsconfig.json` files

**TypeScript strictness:**
- Root `tsconfig.json`: `strict: true`, `module: NodeNext`, `moduleResolution: NodeNext`
- Mission Control `tsconfig.json`: `strict: true`, `isolatedModules: true`, `noEmit: true`

## Import Organization

**Order (observed pattern):**
1. Node built-ins with `node:` prefix — `import { join } from "node:path"`
2. Third-party packages — `import { describe, expect } from "bun:test"`
3. Local absolute imports using `@/` alias — `import { cn } from "@/lib/utils"`
4. Local relative imports — `import { deriveState } from "../state.ts"`
5. Type-only imports last — `import type { MustHaves } from "@/server/types"`

**Path Aliases:**
- `@/*` maps to `./src/*` in `packages/mission-control` (configured in `tsconfig.json` paths)
- GSD extension files use `.js` extension in relative imports (NodeNext module resolution) — `import { milestonesDir } from './paths.js'`

**Module Resolution:**
- Mission Control: `moduleResolution: bundler` (Bun bundler, no extension required)
- Root package / GSD extension: `moduleResolution: NodeNext` (requires `.js` extensions on relative imports)

## Error Handling

**Patterns:**
- Server functions use `try/catch` with silent fallbacks for non-critical I/O — `await rm(...).catch(() => {})`
- File reads that may be absent return `null` or empty defaults rather than throwing — `restoreMetadata` silently handles missing or corrupt JSON
- Tests assert on graceful degradation explicitly: `"restoreMetadata handles missing file gracefully"`, `"handles corrupt JSON file gracefully"`
- Throwing reserved for constraint violations: `expect(() => mgr.createSession("/repo")).toThrow(/maximum.*4/i)`
- Pure functions never throw — they return `null`, `[]`, or a default object

## Logging

**Framework:** `console.log` / `console.error` (no structured logging library)

**Patterns:**
- GSD extension tests use `console.log` headers with separator lines: `console.log('\n=== test group name ===')` and `console.error('  FAIL: message')`
- Server and component code: no direct logging observed (relies on caller-level error propagation)

## Comments

**When to Comment:**
- Module-level JSDoc block at top of every non-trivial file, describing purpose and key behaviors
- Inline comments on non-obvious logic — `// WS sends "state" field, but StateDiff expects "changes" — normalize`
- Section dividers using box-drawing characters for long files: `// ─── Fixture Helpers ───────────────────────────────────────────────────────`
- `TODO` comments with explicit intent: `// TODO: Implement git merge session/<slug> into main branch.`

**JSDoc/TSDoc:**
- Used on exported pure functions and class methods: `/** Pure function: returns true when taskId changed... */`
- Interface fields commented when not self-evident: `/** Factory to create process managers. Defaults to real ClaudeProcessManager. */`
- Type files have module-level comment explaining what consumes the types

## Function Design

**Size:** Functions are kept small. Helper functions are extracted aggressively — `getBudgetColor`, `createMessageId`, `shouldPulseOnTaskChange` are all separate named functions.

**Parameters:**
- Props interfaces defined inline above the component: `interface TaskExecutingProps { ... }`
- Options objects used for multi-param constructors: `new SessionManager(tempDir, { processFactory: ... })`
- Pure functions accept primitives + typed objects, no implicit `any`

**Return Values:**
- Functions return typed objects, `null` for absence, never `undefined` for intentional absence
- React components always return JSX or `null` — explicit `return null` when conditional render produces nothing
- Pure utility functions return plain objects, never throw

## Module Design

**Exports:**
- Named exports throughout — no default exports observed in any module
- Types exported separately with `export type { ... }` or `export interface`
- Constants exported alongside functions from the same module

**Barrel Files:**
- Not used — modules are imported directly by path
- Each feature directory contains its own component files; no `index.ts` barrel re-exports

## React Component Conventions

**Pattern:** Functional components only — no class components

**Composition over prop drilling:**
- Components receive typed props; deep trees use composition (AppShell wires hooks, passes results to children)
- `cn()` utility from `@/lib/utils` used for all conditional Tailwind class merging

**Tailwind usage:**
- All styling via Tailwind utility classes — no inline style objects
- Design token constants in `src/styles/design-tokens.ts` define the color/typography/spacing vocabulary
- Custom token names follow kebab-case Tailwind convention: `bg-status-warning`, `text-cyan-accent`, `bg-navy-700`

---

*Convention analysis: 2026-03-12*
