# Monolith Split Analysis
# GSD-2 — Codebase-wide file decomposition plan
# Date: 2026-03-20

## Overview

10 agents analyzed the top 10 largest production source files (all 1000+ lines).
Total source under analysis: ~13,200 lines across 10 files.

---

## Priority Matrix

| File | Lines | New Files | Residual | Risk | Priority |
|------|-------|-----------|----------|------|----------|
| `visualizer-views.ts` | 1229 | 11 | ~40 (barrel) | **Low** | P0 — Start here |
| `browser-tools/core.ts` | 1196 | 15 | ~50 (barrel) | **Low** | P0 |
| `files.ts` | 1153 | 14 | ~40 (barrel) | Low-Med | P1 |
| `native-git-bridge.ts` | 1078 | 15 | ~50 (barrel) | Low-Med | P1 |
| `export-html.ts` | 1408 | 21 | ~80 | Low-Med | P1 |
| `auto-prompts.ts` | 1621 | 15 | ~50 (barrel) | Medium | P2 |
| `auto.ts` | 1332 | 8 | ~850 | Medium | P2 |
| `subagent/index.ts` | 1281 | 25+ | ~400 | Medium | P2 |
| `auto-loop.ts` | 1892 | 12 | ~150 | Medium | P2 |
| `guided-flow.ts` | 1455 | 12+ | ~200 | **High** | P3 — Last |

---

## File-by-File Split Plans

---

### 1. `visualizer-views.ts` (1229 lines) — P0

**Verdict:** Cleanest split in the codebase. 10 of 11 views are fully standalone.

**Split plan:**
```
src/resources/extensions/gsd/
├── visualizer-formatters.ts    (~25)  formatCompletionDate, sliceLabel, shortenModel
├── visualizer-progress-view.ts (~130) ProgressFilter, renderProgressView (keep heatmap inside)
├── visualizer-deps-view.ts     (~60)  renderDepsView
├── visualizer-metrics-view.ts  (~119) renderMetricsView + renderCostProjections
├── visualizer-timeline-view.ts (~119) renderTimelineView (Gantt + list dispatcher)
├── visualizer-agent-view.ts    (~99)  renderAgentView
├── visualizer-changelog-view.ts (~62) renderChangelogView
├── visualizer-export-view.ts   (~21)  renderExportView
├── visualizer-knowledge-view.ts (~59) renderKnowledgeView
├── visualizer-captures-view.ts (~56)  renderCapturesView
├── visualizer-health-view.ts   (~180) renderHealthView (largest single view)
└── visualizer-views.ts         (~40)  barrel re-export only
```
**Key risk:** `findVerification` helper shared by progress + changelog — extract to formatters.
**Breaking changes:** None with barrel re-export.

---

### 2. `browser-tools/core.ts` (1196 lines) — P0

**Verdict:** Pure DAG structure — no circular dependencies possible. Very clean.

**Split plan:**
```
src/resources/extensions/browser-tools/
├── types.ts             (~160) 17 interfaces — extract first
├── timeline.ts          (~75)  Timeline CRUD
├── diff.ts              (~95)  Compact state diffing
├── page-registry.ts     (~100) Multi-tab management
├── fingerprint.ts       (~35)  Content/structural hashing
├── snapshot-modes.ts    (~65)  7 filter mode configs
├── predicates.ts        (~60)  Text matching, threshold parsing
├── shared-helpers.ts    (~40)  summarizeActionStatus, uniqueStrings, etc.
├── wait-validation.ts   (~60)  Wait condition spec & validation
├── wait-scripts.ts      (~25)  DOM stability script gen
├── assertions.ts        (~220) 18+ assertion evaluators
├── timeline-format.ts   (~80)  Human-readable timeline formatting
├── failure-hypothesis.ts (~80) Failure signal analysis
├── session-summary.ts   (~105) Session aggregation
├── batch.ts             (~40)  Bounded FIFO + batch runner
└── core.ts              (~50)  barrel index.ts re-export
```
**Execution order:** types → shared-helpers → predicates → (everything else) → assertions/session-summary
**Key risk:** `getEntriesSince()` depends on `findAction()` from timeline — refactor to pass resolver fn.

---

### 3. `files.ts` (1153 lines) — P1

**Verdict:** Monolithic parser/formatter. 9 distinct format domains, all separable.

**Split plan:**
```
src/resources/extensions/gsd/
├── markdown-helpers.ts    (~60)  extractSection, parseBullets, extractBoldField — extract first
├── file-io.ts             (~25)  loadFile, saveFile
├── cache.ts               (~30)  cachedParse, clearParseCache
├── roadmap-parser.ts      (~90)  Roadmap + boundary map parsing
├── secrets-manifest.ts    (~70)  Secrets parse/format + manifest status
├── task-plan-parser.ts    (~150) Task plan + must-haves + I/O extraction
├── summary-parser.ts      (~100) Summary frontmatter + body
├── continue.ts            (~100) Continue parse/format
├── requirement-counts.ts  (~30)  Status count extraction
├── must-have-matcher.ts   (~60)  Pure matching algorithm (COMMON_WORDS + logic)
├── uat-type.ts            (~40)  UAT type extraction
├── context-parser.ts      (~30)  depends_on + prior milestone context
├── overrides.ts           (~100) Override append/load/format
└── files.ts               (~40)  barrel facade (all existing imports unchanged)
```
**Notable issues found:**
- Module-level parse cache persists across tests — `clearParseCache()` must be called
- `appendKnowledge` has 3 duplicate template blocks (rule/pattern/lesson) — DRY violation
- 4 native-parser fallback patterns repeated — candidate for decorator abstraction

---

### 4. `native-git-bridge.ts` (1078 lines) — P1

**Verdict:** Systematic read/write domain split. 56 exports (7 types + 49 functions).

**Split plan:**
```
src/resources/extensions/gsd/
├── git-types.ts               (~50)  7 interfaces — extract first
├── native-module-loader.ts    (~70)  Feature flag + loadNative()
├── git-exec.ts                (~40)  gitExec(), gitFileExec() fallbacks
├── git-read-cache.ts          (~40)  nativeHasChanges + mutable cache state (isolate!)
├── git-read-basic.ts          (~50)  6 basic read ops
├── git-read-diff.ts           (~120) 6 diff ops
├── git-read-log.ts            (~60)  Log + batch info
├── git-read-list.ts           (~80)  Worktree/branch/file listing
├── git-write-stage.ts         (~70)  Stage ops with custom error handling
├── git-write-commit.ts        (~50)  Complex dual-fallback commit
├── git-write-merge.ts         (~90)  Merge/checkout ops
├── git-write-branch.ts        (~50)  Branch delete/reset/rm
├── git-write-worktree.ts      (~60)  Worktree add/remove/prune
├── git-write-revert.ts        (~50)  Revert + updateRef
└── native-git-bridge.ts       (~50)  barrel export only
```
**Key risk:** `_hasChangesCachedResult` mutable state must stay paired with `nativeHasChanges` in `git-read-cache.ts`.

---

### 5. `export-html.ts` (1408 lines) — P1

**Verdict:** 2 exports, 28 internal functions, 1271 lines of embedded CSS.

**Split plan:**
```
src/resources/extensions/gsd/
├── primitives/
│   ├── html-utils.ts    (~30)  esc, section, kvi, hRow, shortModel, truncStr, formatDateLong
│   ├── styles.ts        (~1280) CSS constant — extract first
│   └── scripts.ts       (~80)  JS constant
├── charts/
│   ├── chart-builders.ts (~40) buildBarChart, BarEntry, CHART_COLORS
│   ├── cost-chart.ts    (~50)  buildCostOverTimeChart
│   ├── budget-chart.ts  (~35)  buildBudgetBurndown
│   ├── gantt-chart.ts   (~65)  buildSliceGantt
│   └── token-chart.ts   (~30)  buildTokenBreakdown
├── sections/
│   ├── summary-section.ts   (~90)  buildSummarySection + sub-builders
│   ├── blockers-section.ts  (~35)  buildBlockersSection
│   ├── health-section.ts    (~100) buildHealthSection
│   ├── progress-section.ts  (~90)  buildProgressSection + buildSliceRow
│   ├── depgraph-section.ts  (~125) buildDepGraphSection + SVG DAG
│   ├── metrics-section.ts   (~60)  buildMetricsSection (calls charts)
│   ├── timeline-section.ts  (~45)  buildTimelineSection
│   ├── changelog-section.ts (~35)  buildChangelogSection
│   ├── knowledge-section.ts (~30)  buildKnowledgeSection
│   ├── captures-section.ts  (~30)  buildCapturesSection
│   ├── stats-section.ts     (~30)  buildStatsSection
│   └── discussion-section.ts (~20) buildDiscussionSection
└── export-html.ts           (~80)  Orchestrator: generateHtmlReport + HtmlReportOptions
```

---

### 6. `auto-prompts.ts` (1621 lines) — P2

**Verdict:** 32 exports, 13 internal helpers. Mechanical extraction, medium risk.

**Split plan:**
```
src/resources/extensions/gsd/
├── markdown-utils.ts          (~20)  extractMarkdownSection, escapeRegExp, oneLine
├── skill-activation.ts        (~150) buildSkillActivationBlock + 8 internal helpers (self-contained)
├── adaptive-checks.ts         (~90)  checkNeedsReassessment, checkNeedsRunUat
├── task-carry-forward.ts      (~55)  getPriorTaskSummaryPaths, getDependencyTaskSummaryPaths
├── section-builders.ts        (~90)  buildResumeSection, buildCarryForwardSection, extractSliceExecutionExcerpt
├── file-inlining.ts           (~110) inlineFile, inlineFileOptional, inlineFileSmart, inlineGsdRootFile
├── db-context-inlining.ts     (~75)  inlineDecisionsFromDb, inlineRequirementsFromDb, inlineProjectFromDb
├── preamble-management.ts     (~10)  MAX_PREAMBLE_CHARS, capPreamble
├── executor-constraints.ts    (~25)  formatExecutorConstraints
├── source-file-listing.ts     (~45)  buildSourceFilePaths
├── milestone-prompts.ts       (~400) 6 milestone prompt builders
├── slice-prompts.ts           (~300) 4 slice prompt builders
├── task-prompts.ts            (~250) ExecuteTaskPromptOptions + 2 builders
├── uat-prompts.ts             (~30)  buildRunUatPrompt
└── auto-prompts.ts            (~50)  barrel re-export only
```
**Execution order:** markdown-utils → skill-activation → section-builders → file-inlining → db-context → prompts
**No circular deps. All flow downward.**

---

### 7. `auto.ts` (1332 lines) — P2

**Verdict:** Orchestration hub. `buildLoopDeps()` and session state `s` must stay. 32 exports total.

**Split plan:**
```
src/resources/extensions/gsd/
├── auto-status-api.ts      (~25)  isAutoActive, isAutoPaused, isStepMode, tool tracking wrappers
├── auto-dashboard-api.ts   (~45)  getAutoDashboardData, updateProgressWidget, buildSnapshotOpts
├── auto-remote-control.ts  (~55)  stopAutoRemote, checkRemoteAutoSession
├── auto-preconditions.ts   (~35)  ensurePreconditions (dir creation)
├── auto-isolation.ts       (~8)   shouldUseWorktreeIsolation
├── auto-stop-sequence.ts   (~170) stopAuto + clearUnitTimeout + handleLostSessionLock
├── auto-pause.ts           (~50)  pauseAuto
├── auto-resume.ts          (~100) Resume path extracted from startAuto
└── auto.ts                 (~850) Session state, buildLoopDeps, startAuto, dispatchHookUnit
```
**Do NOT move:**
- `s = new AutoSession()` — architectural invariant enforced by tests
- `buildLoopDeps()` — the 100-line integration manifesto
- `startAuto()` — keep as entry point coordinating fresh start + resume

---

### 8. `subagent/index.ts` (1281 lines) — P2

**Verdict:** Rich split opportunity. Currently 0 named exports (everything inside default export fn).

**Split plan:**
```
src/resources/extensions/subagent/
├── types.ts              (~30)   UsageStats, SingleResult, SubagentDetails, DisplayItem
├── schemas.ts            (~40)   TypeBox schemas: TaskItem, ChainItem, SubagentParams
├── config.ts             (~5)    MAX_PARALLEL_TASKS, MAX_CONCURRENT, etc.
├── utils/
│   ├── concurrency.ts    (~20)   mapWithConcurrencyLimit (zero coupling, extract first)
│   ├── polling.ts        (~10)   waitForFile
│   └── temp-files.ts     (~10)   writePromptToTempFile
├── formatting/
│   ├── usage.ts          (~25)   formatUsageStats
│   ├── tool-call.ts      (~70)   formatToolCall
│   └── index.ts          (re-export)
├── stream/
│   ├── message-extraction.ts (~30) getFinalOutput, getDisplayItems
│   ├── event-processing.ts   (~40) processSubagentEventLine
│   └── process-args.ts       (~15) buildSubagentProcessArgs
├── process/
│   └── lifecycle.ts      (~35)   stopLiveSubagents + liveSubagentProcesses Set
├── execution/
│   ├── single.ts         (~125)  runSingleAgent
│   ├── cmux-split.ts     (~120)  runSingleAgentInCmuxSplit (fallback to single)
│   └── index.ts          (re-export)
├── modes/
│   ├── chain.ts          (~55)   Chain execution mode
│   ├── parallel.ts       (~120)  Parallel execution + auto-retry
│   ├── single.ts         (~70)   Single execution + isolation
│   └── index.ts          (re-export)
├── rendering/
│   ├── helpers.ts        (~30)   renderDisplayItems, aggregateUsage
│   ├── call.ts           (~45)   renderCall
│   ├── single.ts         (~60)   renderResult for single mode
│   ├── chain.ts          (~85)   renderResult for chain mode
│   ├── parallel.ts       (~90)   renderResult for parallel mode
│   └── index.ts          (re-export)
└── index.ts              (~100)  Tool + command registration only
```
**Key insight:** Execution single/cmux-split have ~80% code duplication — share common substrate.

---

### 9. `auto-loop.ts` (1892 lines) — P2

**Verdict:** Linear execution backbone. Clear phase pipeline, 22 exports.

**Split plan:**
```
src/resources/extensions/gsd/
├── auto-loop-config.ts         (~60)   MAX_LOOP_ITERATIONS, MAX_RECOVERY_CHARS, BUDGET_THRESHOLDS
├── auto-loop-types.ts          (~60)   AgentEndEvent, UnitResult, PhaseResult, LoopState, etc.
├── auto-loop-deps.ts           (~260)  LoopDeps interface (260 lines!)
├── stuck-detection.ts          (~60)   detectStuck() + WindowEntry — pure algorithm
├── milestone-reporting.ts      (~65)   generateMilestoneReport() — self-contained
├── auto-loop-helpers.ts        (~25)   closeoutAndStop()
├── auto-loop-runtime.ts        (~180)  Promise state + runUnit() — MUST extract as pair
├── auto-phases/
│   ├── pre-dispatch.ts         (~340)  runPreDispatch (8 sub-concerns, largest phase)
│   ├── dispatch.ts             (~175)  runDispatch + stuck detection integration
│   ├── guards.ts               (~140)  Budget/context/secrets guards
│   ├── unit-phase.ts           (~270)  runUnitPhase + prompt injection
│   └── finalize.ts             (~105)  runFinalize + verification gate
└── auto-loop.ts                (~150)  autoLoop() orchestrator only
```
**Critical:** `_currentResolve` promise state + `runUnit()` must extract as a pair (`auto-loop-runtime.ts`).
`index.ts` event handler imports `resolveAgentEnd` — update that import after extraction.

---

### 10. `guided-flow.ts` (1455 lines) — P3 (Last, Highest Risk)

**Verdict:** Classic God File. 5 exports + 9 re-exports. `showSmartEntry()` is a 650-line nested state machine.

**Split plan:**
```
src/resources/extensions/gsd/
Phase 1 (Low risk):
├── prompt-helpers.ts           (~10)   buildDocsCommitInstruction
├── model-resolver.ts           (~35)   resolveAvailableModel
├── bootstrap.ts                (~15)   bootstrapGsdProject
├── self-heal.ts                (~30)   selfHealRuntimeRecords

Phase 2 (Medium risk):
├── workflow-dispatcher.ts      (~80)   dispatchWorkflow + model selection
├── prompt-builders-gf.ts       (~50)   buildDiscussPrompt, buildHeadlessDiscussPrompt
├── discuss-flow.ts             (~280)  showDiscuss + buildDiscussSlicePrompt
├── milestone-actions-ui.ts     (~100)  handleMilestoneActions

Phase 3 (HIGH risk — extract incrementally with tests):
├── smart-entry-core.ts         (~100)  Directory checks, crash recovery, bootstrap
├── smart-entry-init.ts         (~100)  First-time init, v1 migration
├── smart-entry-planning.ts     (~350)  Complete/needs-discussion/roadmap/slice-planning states
└── smart-entry-execution.ts    (~150)  Summarizing + active-task states

Phase 4 (Medium risk):
├── auto-start-bridge.ts        (~125)  pendingAutoStart state + checkAutoStartAfterDiscuss
└── guided-flow.ts              (~200)  showSmartEntry orchestrator + re-exports preserved
```
**Critical risk:** `pendingAutoStart` global is mutated in 6+ places.
**Mitigation:** Convert to getter/setter in `auto-start-bridge.ts` before Phase 3.
**Must add integration tests** before touching Phase 3.

---

## Global Themes & Cross-Cutting Concerns

### Patterns Found Across Files:
1. **Barrel export pattern** — almost every file can become a thin re-export facade
2. **Native parser fallback** — repeated 4x in `files.ts`, 49x in `native-git-bridge.ts`
3. **Module-level mutable state** — `_currentResolve` (auto-loop), `pendingAutoStart` (guided-flow), parse cache (files), has-changes cache (git-bridge)
4. **Embedded assets as constants** — 1271-line CSS in export-html, JS embeds
5. **260-line LoopDeps interface** — LoopDeps alone is a split candidate

### Recommended Global Execution Order:
1. **Week 1:** visualizer-views, browser-tools/core (zero breaking changes, pure wins)
2. **Week 2:** files.ts, native-git-bridge.ts (low-medium risk, foundational modules)
3. **Week 3:** export-html.ts, auto-prompts.ts (medium risk, mechanical extraction)
4. **Week 4:** auto.ts, subagent/index.ts (medium risk, architectural care needed)
5. **Week 5:** auto-loop.ts (promise state coupling)
6. **Week 6+:** guided-flow.ts (integration tests required first)

### Total Impact:
- **~13,200 lines** in 10 files → **~100+ focused modules**
- Average post-split file: **~100 lines** (vs current ~1300)
- All splits use barrel re-exports: **zero breaking changes to consumers**
