# Requirements: GSD 2 — Pi Clean Seam

**Defined:** 2026-04-14
**Core Value:** When a new pi-mono release ships, a maintainer updates the vendored pi packages and fixes type errors only in GSD-owned packages — no file-by-file archaeology required.

## v1 Requirements

### Pre-Flight: Dependency Untangling

Prerequisite work that must be complete before any source files are moved.

- [x] **PF-01**: `agent-session.ts` → `theme` circular dependency is resolved: `theme/` is exported from `@gsd/pi-coding-agent`'s public `index.ts` and both `agent-session.ts` and `interactive-mode.ts` import it from the package
- [x] **PF-02**: `src/web/bridge-service.ts` internal-path imports replaced with package imports (`AgentSessionEvent`/`SessionStateChangeReason` from `@gsd/agent-core`, RPC types from `@gsd/agent-modes`)
- [x] **PF-03**: `extensions/types.ts` type leak resolved: `BashResult`, `CompactionResult`, and `CompactionPreparation` inlined as structural interfaces directly in `extensions/types.ts` (no package cycle introduced)
- [x] **PF-04**: `KeybindingsManager` and `AppAction` dependency from `extensions/types.ts` resolved (option B: extract type-only definitions to `pi-coding-agent/src/core/keybindings-types.ts`)
- [x] **PF-05**: Circular dependency audit run (`madge --circular`) and all cycles resolved before any file moves begin
- [x] **PF-06**: All `.ts` import extension specifiers in files to be moved converted to `.js` (new packages use `allowImportingTsExtensions: false`)

### Package Scaffolding

- [ ] **SCAF-01**: `packages/gsd-agent-core/` created with correct `package.json` (`type: module`, `module: Node16`, dependencies: `@gsd/pi-coding-agent`, `@gsd/pi-agent-core`, `@gsd/pi-ai`), `tsconfig.json` mirroring `pi-coding-agent` settings, and empty `src/index.ts`
- [ ] **SCAF-02**: `packages/gsd-agent-modes/` created with correct `package.json` (`type: module`, `module: Node16`, dependencies: `@gsd/agent-core`, `@gsd/pi-coding-agent`, `@gsd/pi-tui`), `tsconfig.json` mirroring `pi-coding-agent` settings, and empty `src/index.ts`
- [ ] **SCAF-03**: `scripts/ensure-workspace-builds.cjs` updated with `gsd-agent-core` and `gsd-agent-modes` entries after `pi-coding-agent`
- [ ] **SCAF-04**: `scripts/link-workspace-packages.cjs` updated with `gsd-agent-core` and `gsd-agent-modes` package map entries
- [ ] **SCAF-05**: Root `package.json` build scripts updated: `build:agent-core`, `build:agent-modes` added; `build:pi` chain updated to: pi-tui/pi-ai/pi-agent-core (parallel) → pi-coding-agent → agent-core → agent-modes
- [ ] **SCAF-06**: Full build passes (`npm run build:pi`) after scaffolding, before any file moves

### `@gsd/agent-modes` Extraction

All run-mode and CLI files extracted from `pi-coding-agent` into `@gsd/agent-modes`, leaf-first.

- [ ] **MODES-01**: `cli/` directory extracted (args.ts, config-selector.ts, session-picker.ts, list-models.ts, file-processor.ts); build passes after each sub-batch
- [ ] **MODES-02**: `modes/shared/` extracted and imports updated
- [ ] **MODES-03**: `modes/print/` extracted and imports updated
- [ ] **MODES-04**: `modes/rpc/` extracted (server, client, JSON protocol, remote terminal, types); build passes
- [ ] **MODES-05**: `modes/interactive/` sub-components extracted bottom-up (leaf components first, `interactive-mode.ts` last); build passes after each sub-batch
- [ ] **MODES-06**: `main.ts` extracted to `@gsd/agent-modes/src/`
- [ ] **MODES-07**: `@gsd/agent-modes/src/index.ts` declares explicit named public API (no `export *`): `runInteractiveMode`, `runRpcMode`, `RpcMode`, `runPrintMode`, `RpcClient`, `parseArgs`, `GsdArgs`, `main`
- [ ] **MODES-08**: `pi-coding-agent` contains no remaining `modes/` or `cli/` GSD source files (verified by grep)

### `@gsd/agent-core` Extraction

All session orchestration files extracted from `pi-coding-agent` into `@gsd/agent-core`, leaf-first, `agent-session.ts` last.

- [ ] **CORE-01**: Leaf files extracted (blob-store.ts, artifact-manager.ts, export-html/, contextual-tips.ts, image-overflow-recovery.ts, fallback-resolver.ts); build passes after each sub-batch
- [ ] **CORE-02**: `bash-executor.ts` extracted; `extensions/types.ts` updated immediately after (per PF-03)
- [ ] **CORE-03**: `compaction/` directory extracted (orchestrator, branch-summarization, utils); `extensions/types.ts` updated immediately after
- [ ] **CORE-04**: `system-prompt.ts`, `keybindings.ts` (minus type-only defs per PF-04), `lifecycle-hooks.ts` extracted; build passes
- [ ] **CORE-05**: `agent-session.ts` extracted last; all its dependencies already in `@gsd/agent-core`; build passes
- [ ] **CORE-06**: `sdk.ts` extracted; build passes
- [ ] **CORE-07**: `@gsd/agent-core/src/index.ts` declares explicit named public API (no `export *`): `createAgentSession`, `CreateAgentSessionOptions`, `CreateAgentSessionResult`, `AgentSession`, `AgentSessionEvent`, `CompactionOrchestrator`, `executeBash`, `executeBashWithOperations`, `BashExecutorOptions`, `BashResult`, `buildSystemPrompt`, `BuildSystemPromptOptions`, `prepareLifecycleHooks`, `runLifecycleHooks`, `PackageLifecycleHooksOptions`, `PrepareLifecycleHooksOptions`, `LifecycleHooksRunResult`, `LifecycleHooksTarget`, `ArtifactManager`, `BlobStore`, `isBlobRef`, `parseBlobRef`, `externalizeImageData`, `resolveImageData`, `BlobPutResult`
- [ ] **CORE-08**: `pi-coding-agent` contains no remaining session orchestration, compaction, bash, system-prompt, or SDK GSD source files (verified by grep)

### Wiring and Boundary Enforcement

- [ ] **WIRE-01**: `packages/pi-coding-agent/src/core/extensions/loader.ts` updated in a single commit: static top-level `import * as _bundledGsdAgentCore` and `import * as _bundledGsdAgentModes` added; both packages added to `STATIC_BUNDLED_MODULES`; both packages added to `getAliases()` return
- [ ] **WIRE-02**: `copy-export-html.cjs` source path updated to point to `@gsd/agent-core` location (was `pi-coding-agent/src/core/export-html/`)
- [ ] **WIRE-03**: `src/cli.ts` monolithic `@gsd/pi-coding-agent` import split into imports from `@gsd/agent-core`, `@gsd/agent-modes`, and `@gsd/pi-coding-agent` as appropriate
- [ ] **WIRE-04**: `pi-coding-agent` has zero imports from `@gsd/agent-core` or `@gsd/agent-modes` in non-extension source files (verified by grep: `grep -r "from.*@gsd/agent" packages/pi-coding-agent/src/ --include="*.ts" | grep -v extensions/`)
- [ ] **WIRE-05**: Bun binary build command identified; binary builds successfully with new package structure

### Verification

- [ ] **VER-01**: Clean-state build passes: `rm -rf packages/*/dist && npm run build:pi` completes without errors
- [ ] **VER-02**: `tsc --noEmit` passes from workspace root with zero type errors
- [ ] **VER-03**: `npm run test:unit && npm run test:packages` passes with no regressions
- [ ] **VER-04**: `gsd --version` outputs correct version from compiled Bun binary
- [ ] **VER-05**: Export-html end-to-end produces valid HTML from the compiled binary
- [ ] **VER-06**: A GSD extension that imports from `@gsd/agent-core` loads and executes correctly in both dev mode (Node.js, via `getAliases()`) and binary mode (Bun, via `STATIC_BUNDLED_MODULES`)

## Future Requirements

### Pi v0.67.2 Update

- **PI-01**: Deprecated `session_switch` and `session_fork` usage migrated to `session_start` with `reason` field
- **PI-02**: Pi-mono packages updated from 0.57.1 to 0.67.2
- **PI-03**: All type errors introduced by the pi update fixed in `@gsd/agent-core` and `@gsd/agent-modes` only (boundary proven)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Move pi packages to npm (`@mariozechner/pi-*`) | Phase 2: blocked by `@gsd/native` imports, ~50 source modifications, extension API gap |
| Abstraction layer over pi types | Intentionally not an abstraction — GSD code uses pi types directly |
| Upstream GSD modifications to pi-mono | Desirable long-term, out of scope for this milestone |
| Any user-facing CLI behavior changes | Install experience must be identical; zero user-visible change |
| Extension API surface changes | Extension API stays in `@gsd/pi-coding-agent`; authors must not need to change import paths |
| ESLint `import/no-restricted-paths` active enforcement | TypeScript passive enforcement (missing dependency = compile error) is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PF-01 | Phase 1 — Pre-Flight | Satisfied |
| PF-02 | Phase 1 — Pre-Flight | Satisfied |
| PF-03 | Phase 1 — Pre-Flight | Satisfied |
| PF-04 | Phase 1 — Pre-Flight | Satisfied |
| PF-05 | Phase 1 — Pre-Flight | Satisfied (Option A — delta = 0 vs baseline) |
| PF-06 | Phase 1 — Pre-Flight | Satisfied |
| SCAF-01 | Phase 2 — Package Scaffolding | Pending |
| SCAF-02 | Phase 2 — Package Scaffolding | Pending |
| SCAF-03 | Phase 2 — Package Scaffolding | Pending |
| SCAF-04 | Phase 2 — Package Scaffolding | Pending |
| SCAF-05 | Phase 2 — Package Scaffolding | Pending |
| SCAF-06 | Phase 2 — Package Scaffolding | Pending |
| MODES-01 | Phase 3 — @gsd/agent-modes Extraction | Pending |
| MODES-02 | Phase 3 — @gsd/agent-modes Extraction | Pending |
| MODES-03 | Phase 3 — @gsd/agent-modes Extraction | Pending |
| MODES-04 | Phase 3 — @gsd/agent-modes Extraction | Pending |
| MODES-05 | Phase 3 — @gsd/agent-modes Extraction | Pending |
| MODES-06 | Phase 3 — @gsd/agent-modes Extraction | Pending |
| MODES-07 | Phase 3 — @gsd/agent-modes Extraction | Pending |
| MODES-08 | Phase 3 — @gsd/agent-modes Extraction | Pending |
| CORE-01 | Phase 4 — @gsd/agent-core Extraction | Pending |
| CORE-02 | Phase 4 — @gsd/agent-core Extraction | Pending |
| CORE-03 | Phase 4 — @gsd/agent-core Extraction | Pending |
| CORE-04 | Phase 4 — @gsd/agent-core Extraction | Pending |
| CORE-05 | Phase 4 — @gsd/agent-core Extraction | Pending |
| CORE-06 | Phase 4 — @gsd/agent-core Extraction | Pending |
| CORE-07 | Phase 4 — @gsd/agent-core Extraction | Pending |
| CORE-08 | Phase 4 — @gsd/agent-core Extraction | Pending |
| WIRE-01 | Phase 5 — Wiring and Boundary Enforcement | Pending |
| WIRE-02 | Phase 5 — Wiring and Boundary Enforcement | Pending |
| WIRE-03 | Phase 5 — Wiring and Boundary Enforcement | Pending |
| WIRE-04 | Phase 5 — Wiring and Boundary Enforcement | Pending |
| WIRE-05 | Phase 5 — Wiring and Boundary Enforcement | Pending |
| VER-01 | Phase 6 — Verification and PR | Pending |
| VER-02 | Phase 6 — Verification and PR | Pending |
| VER-03 | Phase 6 — Verification and PR | Pending |
| VER-04 | Phase 6 — Verification and PR | Pending |
| VER-05 | Phase 6 — Verification and PR | Pending |
| VER-06 | Phase 6 — Verification and PR | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-14*
*Last updated: 2026-04-14 — traceability populated by roadmapper*
