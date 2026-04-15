# Phase 4: @gsd/agent-core Extraction — Context

**Gathered:** 2026-04-15
**Status:** Ready for planning
**Source:** discuss-phase (interactive)

<domain>
## Phase Boundary

Move all session orchestration files from `packages/pi-coding-agent/src/core/` into `packages/gsd-agent-core/src/`, leaf-first, with `agent-session.ts` last. `pi-coding-agent` ends the phase with zero GSD-authored session orchestration, compaction, bash, system-prompt, or SDK source files.

**In scope:**
- CORE-01: `blob-store.ts`, `artifact-manager.ts`, `export-html/` (4 files + vendor/), `contextual-tips.ts`, `image-overflow-recovery.ts`, `fallback-resolver.ts`
- CORE-02: `bash-executor.ts` + immediate `extensions/types.ts` update
- CORE-03: `compaction/` directory (`compaction-orchestrator.ts`, `compaction/` sub-dir: `compaction.ts`, `branch-summarization.ts`, `utils.ts`, `index.ts`) + immediate `extensions/types.ts` update
- CORE-04: `system-prompt.ts`, `keybindings.ts` (runtime logic only — type-only defs already in `keybindings-types.ts` per PF-04), `lifecycle-hooks.ts`
- CORE-05: `agent-session.ts` last (all its dependencies already moved by this point)
- CORE-06: `sdk.ts`
- CORE-07: Write `@gsd/agent-core/src/index.ts` with exact named public API
- CORE-08: Verify zero remaining files via grep

**NOT moving (stay in pi-coding-agent):** `config.ts`, `auth-storage.ts`, `settings-manager.ts`, `model-registry.ts`, `model-resolver.ts`, `resource-loader.ts`, `session-manager.ts`, `skills.ts`, `slash-commands.ts`, `package-commands.ts`, `package-manager.ts`, `extensions/`, `theme/`, `lsp/`, `tools/`, `keybindings-types.ts`, `constants.ts`, `defaults.ts`, `diagnostics.ts`, `event-bus.ts`, `exec.ts`, `footer-data-provider.ts`, `fs-utils.ts`, `lock-utils.ts`, `messages.ts`, `model-discovery.ts`, `models-json-writer.ts`, `prompt-templates.ts`, `resolve-config-value.ts`, `retry-handler.ts`, `timings.ts`, `thinking-level.ts`, `jsonl.ts`, `local-model-check.ts`, `index.ts`

**Out of scope:** Wiring extension loader, updating `src/cli.ts`, `copy-export-html.cjs` — those are Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Directory Structure
**Mirror pi-coding-agent layout exactly inside `packages/gsd-agent-core/src/`.**
- `compaction/`, `export-html/` subdirectories preserved verbatim
- Relative imports *within* each sub-directory stay unchanged — only cross-package imports need updating
- Rationale: same pattern as Phase 3, minimizes churn

### config.ts Import Strategy
**Keep `config.ts` in pi-coding-agent. Re-export the needed symbols from pi-coding-agent's public `index.ts`. Moved files import via package name.**

- `pi-coding-agent/src/index.ts` adds re-exports for all config symbols needed by moved files: `getAgentDir`, `getDocsPath`, `getExamplesPath`, `getReadmePath`, `getPromptsDir`, `getBlobsDir`, `getSessionsDir`, `CONFIG_DIR_NAME`, `isBunBinary` (and any others discovered during extraction)
- Moved files update `../config.js` to `@gsd/pi-coding-agent` package import
- Same pattern as `theme/` re-export established in Phase 1 — consistent with Phase 3 cross-package import strategy

### Public API — `@gsd/agent-core/src/index.ts`
**Named exports with no `export *` allowed. Verified against actual source files.**

```ts
export { createAgentSession, type CreateAgentSessionOptions, type CreateAgentSessionResult } from "./sdk.js";
export type { AgentSession, AgentSessionEvent } from "./agent-session.js";
export { CompactionOrchestrator } from "./compaction-orchestrator.js";
export { executeBash, executeBashWithOperations, type BashExecutorOptions, type BashResult } from "./bash-executor.js";
export { buildSystemPrompt, type BuildSystemPromptOptions } from "./system-prompt.js";
export { prepareLifecycleHooks, runLifecycleHooks, type PackageLifecycleHooksOptions, type PrepareLifecycleHooksOptions, type LifecycleHooksRunResult, type LifecycleHooksTarget } from "./lifecycle-hooks.js";
export { ArtifactManager } from "./artifact-manager.js";
export { BlobStore, isBlobRef, parseBlobRef, externalizeImageData, resolveImageData, type BlobPutResult } from "./blob-store.js";
```

Note: `createAgentSession` is exported from `sdk.ts` (not `agent-session.ts`). The source files export functions (`executeBash`, `buildSystemPrompt`, `prepareLifecycleHooks`) not classes (`BashExecutor`, `SystemPromptBuilder`, `LifecycleHooks`) — those class names do not exist in the source. `clearQueue()` is an instance method on `AgentSession` — no separate type export needed (resolved from STATE.md concern).

### Sub-Batch Extraction Order and Plan Structure
**3 plans, following CORE requirement order:**

- **Plan 1 (04-01-PLAN.md):** CORE-01 — leaf files + export-html/ (blob-store, artifact-manager, contextual-tips, image-overflow-recovery, fallback-resolver, export-html/). Build gate after.
- **Plan 2 (04-02-PLAN.md):** CORE-02 + CORE-03 — bash-executor + compaction/ + extensions/types.ts updates. Build gate after each sub-batch.
- **Plan 3 (04-03-PLAN.md):** CORE-04 + CORE-05 + CORE-06 + CORE-07 — system-prompt, keybindings, lifecycle-hooks, agent-session, sdk, write index.ts. Build gate after each file. CORE-08 grep verification at end.

Build gate: `tsc --noEmit` passes after each sub-batch before moving to the next.

### Cross-Package Import Strategy (When Moved Files Reference pi-coding-agent)
- `../config.js` → `@gsd/pi-coding-agent` (after re-exports added to pi-coding-agent index)
- Any remaining `./` imports to files staying in pi-coding-agent → `@gsd/pi-coding-agent`
- Intra-package relative imports (within gsd-agent-core) stay as relative `.js` imports
- Phase 3 left some `@gsd/pi-coding-agent` cross-imports in the moved modes files — same pattern applies here

### extensions/types.ts Update Timing
**Immediate after each move that affects it:**
- After CORE-02 (bash-executor.ts moves): confirm `BashResult` is already inlined (PF-03 already did this)
- After CORE-03 (compaction/ moves): confirm `CompactionResult` and `CompactionPreparation` are already inlined (PF-03 already did this)
- These inlines were done in Phase 1 (PF-03), so extensions/types.ts should already be clean — verify and document, don't re-do

### Claude's Discretion
- Exact set of config symbols that need re-exporting from pi-coding-agent index (enumerate from import statements during extraction)
- Whether to add `export-html/` files individually or as a directory re-export in index.ts
- Exact sub-ordering within each plan (leaf files within CORE-01, etc.)
- How to handle any test files co-located with moved source (move them too, or leave them)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture and Scope
- `docs/dev/ADR-010-pi-clean-seam-architecture.md` — Authoritative architecture decision: two-package structure, dependency graph, package specs, why vendoring continues
- `docs/dev/PRD-pi-clean-seam-refactor.md` — Full PRD: goals, success criteria, out-of-scope items

### Requirements
- `.planning/REQUIREMENTS.md` — CORE-01 through CORE-08 (exact acceptance criteria and file lists)
- `.planning/ROADMAP.md` — Phase 4 section (success criteria, sub-batch order, dependency on Phase 3)

### Key source files to move (verify current state before touching)
- `packages/pi-coding-agent/src/core/agent-session.ts` — 2946 lines, most complex file; moves last
- `packages/pi-coding-agent/src/core/compaction-orchestrator.ts` — imports compaction/ subdirectory
- `packages/pi-coding-agent/src/core/compaction/` — directory to move wholesale
- `packages/pi-coding-agent/src/core/export-html/` — directory to move wholesale
- `packages/pi-coding-agent/src/core/sdk.ts` — moves after agent-session
- `packages/pi-coding-agent/src/core/extensions/types.ts` — NOT moving; verify inlines already done (PF-03)

### Destination package
- `packages/gsd-agent-core/package.json` — dependency list; must declare @gsd/pi-coding-agent as dependency
- `packages/gsd-agent-core/tsconfig.json` — compiler settings (Node16, ES2024, strict)
- `packages/gsd-agent-core/src/index.ts` — starts empty (`export {}`), will be written in Plan 3

### Prior phase context
- `.planning/phases/03-gsd-agent-modes-extraction/03-CONTEXT.md` — cross-package import pattern established in Phase 3 (template for Phase 4)
- `.planning/phases/01-pre-flight/01-CONTEXT.md` — PF-03 (extensions/types.ts inlining) and PF-04 (keybindings-types.ts) decisions

### Build scripts
- `scripts/ensure-workspace-builds.cjs` — workspace build order (gsd-agent-core already wired)
- `package.json` → `build:pi` script — build chain for verification
- `packages/pi-coding-agent/src/index.ts` — public API; config symbols must be added here

</canonical_refs>

<specifics>
## Specific Requirements

- `tsc --noEmit` MUST pass after every sub-batch commit — not just at phase end
- `grep -r "blob-store\|artifact-manager\|export-html\|contextual-tips\|image-overflow\|fallback-resolver\|bash-executor\|compaction\|system-prompt\|keybindings\|lifecycle-hooks\|agent-session\|sdk\.ts" packages/pi-coding-agent/src/` must return zero GSD-authored files at phase end
- `@gsd/agent-core/src/index.ts` uses named exports only — no `export *`
- `npm run build:pi` passes at phase end with all core files in their new location
- No changes to extension API surface (`pi-coding-agent/src/core/extensions/` stays untouched)
- config.ts stays in pi-coding-agent — do NOT move it

</specifics>

<deferred>
## Deferred Ideas

- Moving `config.ts` to @gsd/agent-core — rejected in favor of re-exporting from pi-coding-agent index (creates reverse dependency, violates layering)
- Sub-path exports for config (e.g., `@gsd/pi-coding-agent/config`) — more complex, not needed

</deferred>

---

*Phase: 04-gsd-agent-core-extraction*
*Context gathered: 2026-04-15 via discuss-phase*
