# ADR-0001: Decomposition of Monolithic Source Files

**Status:** Proposed
**Date:** 2026-03-20
**Author:** Jeremy McSpadden
**Branch:** `adr/monolith-file-split`

---

## Context

A systematic audit of the codebase identified 13 files exceeding 1,000 lines, with the largest reaching 3,780 lines. These files accumulate multiple unrelated responsibilities over time, creating real and compounding costs:

- **Comprehension overhead:** A reviewer must hold 2,000+ lines of context to understand a single change.
- **Test friction:** Private methods on a large class cannot be tested in isolation; each test requires full setup of the monolithic object.
- **Merge conflicts:** High-churn files owned by multiple contributors produce disproportionate conflicts.
- **Refactor risk:** Any change to a file with 10+ distinct concerns has unpredictable blast radius.
- **Onboarding cost:** New contributors face unnecessarily steep learning curves on core systems.

This ADR documents the findings from a deep structural analysis across all candidates, proposes concrete split plans ranked by risk and benefit, and records the decision on how to proceed.

---

## Candidates Analyzed

| File | Lines | Concerns | Risk | Priority |
|------|------:|---------|------|----------|
| `packages/pi-coding-agent/src/modes/interactive/interactive-mode.ts` | 3,780 | 13 | MEDIUM | P1 |
| `packages/pi-coding-agent/src/core/agent-session.ts` | 2,862 | 15 | MEDIUM-HIGH | P2 |
| `packages/pi-tui/src/components/editor.ts` | 2,138 | 10 | MEDIUM | P1 |
| `src/resources/extensions/gsd/auto-loop.ts` | 1,892 | 11 | MEDIUM | P2 |
| `packages/pi-coding-agent/src/core/package-manager.ts` | 1,795 | 7 | MEDIUM | P2 |
| `packages/pi-coding-agent/src/core/session-manager.ts` | 1,642 | 8 | MEDIUM-HIGH | P3 |
| `src/resources/extensions/gsd/auto-prompts.ts` | 1,621 | 10 | LOW | P1 |
| `src/resources/extensions/gsd/guided-flow.ts` | 1,455 | 9 | HIGH | P3 |
| `packages/pi-coding-agent/src/core/extensions/types.ts` | 1,404 | 14 | HIGH | P3 |
| `src/resources/extensions/gsd/export-html.ts` | 1,408 | 8 | LOW-MEDIUM | P1 |
| `src/resources/extensions/gsd/auto.ts` | 1,332 | 12 | HIGH | P3 |
| `src/resources/extensions/subagent/index.ts` | 1,281 | 10 | MEDIUM-HIGH | P2 |
| `src/resources/extensions/gsd/visualizer-views.ts` | 1,229 | 11 | LOW | P0 |
| `src/resources/extensions/browser-tools/core.ts` | 1,196 | 10 | LOW-MEDIUM | P1 |
| `src/resources/extensions/gsd/files.ts` | 1,153 | 9 | LOW-MEDIUM | P1 |
| `src/resources/extensions/gsd/native-git-bridge.ts` | 1,078 | 7 | LOW-MEDIUM | P1 |
| `src/resources/extensions/gsd/auto-worktree.ts` | 1,003 | — | — | Backlog |

**Total analyzed:** ~27,000 lines across 17 files
**Excluded from analysis:** `packages/pi-ai/src/models.generated.ts` (14,301 lines — auto-generated, do not edit)

---

## Decision

**Proceed with a phased, risk-ordered decomposition.**

Each file is split into focused modules using an incremental approach:
1. Extract pure utility functions and type definitions first (lowest risk).
2. Extract stateless domain modules next.
3. Refactor stateful orchestrators last, after downstream modules stabilize.

Splits are delivered as independent PRs — one per file or logical group — each with full test coverage and CI green before merge.

**Not in scope:** Architectural redesign, new abstractions, or behavioral changes. Splits are pure refactors: no behavior changes, no new features.

---

## Split Plans

### Phase 1 — Low Risk, High Reward (Start Here)

#### 1.0 `visualizer-views.ts` → 11 modules (LOW risk) — Best first PR

**Why first:** 10 of 11 views are fully standalone. Pure rendering functions with no shared mutable state. Zero breaking changes with barrel re-export.

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `visualizer-formatters.ts` | `formatCompletionDate`, `sliceLabel`, `shortenModel`, `findVerification` shared helper | 25 |
| `visualizer-progress-view.ts` | `renderProgressView` + heatmap | 130 |
| `visualizer-deps-view.ts` | `renderDepsView` | 60 |
| `visualizer-metrics-view.ts` | `renderMetricsView` + `renderCostProjections` | 119 |
| `visualizer-timeline-view.ts` | `renderTimelineView` (Gantt + list dispatcher) | 119 |
| `visualizer-agent-view.ts` | `renderAgentView` | 99 |
| `visualizer-changelog-view.ts` | `renderChangelogView` | 62 |
| `visualizer-export-view.ts` | `renderExportView` | 21 |
| `visualizer-knowledge-view.ts` | `renderKnowledgeView` | 59 |
| `visualizer-captures-view.ts` | `renderCapturesView` | 56 |
| `visualizer-health-view.ts` | `renderHealthView` (largest single view) | 180 |
| `visualizer-views.ts` *(revised)* | Barrel re-export only | 40 |

**Key risk:** `findVerification` helper is shared by progress + changelog views — extract to `visualizer-formatters.ts` before splitting those two.
**Breaking changes:** None with barrel re-export.

---

#### 1.1 `auto-prompts.ts` → 15 modules (LOW risk)

**Why first:** Pure async functions with no shared mutable state. No circular dependency risk. Hierarchical import structure is natural.

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `auto-file-inlining.ts` | File loading and DB-aware formatting for prompts | 190 |
| `auto-skill-activation.ts` | Skill matching, preference resolution, activation block building | 210 |
| `auto-prompt-sections.ts` | Reusable section builders: resume, carry-forward, excerpt | 170 |
| `auto-milestone-prompts.ts` | 5 milestone-level prompt builders | 480 |
| `auto-slice-prompts.ts` | 4 slice-level prompt builders | 540 |
| `auto-task-prompts.ts` | Task and reactive-execute prompt builders | 245 |
| `auto-prompt-context.ts` | Context aggregators, gating logic (`checkNeedsReassessment`, etc.) | 190 |
| `auto-prompts.ts` *(revised)* | Re-exports only | 70 |

**Import hierarchy:** `auto-prompt-context` → `auto-file-inlining` / `auto-skill-activation` / `auto-prompt-sections` → milestone/slice/task builders → `auto-prompts.ts` re-exports.
**Risk mitigations:** No mutable state to thread. Mock filesystem for unit tests on each builder independently.

---

#### 1.2 `export-html.ts` → 21 modules (LOW-MEDIUM risk)

**Key insight:** 1,271 of the 1,408 lines are embedded CSS/JS constants. Extract the assets first; the logic is only ~137 lines.

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `primitives/styles.ts` | Embedded CSS constant — extract first | 1,280 |
| `primitives/scripts.ts` | Embedded JS constant | 80 |
| `primitives/html-utils.ts` | `esc`, `section`, `kvi`, `hRow`, `shortModel`, `truncStr`, `formatDateLong` | 30 |
| `charts/chart-builders.ts` | `buildBarChart`, `BarEntry`, `CHART_COLORS` | 40 |
| `charts/cost-chart.ts` | `buildCostOverTimeChart` | 50 |
| `charts/budget-chart.ts` | `buildBudgetBurndown` | 35 |
| `charts/gantt-chart.ts` | `buildSliceGantt` | 65 |
| `charts/token-chart.ts` | `buildTokenBreakdown` | 30 |
| `sections/summary-section.ts` | `buildSummarySection` + sub-builders | 90 |
| `sections/blockers-section.ts` | `buildBlockersSection` | 35 |
| `sections/health-section.ts` | `buildHealthSection` | 100 |
| `sections/progress-section.ts` | `buildProgressSection` + `buildSliceRow` | 90 |
| `sections/depgraph-section.ts` | `buildDepGraphSection` + SVG DAG | 125 |
| `sections/metrics-section.ts` | `buildMetricsSection` (calls charts) | 60 |
| `sections/timeline-section.ts` | `buildTimelineSection` | 45 |
| `sections/changelog-section.ts` | `buildChangelogSection` | 35 |
| `sections/knowledge-section.ts` | `buildKnowledgeSection` | 30 |
| `sections/captures-section.ts` | `buildCapturesSection` | 30 |
| `sections/stats-section.ts` | `buildStatsSection` | 30 |
| `sections/discussion-section.ts` | `buildDiscussionSection` | 20 |
| `export-html.ts` *(revised)* | Orchestrator: `generateHtmlReport` + `HtmlReportOptions` | 80 |

**Execution order:** Extract `styles.ts` and `scripts.ts` first (mechanical, zero logic). Then `html-utils.ts`. Then charts (no dependencies). Then sections (depend on charts + utils). Orchestrator last.

---

#### 1.3 `browser-tools/core.ts` → 15 modules (LOW-MEDIUM risk)

**Why early:** Every concern is orthogonal. Most functions are pure with no shared state. Ideal for demonstrating the split pattern.

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `timeline.ts` | ActionTimeline CRUD (bounded circular buffer) | 100 |
| `state-diff.ts` | DOM state comparison and change categorization | 100 |
| `threshold-utils.ts` | String matching, threshold parsing (`>=5`, `<3`) | 50 |
| `assertions.ts` | 26-assertion evaluation engine | 220 |
| `wait-conditions.ts` | Wait condition validation + DOM stability script | 70 |
| `page-registry.ts` | Multi-page tracker CRUD | 100 |
| `batch-runner.ts` | Sequential step execution with bounded log | 45 |
| `snapshot-modes.ts` | DOM serialization strategy constants | 70 |
| `dom-fingerprint.ts` | SHA256 content hash + structural signature | 35 |
| `diagnostics.ts` | Timeline formatting, failure hypothesis, session summary | 160 |
| `index.ts` *(revised)* | Re-exports only | 20 |

**Risk mitigations:** All modules are standalone; no cross-module imports except `assertions.ts` → `threshold-utils.ts` and `diagnostics.ts` → `timeline.ts`. Zero global state.

---

#### 1.4 `files.ts` → 14 modules (LOW-MEDIUM risk)

**Known bug:** Module-level parse cache persists across tests — `clearParseCache()` must be called in test teardown. Extracting `cache.ts` first isolates and documents this footgun.

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `markdown-helpers.ts` | `extractSection`, `parseBullets`, `extractBoldField` — extract first | 60 |
| `file-io.ts` | `loadFile`, `saveFile` | 25 |
| `cache.ts` | `cachedParse`, `clearParseCache` — isolates the mutable parse cache | 30 |
| `roadmap-parser.ts` | Roadmap + boundary map parsing | 90 |
| `secrets-manifest.ts` | Secrets parse/format + manifest status | 70 |
| `task-plan-parser.ts` | Task plan + must-haves + I/O extraction | 150 |
| `summary-parser.ts` | Summary frontmatter + body | 100 |
| `continue.ts` | Continue parse/format | 100 |
| `requirement-counts.ts` | Status count extraction | 30 |
| `must-have-matcher.ts` | Pure matching algorithm (`COMMON_WORDS` + logic) | 60 |
| `uat-type.ts` | UAT type extraction | 40 |
| `context-parser.ts` | `depends_on` + prior milestone context | 30 |
| `overrides.ts` | Override append/load/format | 100 |
| `files.ts` *(revised)* | Barrel facade — all existing imports unchanged | 40 |

**Additional issues to fix during split:**
- `appendKnowledge` has 3 duplicate template blocks (rule/pattern/lesson) — consolidate.
- 4 native-parser fallback patterns are repeated — extract shared error-wrapper.

---

#### 1.5 `native-git-bridge.ts` → 14 modules (LOW-MEDIUM risk)

**Key risk:** `_hasChangesCachedResult` is mutable module-level state. Must stay paired with `nativeHasChanges` in the same file — do not separate them.

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `git-types.ts` | 7 interfaces — extract first | 50 |
| `native-module-loader.ts` | Feature flag + `loadNative()` | 70 |
| `git-exec.ts` | `gitExec()`, `gitFileExec()` fallbacks | 40 |
| `git-read-cache.ts` | `nativeHasChanges` + `_hasChangesCachedResult` mutable state (must stay paired) | 40 |
| `git-read-basic.ts` | 6 basic read operations | 50 |
| `git-read-diff.ts` | 6 diff operations | 120 |
| `git-read-log.ts` | Log + batch info | 60 |
| `git-read-list.ts` | Worktree/branch/file listing | 80 |
| `git-write-stage.ts` | Stage ops with custom error handling | 70 |
| `git-write-commit.ts` | Complex dual-fallback commit | 50 |
| `git-write-merge.ts` | Merge/checkout ops | 90 |
| `git-write-branch.ts` | Branch delete/reset/rm | 50 |
| `git-write-worktree.ts` | Worktree add/remove/prune | 60 |
| `git-write-revert.ts` | Revert + `updateRef` | 50 |
| `native-git-bridge.ts` *(revised)* | Barrel export only | 50 |

**Execution order:** `git-types.ts` → `native-module-loader.ts` → `git-exec.ts` → `git-read-cache.ts` → all read modules → all write modules.

---

#### 1.6 `editor.ts` → 9 modules (MEDIUM risk)

**Key concern:** Editor state (`EditorState`) is mutable and shared. Layout cache invalidation must happen at the right boundaries. Split modules pass state explicitly rather than closing over it.

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `editor-layout.ts` | Word-wrap engine, visual line map, sticky column | 230 |
| `editor-text-ops.ts` | Character insertion, backspace, forward-delete, newline | 190 |
| `editor-cursor.ts` | Line/word/page navigation, cursor validation | 210 |
| `editor-word-ops.ts` | Word-boundary deletion and movement, grapheme-aware | 165 |
| `editor-undo.ts` | Undo stack snapshots and replay | 65 |
| `editor-kill-ring.ts` | Kill ring, yank, yank-pop | 120 |
| `editor-history.ts` | Command history navigation | 75 |
| `editor-paste.ts` | Bracketed paste buffering, marker insertion/restoration | 95 |
| `editor-autocomplete.ts` | Provider integration, debounced suggestions, SelectList | 280 |
| `editor.ts` *(revised)* | Main class: render, getText/setText, lifecycle | 170 |

**Risk mitigations:**
- `textVersion` increment and `emitChange()` must be called consistently by all state-mutating ops — enforce via a single `mutate()` wrapper on main class.
- Layout cache invalidation locked to `editor.ts` main class.
- Undo snapshots capture complete state before delegating to submodules.
- Test: Fuzz the text-ops module independently with state fixtures.

---

### Phase 2 — Medium Risk (After Phase 1 Stable)

#### 2.1 `interactive-mode.ts` → 9 modules (MEDIUM risk)

The `InteractiveMode` class handles the full TUI lifecycle. Split into domain-focused controllers; `interactive-mode.ts` becomes a thin orchestrator.

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `ui-controller.ts` | TUI component lifecycle, container hierarchy, theme init | 150 |
| `input-controller.ts` | Editor state, autocomplete setup, key bindings, bash mode | 400 |
| `chat-renderer.ts` | Message-to-component conversion, streaming state, tool tracking | 350 |
| `extension-ui-renderer.ts` | Extension widget lifecycle, custom components, dialog management | 380 |
| `modal-dialogs.ts` | All selector components: model, OAuth, session, theme | 480 |
| `resource-display.ts` | Resource listing, path formatting, diagnostic rendering | 280 |
| `compaction-state-ui.ts` | Compaction/retry UI state, queue visualization | 200 |
| `bash-execution-ui.ts` | Bash command flow, component lifecycle, image paste | 200 |
| `theme-and-settings.ts` | Theme/settings integration, startup messaging | 250 |
| `interactive-mode.ts` *(revised)* | Orchestration only: constructor, event loop, delegation | 310 |

**Risk mitigations:**
- `AgentSession` remains a one-way dependency from `interactive-mode.ts` — preserve this.
- `extension-ui-renderer.ts` and `extension-bindings.ts` (from agent-session split) need a shared interface contract defined before either is split.
- Each new controller receives dependencies via constructor injection, not direct imports of the parent class.

---

#### 2.2 `package-manager.ts` → 5 modules (MEDIUM risk)

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `source-parser.ts` | NPM/Git/local source parsing, identity generation, deduplication | 170 |
| `npm-manager.ts` | NPM install/uninstall, version checking, registry interaction | 220 |
| `git-manager.ts` | Git clone/fetch/checkout, cleanup, post-install npm deps | 165 |
| `resource-discovery.ts` | Auto-discovery, manifest reading, ancestor agent skill dirs | 240 |
| `resource-filter.ts` | Glob pattern matching, force-include/exclude, enablement | 155 |
| `package-manager.ts` *(revised)* | Public API, settings integration, resolution orchestration | 275 |

**Risk mitigations:**
- `GitSource` and `NpmSource` types must be defined in `source-parser.ts` and imported by both `npm-manager.ts` and `git-manager.ts` — not duplicated.
- `runCommand`/`spawn` logic used by both npm and git managers → extract to shared `subprocess.ts` utility.
- Accumulator object in `resolve()` stays in main `package-manager.ts`; sub-modules receive it via parameter, never own it.

---

#### 2.3 `auto-loop.ts` → 5 modules (MEDIUM risk)

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `auto-stuck-detection.ts` | Stuck detection: same-error, same-unit-3x, oscillation A↔B | 80 |
| `auto-loop-phases.ts` | 4 phase functions: `runPreDispatch`, `runDispatch`, `runExecution`, `runFinalize` | 1,100 |
| `auto-loop-terminal.ts` | Terminal condition handlers, `closeoutAndStop`, milestone report | 200 |
| `auto-loop-promise-state.ts` | `_currentResolve`, `_sessionSwitchInFlight`, resolver management | 70 |
| `auto-loop-guards.ts` | Budget threshold enforcement, resource staleness, health gate | 100 |
| `auto-loop.ts` *(revised)* | Main loop orchestration, `LoopDeps` type, `IterationContext`, re-exports | 450 |

**Risk mitigations:**
- `LoopDeps` and `IterationContext` stay in `auto-loop.ts` as the shared type contract — do not scatter.
- Extract `auto-stuck-detection.ts` first as a standalone unit with isolated tests.
- Phase extraction is done one phase at a time (`runFinalize` → `runExecution` → `runDispatch` → `runPreDispatch`), with full regression coverage before each step.

---

#### 2.4 `guided-flow.ts` → 4 modules (MEDIUM risk)

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `auto-start-state.ts` | Pending auto-mode stashing, lifecycle gates | 110 |
| `discuss-flow-builder.ts` | Discuss prompt construction, slice context loading | 300 |
| `prompt-dispatch.ts` | Workflow dispatch, model resolution, template compilation | 165 |
| `recovery.ts` | Crash lock handling, runtime record self-healing | 75 |
| `smart-entry.ts` *(revised)* | UI routing orchestrator — calls all above | 550 |

---

#### 2.5 `subagent/index.ts` → 8 modules (MEDIUM-HIGH risk)

| New Module | Responsibility | Est. Lines |
|-----------|---------------|----------:|
| `process-lifecycle.ts` | SIGTERM/SIGKILL graceful shutdown, live process tracking | 40 |
| `output-formatting.ts` | Usage stats, tool call formatting, message display | 160 |
| `subprocess-utils.ts` | Concurrency control, temp files, file polling, event parsing | 120 |
| `subprocess-executor.ts` | Single agent spawn + capture, signal handling | 140 |
| `cmux-executor.ts` | Tmux split execution path | 130 |
| `subagent-params.ts` | Typebox schemas for tool parameters | 50 |
| `subagent-handler.ts` | `execute()` + mode orchestration (single/parallel/chain) | 350 |
| `subagent-renderer.ts` | `renderCall()` + `renderResult()` for all modes | 280 |
| `index.ts` *(revised)* | Extension registration, command handler, thin imports | 50 |

**Risk mitigations:**
- `execute()` has 3 modes × 2 execution paths × approval flows — do not split modes into separate files; keep them as functions within `subagent-handler.ts`.
- Rendering modes (single/parallel/chain) are conditionally branched — keep unified in `subagent-renderer.ts` to avoid duplication.

---

### Phase 3 — High Risk (Defer Until Codebase Stabilizes)

#### 3.1 `agent-session.ts` — Split deferred

`AgentSession` is the central business logic layer, shared across all run modes. Its 12 identified concerns have real interdependencies (event system ↔ prompting ↔ extension bindings ↔ model management). Circular import risks are real. Recommend deferring until:
- The `interactive-mode.ts` split (Phase 2.1) ships and stabilizes.
- A shared interface layer between `interactive-mode` and `agent-session` is established.
- Integration tests for all session-switching, compaction, and pause-resume flows are in place.

Proposed split (when ready): 12 modules — `session-events.ts`, `message-queue.ts`, `skill-system.ts`, `prompt-management.ts`, `tool-registry.ts`, `extension-bindings.ts`, `model-management.ts`, `thinking-level.ts`, `prompting.ts`, `bash-execution.ts`, `session-operations.ts`, `compaction-retry.ts`.

#### 3.2 `session-manager.ts` — Split deferred

Session persistence, tree operations, and entry appending are tightly coupled via `_appendEntry` → `_persist` → `_buildIndex` synchronization. Leaf pointer consistency must be maintained across branching, appending, and tree modules. Defer until dedicated integration test harness for session files (JSONL round-trip, migration paths, blob externalization) is in place.

#### 3.3 `extensions/types.ts` — Namespace pattern recommended over file split

This is a pure type definition file for the extension public API. Splitting into 13 files creates circular import risk (`ExtensionAPI` references event types which reference result types which reference `ExtensionAPI`). **Recommended approach:** Introduce TypeScript `namespace` grouping within the file, or create an `index.ts` re-export facade over logically grouped internal files, keeping the public API contract stable. Do not split until a consumer impact analysis on all extensions is complete.

#### 3.4 `auto.ts` — Highest risk, defer

`buildLoopDeps()` is a 110-line dependency factory with 100+ fields — it is co-evolved with `auto-loop.ts` and should not be extracted until the loop phases are stable. The 10-phase `stopAuto()` shutdown and the pause/resume state machine are runtime-critical paths. Any refactor here risks breaking pause/resume behavior across sessions. Defer until full regression harness for auto-mode lifecycle exists.

---

## Execution Rules

1. **One PR per file split.** No bundling multiple file splits into a single PR.
2. **Tests first.** For any module extracted from a monolith, write unit tests for that module's public API before the PR is opened. Existing tests must not regress.
3. **No behavior changes.** If a split requires a behavior change to work, it is not a split — open a separate PR for the behavior change first.
4. **No new abstractions.** Splitting is file-level reorganization. Do not introduce new base classes, factories, registries, or DI containers as part of this work.
5. **Phased order is strict.** Phase 1 must be merged and stable before Phase 2 begins. Phase 2 before Phase 3.
6. **RFC required for Phase 3.** The `agent-session.ts` and `auto.ts` splits must have a separate RFC with interface contracts reviewed before code is written.

---

## Alternatives Considered

### Alt A: Do nothing
**Rejected.** Files continue to grow. Merge conflict rate increases. Review cost compounds. The 3,780-line `interactive-mode.ts` already shows the ceiling.

### Alt B: Full rewrite
**Rejected.** Rewrites introduce behavioral regressions, require complete test coverage from scratch, and carry high schedule risk. Incremental splitting preserves existing behavior.

### Alt C: Barrel file extraction only (export re-grouping without moving logic)
**Rejected.** Does not reduce cognitive load for contributors working inside each file. A 3,000-line file with barrel imports is still a 3,000-line file.

### Alt D: Split `extensions/types.ts` first
**Rejected.** `types.ts` is the highest-risk candidate (14 concerns, HIGH risk of circular imports). It is the worst starting point. Starting with pure-function files (`auto-prompts.ts`, `browser-tools/core.ts`) builds confidence and tooling before touching critical type infrastructure.

---

## Consequences

### Positive
- Individual modules become independently testable with minimal setup.
- PR reviewers can reason about a single concern at a time.
- Onboarding contributors can understand one module without reading thousands of lines.
- Merge conflicts reduce as unrelated concerns no longer share the same file.

### Negative / Accepted Trade-offs
- More files to navigate for developers used to the monolithic layout. Mitigated by consistent naming conventions (file-name reflects single responsibility).
- Import counts increase in the short term. Acceptable — TypeScript tree-shaking handles this; runtime impact is zero.
- Phase 3 splits (`agent-session.ts`, `auto.ts`) remain as long-term work items until test infrastructure matures.

---

## Appendix: File-by-File Concern Inventory

### `interactive-mode.ts` — 13 Concerns
TUI lifecycle, editor management, chat rendering, user interaction, extension UI, status/notifications, session navigation, model/thinking-level management, resource display, settings UI, compaction/retry UI, theme management, event subscription.

### `agent-session.ts` — 15 Concerns
Agent lifecycle, event subscription/emission, message queue, skill management, prompt/template expansion, system prompt building, tool registry, extension integration, model management, thinking level management, queue mode management, bash execution, compaction, retry logic, session operations/export.

### `editor.ts` — 10 Concerns
Text state management, rendering/layout, input handling, undo/redo, kill ring, history navigation, paste handling, autocomplete, submit/reset, grapheme segmentation.

### `auto-loop.ts` — 11 Concerns
Loop backbone, unit execution, promise management, stuck detection, phase pipeline (5 phases), milestone transitions, terminal conditions, budget thresholds, recovery mechanisms, type definitions, module constants.

### `package-manager.ts` — 7 Concerns
Source parsing/resolution, NPM management, Git management, resource collection/discovery, resource filtering, settings integration, progress/error handling.

### `session-manager.ts` — 8 Concerns
Session lifecycle, entry appending, tree navigation, branching operations, context building, persistence/file I/O, state indexing, utility functions.

### `auto-prompts.ts` — 10 Concerns
Milestone prompts, slice prompts, task prompts, file inlining, skill activation, section builders, context aggregators, markdown utilities, preamble capping, source file paths.

### `guided-flow.ts` — 9 Concerns
Auto-start state machine, prompt building/dispatch, project bootstrap, headless milestone creation, discuss flow, smart entry wizard, milestone actions submenu, runtime record healing, helper utilities.

### `extensions/types.ts` — 14 Concerns
UI primitives, context/metadata, tool definition, session lifecycle events, agent lifecycle events, model selection events, user input events, tool call/result events, event results, message rendering, command registration, provider/model configuration, extension factory/loading, ExtensionAPI interface.

### `auto.ts` — 12 Concerns
Session state container, auto-mode public API, state machine initialization, session lock management, dependency injection (buildLoopDeps), preconditions/cleanup, lifecycle management, progress widget updates, model/supervision delegation, dashboard/cmux integration, worktree isolation, constants.

### `subagent/index.ts` — 10 Concerns
Process lifecycle, output rendering/formatting, concurrency control, temp file construction, event parsing, file polling, single agent execution, cmux split execution, tool parameters, extension registration.

### `browser-tools/core.ts` — 10 Concerns
Action timeline, state diffing, string/threshold matching, assertion evaluation, wait/polling conditions, page registry, batch execution, snapshot modes, DOM hashing, timeline formatting/diagnostics.
