# Roadmap: GSD 2 — Pi Clean Seam (v1.0)

## Overview

Six sequential phases extract ~79 GSD-authored TypeScript files from the vendored `pi-coding-agent` package into two new compiler-enforced workspace packages (`@gsd/agent-core`, `@gsd/agent-modes`). Each phase leaves the build green before the next begins. The seam is established at the TypeScript compiler level — not by convention.

## Phases

- [x] **Phase 1: Pre-Flight** - Untangle all circular deps, fix internal-path imports, audit cycles — no file moves yet
- [x] **Phase 2: Package Scaffolding** - Create empty `@gsd/agent-core` and `@gsd/agent-modes` packages; build chain updated and green
- [x] **Phase 3: @gsd/agent-modes Extraction** - All CLI and run-mode files moved leaf-first from `pi-coding-agent`
- [x] **Phase 4: @gsd/agent-core Extraction** - All session orchestration files moved leaf-first, `agent-session.ts` last
- [ ] **Phase 5: Wiring and Boundary Enforcement** - Extension loader updated, build scripts finalized, boundary verified
- [ ] **Phase 6: Verification and PR** - Clean-state build, tests, binary smoke test, PR submission

## Phase Details

### Phase 1: Pre-Flight
**Goal**: All circular dependencies, internal-path imports, and `.ts` import extensions in the files-to-move are resolved before a single file changes location.
**Depends on**: Nothing (first phase)
**Requirements**: PF-01, PF-02, PF-03, PF-04, PF-05, PF-06
**Success Criteria** (what must be TRUE):
  1. `tsc --noEmit` passes from workspace root after each pre-flight fix commit
  2. `madge --circular` reports zero cycles in `pi-coding-agent/src/`
  3. `bridge-service.ts` contains no raw `../../packages/pi-coding-agent/src/` import paths
  4. `extensions/types.ts` contains no imports from files that will move to `@gsd/agent-core`
  5. No `.ts` extension specifiers remain in `pi-coding-agent/src/core/`, `src/modes/`, or `src/cli/` files targeted for extraction
**Status**: Complete
**Plans:** 3 plans
Plans:
- [x] 01-01-PLAN.md — Branch setup, madge baseline, theme circular dep fix (PF-01), bridge-service import fix (PF-02)
- [x] 01-02-PLAN.md — Type leak inlining in extensions/types.ts (PF-03), keybindings type extraction (PF-04)
- [x] 01-03-PLAN.md — Madge final gate (PF-05), .ts specifier audit (PF-06), regression test run

### Phase 2: Package Scaffolding
**Goal**: Both new packages exist in the workspace with correct `package.json`, `tsconfig.json`, and empty `src/index.ts`; the build chain is updated; `npm run build:gsd` passes before any files move.
**Depends on**: Phase 1
**Requirements**: SCAF-01, SCAF-02, SCAF-03, SCAF-04, SCAF-05, SCAF-06
**Success Criteria** (what must be TRUE):
  1. `packages/gsd-agent-core/` and `packages/gsd-agent-modes/` exist with valid `package.json` and `tsconfig.json`
  2. `npm run build:gsd` completes without errors (build order: pi-tui/pi-ai/pi-agent-core → pi-coding-agent → agent-core → agent-modes)
  3. `scripts/ensure-workspace-builds.cjs` and `scripts/link-workspace-packages.cjs` include both new packages
  4. `tsc --noEmit` passes from workspace root with the scaffolded (empty) packages in place
**Status**: Complete
**Notes**: SC-4 (tsc --noEmit) has 1 pre-existing TS2307 error in src/cli.ts (@gsd-build/mcp-server) that predates Phase 2 — new packages contribute zero errors. Accepted deviation; to be resolved before Phase 6 VER-02 gate.
**Plans:** 2 plans
Plans:
- [x] 02-01-PLAN.md — Create @gsd/agent-core and @gsd/agent-modes packages (SCAF-01, SCAF-02)
- [x] 02-02-PLAN.md — Wire build chain, update install-time scripts, full build verification, decorator audit (SCAF-03, SCAF-04, SCAF-05, SCAF-06)

### Phase 3: @gsd/agent-modes Extraction
**Goal**: All CLI and run-mode files are moved from `pi-coding-agent` into `@gsd/agent-modes` leaf-first; `pi-coding-agent` contains no remaining `modes/` or `cli/` GSD source files; build passes after each sub-batch.
**Depends on**: Phase 2
**Requirements**: MODES-01, MODES-02, MODES-03, MODES-04, MODES-05, MODES-06, MODES-07, MODES-08
**Success Criteria** (what must be TRUE):
  1. `grep -r "modes\|cli/args\|cli/config\|cli/session\|cli/list\|cli/file\|main\.ts" packages/pi-coding-agent/src/` returns no GSD-authored source files
  2. `tsc --noEmit` passes after each sub-batch commit (cli/, modes/shared/, modes/print/, modes/rpc/, modes/interactive/, main.ts)
  3. `@gsd/agent-modes/src/index.ts` exports exactly the named API: `runInteractiveMode`, `runRpcMode`, `RpcMode`, `runPrintMode`, `RpcClient`, `parseArgs`, `GsdArgs`, `main` (no `export *`)
  4. `npm run build:pi` passes at phase end with all modes files in their new location
**Status**: Complete
**Plans:** 3 plans
Plans:
- [x] 03-01-PLAN.md — Prep tasks (isValidThinkingLevel extraction, theme/ relocation) + cli/ + shared/ + print/ extraction (MODES-01, MODES-02, MODES-03)
- [x] 03-02-PLAN.md — rpc/ + interactive/ extraction leaf-first (MODES-04, MODES-05)
- [x] 03-03-PLAN.md — main.ts extraction + index.ts public API + cleanup + TS error fixes (MODES-06, MODES-07, MODES-08)

### Phase 4: @gsd/agent-core Extraction
**Goal**: All session orchestration files are moved from `pi-coding-agent` into `@gsd/agent-core` leaf-first with `agent-session.ts` last; `pi-coding-agent` contains no remaining GSD session, compaction, bash, system-prompt, or SDK source files.
**Depends on**: Phase 3
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08
**Success Criteria** (what must be TRUE):
  1. `grep -r "blob-store\|artifact-manager\|export-html\|contextual-tips\|image-overflow\|fallback-resolver\|bash-executor\|compaction\|system-prompt\|keybindings\|lifecycle-hooks\|agent-session\|sdk\.ts" packages/pi-coding-agent/src/` returns no GSD-authored source files
  2. `tsc --noEmit` passes after each sub-batch commit (leaf files, bash-executor, compaction/, mid-tier, agent-session.ts, sdk.ts)
  3. `@gsd/agent-core/src/index.ts` exports the named public API with no `export *`: `createAgentSession`, `AgentSession`, `AgentSessionEvent`, `CompactionOrchestrator`, `executeBash`, `executeBashWithOperations`, `BashResult`, `buildSystemPrompt`, `prepareLifecycleHooks`, `runLifecycleHooks`, `ArtifactManager`, `BlobStore` (no `BashExecutor`, `SystemPromptBuilder`, `LifecycleHooks` — these classes do not exist in the source)
  4. `npm run build:pi` passes at phase end with all core files in their new location
**Status**: Complete
**Plans:** 3 plans
Plans:
- [x] 04-01-PLAN.md — Pre-move setup (pi-tui dep, config re-exports) + CORE-01 leaf files + export-html/ extraction
- [x] 04-02-PLAN.md — CORE-02 bash-executor + CORE-03 compaction/ directory extraction
- [x] 04-03-PLAN.md — CORE-04 mid-tier files + CORE-05 agent-session + CORE-06 sdk + CORE-07 index.ts + CORE-08 verification

### Phase 5: Wiring and Boundary Enforcement
**Goal**: The extension loader resolves both new packages in both dev and binary modes; `copy-export-html.cjs` points to the new location; `src/cli.ts` imports are split; and `pi-coding-agent` non-extension source has zero imports from `@gsd/agent-modes`.
**Depends on**: Phase 4
**Requirements**: WIRE-01, WIRE-02, WIRE-03, WIRE-04, WIRE-05
**Success Criteria** (what must be TRUE):
  1. `packages/pi-coding-agent/src/core/extensions/loader.ts` contains static `import * as _bundledGsdAgentCore` and `import * as _bundledGsdAgentModes` at the top level, plus both packages in `STATIC_BUNDLED_MODULES` and `getAliases()`
  2. `grep -r "from.*@gsd/agent-modes" packages/pi-coding-agent/src/ --include="*.ts" | grep -v extensions/` returns zero matches (corrected from original — @gsd/agent-core imports are expected since pi-coding-agent depends on it)
  3. Both loader paths wired (no Bun binary — confirmed dead code path per D-01)
  4. `tsc --noEmit` passes from workspace root after all wiring changes
**Plans:** 1 plan
Plans:
- [ ] 05-01-PLAN.md — WIRE-03 cli.ts import fix + verify all WIRE requirements + close STATE.md blocker + build gate (WIRE-01, WIRE-02, WIRE-03, WIRE-04, WIRE-05)

### Phase 6: Verification and PR
**Goal**: A clean-state build passes end-to-end, all tests pass, the compiled binary behaves correctly, extensions load in both dev and binary modes, and the PR is submitted on `refactor/pi-clean-seam`.
**Depends on**: Phase 5
**Requirements**: VER-01, VER-02, VER-03, VER-04, VER-05, VER-06
**Success Criteria** (what must be TRUE):
  1. `rm -rf packages/*/dist && npm run build:pi` completes without errors from a clean state
  2. `tsc --noEmit` passes from workspace root with zero type errors
  3. `npm run test:unit && npm run test:packages` passes with no regressions
  4. `gsd --version` outputs the correct version from the compiled Bun binary
  5. Export-html end-to-end produces valid HTML from the compiled binary
  6. A GSD extension importing from `@gsd/agent-core` loads and executes correctly in both dev mode (Node.js via `getAliases()`) and binary mode (Bun via `STATIC_BUNDLED_MODULES`)
**Plans:** 3 plans
Plans:
- [ ] 06-01-PLAN.md — TS2307 devDep fix + clean-state build + type-check + test gates (VER-01, VER-02, VER-03)
- [ ] 06-02-PLAN.md — Binary smoke test + export-html + extension loader verification (VER-04, VER-05, VER-06)
- [ ] 06-03-PLAN.md — GitHub issue creation + PR submission with full-depth body

## Requirement Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| PF-01 | Phase 1 | Complete |
| PF-02 | Phase 1 | Complete |
| PF-03 | Phase 1 | Complete |
| PF-04 | Phase 1 | Complete |
| PF-05 | Phase 1 | Complete |
| PF-06 | Phase 1 | Complete |
| SCAF-01 | Phase 2 | Complete |
| SCAF-02 | Phase 2 | Complete |
| SCAF-03 | Phase 2 | Complete |
| SCAF-04 | Phase 2 | Complete |
| SCAF-05 | Phase 2 | Complete |
| SCAF-06 | Phase 2 | Complete |
| MODES-01 | Phase 3 | Complete |
| MODES-02 | Phase 3 | Complete |
| MODES-03 | Phase 3 | Complete |
| MODES-04 | Phase 3 | Complete |
| MODES-05 | Phase 3 | Complete |
| MODES-06 | Phase 3 | Complete |
| MODES-07 | Phase 3 | Complete |
| MODES-08 | Phase 3 | Complete |
| CORE-01 | Phase 4 | Complete |
| CORE-02 | Phase 4 | Complete |
| CORE-03 | Phase 4 | Complete |
| CORE-04 | Phase 4 | Complete |
| CORE-05 | Phase 4 | Complete |
| CORE-06 | Phase 4 | Complete |
| CORE-07 | Phase 4 | Complete |
| CORE-08 | Phase 4 | Complete |
| WIRE-01 | Phase 5 | Pending |
| WIRE-02 | Phase 5 | Pending |
| WIRE-03 | Phase 5 | Pending |
| WIRE-04 | Phase 5 | Pending |
| WIRE-05 | Phase 5 | Pending |
| VER-01 | Phase 6 | Pending |
| VER-02 | Phase 6 | Pending |
| VER-03 | Phase 6 | Pending |
| VER-04 | Phase 6 | Pending |
| VER-05 | Phase 6 | Pending |
| VER-06 | Phase 6 | Pending |

**Coverage:** 35/35 requirements mapped

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pre-Flight | 3/3 | Complete | 2026-04-14 |
| 2. Package Scaffolding | 2/2 | Complete | 2026-04-14 |
| 3. @gsd/agent-modes Extraction | 3/3 | Complete | 2026-04-15 |
| 4. @gsd/agent-core Extraction | 3/3 | Complete | 2026-04-15 |
| 5. Wiring and Boundary Enforcement | 0/1 | Planned | - |
| 6. Verification and PR | 0/3 | Not started | - |
