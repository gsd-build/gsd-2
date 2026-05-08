# GSD-2 Long-Running Refactor Plan-Of-Plans

Project/App: GSD-2
File Purpose: Complete phase-by-phase implementation roadmap for reducing complexity, token usage, build/test time, and app/process drift without a big-bang rewrite.

**Status:** Replanned - SRC-first execution
**Date:** 2026-05-03
**Delivery model:** Sequential phase gates with limited parallel work inside a phase
**Primary priorities:** `src/` token/context reduction, `src/` workflow simplification, `src/` DB split, behavior preservation, telemetry-gated legacy removal

## Objective

Create a decision-complete implementation roadmap for the long-running GSD-2 refactor. This document plans the full program before implementation starts. It is not a mandate to execute every phase at the same time.

The refactor should:

1. Reduce prompt and context size while improving output quality.
2. Establish only the shared contracts needed by `src/` runtime behavior before touching app surfaces.
3. Speed up local build/test loops without weakening `npm run verify:pr`.
4. Simplify auto-mode into a smaller workflow kernel with explicit adapters.
5. Preserve the single-writer DB invariant while splitting the DB monolith.
6. Consolidate duplicated process/shipping paths after the `src/` runtime is simpler.
7. Retire legacy paths only after telemetry and tests prove they are safe to remove.

## Active Replan: SRC-First Focus

The previous execution spent too much time migrating web, VS Code, daemon, and other app-adapter surfaces. Those migrations are valid cleanup, but they are not the current bottleneck. The active program now prioritizes `src/` because that is where the largest token, workflow, DB, prompt, and output-quality wins live.

**Do now:**

1. Finish only the contract work required to stabilize `src/` runtime fixtures and prevent drift in source-owned RPC/headless/auto behavior.
2. Move immediately into Phase 2 token/context reduction under `src/resources/extensions/gsd/**`, `src/headless*.ts`, and source-owned prompt/context builders.
3. Pull Phase 4 workflow-kernel work ahead of broad app-surface consolidation once prompt lanes and fixtures are stable.
4. Pull Phase 5 DB split directly after the kernel boundary, because `src/resources/extensions/gsd/gsd-db.ts` and state derivation are core complexity hotspots.
5. Keep Phase 3 build/test speed scoped to `src` test compile and source verification loops.

**Stop doing for now:**

1. No more web store, web bridge, VS Code, Studio, or daemon DTO migrations unless a `src` change requires the adapter to keep tests passing.
2. No app-surface polish or parity work.
3. No broad package-level contract chasing for its own sake.
4. No Phase 6 work until Phases 2, 4, and 5 have landed behind tests.

**Current active order:**

1. Phase 0: complete and keep as the safety gate.
2. Phase 1A: close `src`-owned contract fixture gaps only.
3. Phase 2: token and context reduction in `src`.
4. Phase 4: workflow kernel extraction in `src/resources/extensions/gsd`.
5. Phase 5: DB split in `src/resources/extensions/gsd`.
6. Phase 3: source-scoped build/test speed work, interleaved only when it accelerates the current `src` phase.
7. Phase 7: process consolidation after runtime simplification.
8. Phase 8: telemetry-gated cleanup.
9. Phase 6: app surfaces, explicitly deferred.

## Program Rules

- Complete phase plans before starting implementation for that phase.
- Execute phases in dependency order.
- Allow parallel work only within the current phase when file ownership is disjoint.
- Use stacked PRs, one concern per PR.
- Keep each PR reviewable and independently reversible.
- Do not overwrite existing dirty worktree changes.
- Follow `CONTRIBUTING.md`: architectural changes require RFC/ADR approval, tests use `node:test` and `node:assert/strict`, and source-grep tests are not acceptable for new coverage.
- Keep implementation provider-agnostic. Provider quirks belong behind capability metadata or adapters, not in workflow assumptions.

## Phase Dependency Map

| Phase | Depends on | Unlocks |
| --- | --- | --- |
| 0. Baseline and Safety | None | All later phase measurement and gates |
| 1A. SRC Contracts Closure | Phase 0 | Source-owned golden fixtures, safer prompt/kernel/DB work |
| 2. Token and Context Reduction | Phase 0, Phase 1A | Prompt reductions, quality evals, context compiler migration |
| 3. SRC Build/Test Speed | Phase 0 | Faster source iteration for later phases |
| 4. Workflow Kernel | Phases 0-2 | Auto-mode simplification, adapter boundaries |
| 5. DB Split | Phases 0-1 | Repository boundaries, state/query speed work |
| 6. App Surface Deferred | Phases 2, 4, 5 | Web/MCP/VS Code/Studio contract convergence after source simplification |
| 7. Process Consolidation | Phases 2, 4, 5 | Unified ship/PR evidence and docs alignment |
| 8. Legacy Cleanup | Phases 0-7 telemetry | Safe deletion of compatibility paths |

## Phase 0: Baseline And Safety Plan

**Goal:** Establish measurement, current behavior characterization, and safety gates before behavior changes.

**Owned areas:**

- Metrics commands and local reporting scripts.
- Prompt-size fixture harness.
- Build/test timing harness.
- Startup timing collection.
- `dist-test` size and copy-count reporting.

**Implementation plan:**

1. Add a read-only baseline command that prints a stable report with:
   - prompt chars by unit type
   - rendered skill count and skill catalog chars
   - context/tool/system/user-message chars where available
   - build/test command wall time
   - startup phase timing when `GSD_STARTUP_TIMING=1`
   - `dist-test` file count and byte size
2. Add fixtures for representative current behavior:
   - RPC JSONL state/stats/bash/UI events
   - prompt construction for discuss, plan-slice, execute-task, complete-slice, validate-milestone, reactive-execute
   - auto pause/resume/recovery/worktree/milestone transitions
   - DB state derivation and migration fixtures
3. Add a baseline report schema so later phases can compare before/after metrics without hand parsing.
4. Document how to run the baseline locally and in CI-like mode.

Baseline usage is documented in `docs/dev/refactor-baseline-runbook.md`.

**Acceptance criteria:**

- Baseline command works on a clean checkout and produces stable JSON plus human-readable summary.
- Current prompt, RPC, auto-mode, and DB behaviors have characterization coverage.
- No production behavior changes.

**Test matrix:**

| Area | Required tests |
| --- | --- |
| Baseline command | command exits 0, emits required sections, handles missing optional data |
| Prompt fixtures | representative unit prompts render and required sections are present |
| RPC fixtures | runtime and client fixtures parse the same JSONL payloads |
| Auto behavior | pause, resume, recoverable failure, worktree isolation, milestone transition |
| DB behavior | state derivation, migration fixture, single-writer guardrail |

**Metrics dashboard fields:**

- `prompt.systemChars`
- `prompt.skillCatalogChars`
- `prompt.unitInstructionChars`
- `prompt.volatileContextChars`
- `prompt.totalChars`
- `prompt.omittedSectionCount`
- `tokens.input`
- `tokens.cacheRead`
- `tokens.cacheWrite`
- `tokens.output`
- `build.command`
- `build.wallMs`
- `tests.command`
- `tests.wallMs`
- `startup.phase`
- `startup.wallMs`
- `distTest.fileCount`
- `distTest.bytes`

**Rollback/compatibility notes:**

- This phase is additive and read-only at runtime.
- Rollback is removal of measurement commands and fixtures only.

**Exit gate:** Baseline metrics exist, current behavior is covered, and later phases can compare before/after results.

**Implemented gate command:** `npm run baseline:refactor:phase0`

## Phase 1A: SRC Contracts Closure Plan

**Goal:** Close only the shared contract gaps needed by `src` runtime behavior and source-owned tests before moving to token/context reduction.

**Owned areas:**

- New `packages/contracts` workspace package named `@gsd-build/contracts`.
- Runtime RPC protocol types.
- `@gsd-build/rpc-client` compatibility exports when required by source tests.
- `src/headless*.ts`, `src/headless-events.ts`, `src/web/bridge-service.ts` only where source-owned runtime fixtures depend on them.
- `src/resources/extensions/gsd/**` contract fixtures.

**Implementation plan:**

1. Create `@gsd-build/contracts` with:
   - thinking levels including all currently supported levels
   - RPC command/event/response envelopes
   - session state and session stats
   - bash command result shape
   - UI request/response shapes, including secure input
   - MCP blocker request/response shapes
   - workflow tool registry metadata: canonical name, aliases, schema id, executor id, write policy, audit metadata
2. Move only stable public DTOs first. Do not move implementation services into the contracts package.
3. Make runtime RPC and `@gsd-build/rpc-client` import or re-export canonical contracts.
4. Add golden JSONL fixtures for source-owned runtime/headless/auto behavior.
5. Stop Phase 1A when `src` fixtures are stable. Defer MCP/web/VS Code/Studio/daemon DTO migration unless required by source tests.

**Implemented so far:**

- Created `packages/contracts` as `@gsd-build/contracts`.
- Added canonical RPC constants and DTOs for commands, responses, v2 events, session state, session stats, bash results, and extension UI request/response payloads.
- Migrated runtime RPC and `@gsd-build/rpc-client` to re-export the shared RPC contracts.
- Added Phase 1 fixture coverage with `src/tests/contracts-rpc-fixtures.test.ts`.
- Updated the web parity contract test to assert retry state through the shared `RpcSessionState` type instead of reading RPC type source text.

**Acceptance criteria:**

- Runtime, rpc-client compatibility exports, and source-owned fixtures share the same contract types for golden fixtures.
- `src` no longer depends on hand-rolled incompatible RPC/bash/UI shapes in the active runtime paths being refactored.
- Existing public package exports remain compatible or explicitly re-exported.

**Test matrix:**

| Area | Required tests |
| --- | --- |
| Contracts package | type-level compile coverage and runtime fixture validation helpers |
| RPC runtime | golden `get_state`, `get_session_stats`, bash, slash command, UI request events |
| RPC client | parses the same golden fixtures as runtime |
| Headless/source runtime | source-owned headless and UI event fixtures use canonical contracts |
| Deferred adapters | no new coverage required until Phase 6 |

**Metrics dashboard fields:**

- `contracts.fixtures.total`
- `contracts.fixtures.sharedBySurface`
- `contracts.surfaceDriftFailures`
- `contracts.legacyTypeImportsRemaining`

**Rollback/compatibility notes:**

- Keep adapter-level compatibility re-exports during migration.
- Do not remove old local types until all consumers use the new package.
- Each surface migration should be independently revertible.

**Exit gate:** Runtime, rpc-client compatibility exports, and source-owned golden fixtures share contracts and no high-risk `src` contract drift remains.

## Phase 2: Token And Context Reduction Plan

**Goal:** Reduce prompt/context size while improving relevance and preserving output quality.

**Owned areas:**

- `src/resources/extensions/gsd/prompts/**`.
- `src/resources/extensions/gsd/auto-prompts.ts`.
- `src/resources/extensions/gsd/auto-context.ts` and adjacent source context builders if present.
- Skill filtering and skill catalog rendering under `src`.
- GSD prompt builders and `UnitContextManifest` under `src`.
- Context budget enforcement under `src`.
- Prompt telemetry and golden prompt fixtures.

**Implementation plan:**

1. Split prompt material into three lanes:
   - stable system kernel
   - unit-specific instructions
   - volatile retrieved context
2. Wire existing `skillFilter` through session and GSD unit context so only relevant skills render by default.
3. Keep explicitly requested skills visible even if automatic filtering would omit them.
4. Make `UnitContextManifest` the source of truth for artifacts, tools, skills, memory, and budgets.
5. Enforce budgets in `composeUnitContext`:
   - required artifacts missing should fail loudly
   - optional artifacts missing should produce compact omission notes
   - oversized sections should be scored and trimmed before full truncation
6. Replace repeated large prompt prose with concise unit instructions plus enforced gates/policies.
7. Refactor validate-milestone and reactive-execute prompt assembly to share common context once and include per-unit deltas.
8. Add prompt quality/eval fixtures that compare:
   - prompt size
   - required instruction retention
   - tool policy retention
   - output acceptance criteria retention

**Acceptance criteria:**

- Representative golden prompts are at least 40% smaller than Phase 0 baselines.
- Required instructions and tool policies remain present.
- Skill catalog rendering is filtered by default and observable in telemetry.
- Provider-specific assumptions are replaced by capability-driven metadata where touched.

**Test matrix:**

| Area | Required tests |
| --- | --- |
| Skill filtering | default filtered catalog, explicit skill retention, empty catalog behavior |
| Context composer | required vs optional artifacts, budget enforcement, omitted section notes |
| Prompt fixtures | discuss, plan-slice, execute-task, complete-slice, validate-milestone, reactive-execute |
| Provider neutrality | token estimates and context behavior use capability metadata, not provider identity shortcuts |
| Quality evals | fixed task fixtures retain acceptance criteria and verification expectations |

**Metrics dashboard fields:**

- `prompt.reductionPercent`
- `prompt.renderedSkillCount`
- `prompt.filteredSkillCount`
- `prompt.requiredSectionsPresent`
- `prompt.omittedSectionCount`
- `context.requiredArtifactFailures`
- `context.optionalArtifactOmissions`
- `eval.outputPassRate`
- `eval.verificationPassRate`

**Rollback/compatibility notes:**

- Keep old prompt builders reachable behind a temporary compatibility flag until golden fixtures are stable.
- If output quality drops, rollback per unit type rather than reverting all context work.

**Exit gate:** 40% prompt-size reduction target is met on representative fixtures with no loss of required sections or acceptance criteria.

**Closeout status (2026-05-04):** Phase 2 source-owned golden fixtures now enforce the exit gate in `src/tests/prompt-golden-fixtures.test.ts`. Representative fixture total dropped from 45,247 chars at the SRC-first Phase 2 start baseline to 16,548 chars, a 63.4% reduction, while retaining required markers for `gsd_plan_slice`, `gsd_task_complete`, `gsd_slice_complete`, verification evidence, blocker handling, and summary sections. The regression gate runs through `npm run baseline:refactor:gate`.

## Phase 3: Build/Test Speed Plan

**Goal:** Speed up `src` iteration while preserving the full `npm run verify:pr` preflight.

**Owned areas:**

- Test compile script and `dist-test` lifecycle.
- Source-scoped local verification scripts.
- Build/test timing metrics.

**Implementation plan:**

1. Make `test:compile` stale-aware and reusable within one command sequence.
2. Avoid recompiling before both unit and package tests when sources have not changed.
3. Add a scoped changed-test command for `src` local iteration.
4. Preserve `npm run verify:pr` as the full gate.
5. Emit file count, byte count, cache hit, and wall-time metrics for source build/test steps.

**Acceptance criteria:**

- Warm local verification loop is at least 25% faster than Phase 0 baseline.
- Full `npm run verify:pr` still runs build core, extension typecheck, and unit tests.
- Stale detection is tested and does not skip required builds/tests.

**Test matrix:**

| Area | Required tests |
| --- | --- |
| Compile cache | cold run compiles, warm run reuses, source change invalidates |
| Scoped tests | changed-source inputs select expected test set |
| Full preflight | `verify:pr` command remains full and unchanged in intent |

**Metrics dashboard fields:**

- `testCompile.coldWallMs`
- `testCompile.warmWallMs`
- `testCompile.cacheHit`
- `testCompile.fileCount`
- `testCompile.bytesCopied`
- `verify.changedWallMs`
- `verify.fullWallMs`
- `webFingerprint.inputCount`
- `webFingerprint.cacheHit`

**Rollback/compatibility notes:**

- Keep a force-clean flag that ignores caches.
- If stale detection fails, default to recompiling rather than skipping.

**Exit gate:** Warm local loop improves by at least 25% and full preflight behavior is preserved.

**Closeout status (2026-05-04):** Phase 3 source-owned tooling now has stale-aware `test:compile`, a focused `npm run test:changed:src` loop, and baseline dashboard fields for test compile cache state, compile file/byte counts, warm/cold command timings, and changed/full verification timings. Measured cold compile was 6146ms; measured warm compile was 417ms, a 93.2% reduction. The focused changed-src path also supports `--base` and `--since`, uses the shared TypeScript test loader, and ran `src/tests/refactor-baseline.test.ts` successfully through the warm compile path. The full `npm run verify:pr` command remains the preserved preflight gate; Phase 3 verification in this stack used targeted tests plus `npm run baseline:refactor:gate`.

## Phase 4: Workflow Kernel Plan

**Goal:** Extract auto-mode into a pure workflow kernel with explicit adapters and a thin facade.

**Owned areas:**

- Auto-mode dispatch and loop boundaries.
- Workflow state/event/action contracts.
- Adapter interfaces for side effects.
- Recovery and worktree behavior tests.

**Implementation plan:**

1. Define pure kernel input/output:
   - input: derived workflow state, event, policy, runtime preferences
   - output: dispatch action, blocked reason, retry decision, closeout intent
2. Keep `auto.ts` as the public facade for start/stop/pause/resume.
3. Move side effects behind adapters:
   - DB repository adapter
   - git/worktree adapter
   - UI/notification adapter
   - model selection adapter
   - prompt/context adapter
   - MCP/remote questions adapter
   - recovery adapter
4. Convert existing auto loop behavior incrementally through the kernel without changing command behavior.
5. Add explainability output for "why this unit ran" and "why this unit is blocked."

**Acceptance criteria:**

- Kernel can be tested without filesystem, git, model provider, or UI side effects.
- `auto.ts` remains a compatibility facade.
- Existing auto pause/resume/recovery/worktree/milestone behavior is preserved.

**Test matrix:**

| Area | Required tests |
| --- | --- |
| Kernel pure tests | state/event/policy produces expected actions |
| Auto facade | start, stop, pause, resume retain behavior |
| Recovery | recoverable failure, retry limit, stuck detection |
| Worktree | isolation, cleanup, merge readiness |
| Milestone | transition, completion guard, validation gate |
| Explainability | blocked/runnable reason codes visible |

**Metrics dashboard fields:**

- `workflow.kernelActionCount`
- `workflow.blockedReason`
- `workflow.retryDecision`
- `workflow.adapterCallCount`
- `workflow.recoveryCount`
- `workflow.unitWallMs`

**Rollback/compatibility notes:**

- Route facade back to legacy loop per unit type if a kernel regression appears.
- Keep side-effect adapters thin and reversible.

**Exit gate:** Auto pause/resume/recovery/worktree/milestone tests pass through the facade and pure kernel tests cover dispatch decisions.

**Closeout status (2026-05-04):** Phase 4 SRC-first workflow-kernel extraction is closed. `auto/loop.ts` remains the compatibility facade, while repeated loop responsibilities now sit behind small source-owned adapters for phase/journal/turn reporting, session-lock validation, worker heartbeat, memory pressure, dispatch claims, dispatch ledger settling, sidecar queue dequeue, sidecar/custom-engine iteration data, unit dispatch, request timestamp resolution, iteration completion cleanup, custom verify retry persistence, custom-engine dispatch outcomes, verify outcomes, reconcile handling, and reconcile outcomes. Pure kernel decisions are covered in `src/resources/extensions/gsd/tests/workflow-kernel.test.ts`; side-effect adapters have direct `node:test` coverage; facade behavior is covered by `src/resources/extensions/gsd/tests/auto-loop.test.ts` and `src/resources/extensions/gsd/tests/custom-engine-loop-integration.test.ts`. Latest gate used targeted adapter tests, custom-engine integration, `auto-loop`, `npm run test:changed:src -- --since HEAD~1`, and `npm run baseline:refactor:gate`.

## Phase 5: DB Split Plan

**Goal:** Preserve the single-writer invariant while splitting the DB implementation into maintainable modules.

**Owned areas:**

- DB connection/provider loading.
- Schema and migrations.
- Domain repositories.
- Projection/manifest writers.
- Compatibility readers.
- State derivation hot paths.

**Implementation plan:**

1. Keep one public write facade and the existing single-writer invariant.
2. Split internals into:
   - connection/provider loading
   - schema definition
   - migrations
   - transaction helper
   - milestone repository
   - slice repository
   - task repository
   - journal/audit repository
   - memory repository
   - projection repository
   - compatibility readers
3. Move functions in behavior-preserving groups.
4. Add lightweight query variants where callers need only ids/status.
5. Benchmark JSON dependency lookup against indexed dependency tables before changing query strategy.
6. Keep old export names as compatibility exports until callers migrate.

**Acceptance criteria:**

- Single-writer guardrail remains enforced.
- Migration fixtures pass.
- State derivation output remains behaviorally identical.
- Hot-path query changes are backed by benchmark or query-plan evidence.

**Test matrix:**

| Area | Required tests |
| --- | --- |
| Single writer | write bypass detection, transaction wrapper behavior |
| Migrations | old schema fixtures migrate to current schema |
| Repositories | milestone/slice/task/journal/memory CRUD behavior |
| State derivation | DB authoritative state, legacy fallback behavior where still supported |
| Query speed | dependency lookup and state derive benchmark fixtures |

**Metrics dashboard fields:**

- `db.deriveStateWallMs`
- `db.queryCount`
- `db.writeCount`
- `db.migrationWallMs`
- `db.singleWriterViolationCount`
- `db.dependencyLookupWallMs`

**Rollback/compatibility notes:**

- Maintain facade exports until every caller is migrated.
- If repository split causes drift, revert the affected repository move without reverting schema work.

**Exit gate:** Migration, state derivation, dependency lookup, and single-writer tests pass with compatibility exports intact.

**Closeout status (2026-05-04):** Phase 5 SRC-first DB split is closed for this merge stack. `gsd-db.ts` remains the compatibility facade while provider loading, adapter wrapping, workspace connection caching, open-status state, transaction running, schema metadata/version helpers, runtime KV schema, coordination schema, verification-evidence schema, memory FTS schema, base schema DDL, migration backup/control/DDL steps, and row mappers for decision/requirement, task/slice, milestone/artifact, lightweight query, and verification evidence now live in focused source-owned modules. Verification coverage includes DB provider/adapter/cache/open-state/transaction/schema/migration helper tests, `gsd-db.test.ts`, `derive-state-db.test.ts`, `derive-state-db-disk-reconcile.test.ts`, and single-writer guardrail coverage.

## Phase 6: App Surface Plan - Deferred

**Goal:** Deferred. Make app surfaces thin adapters over shared contracts only after the `src` runtime is smaller and more stable.

**Owned areas:**

- Web workspace store and bridge service.
- MCP server adapters.
- VS Code client.
- Studio runtime boundary.
- Shared contract imports.

**Implementation plan:**

1. Do not start this phase until Phases 2, 4, and 5 have passed their exit gates.
2. Split web workspace store into store slices while preserving the public hook behavior.
3. Make web routes and bridge services delegate to shared contracts and services instead of importing deep runtime internals.
4. Move MCP workflow tool registration toward the shared workflow registry metadata.
5. Move VS Code DTO parsing to `@gsd-build/contracts`.
6. Decide Studio role:
   - either wire it to the same contracts
   - or mark it explicitly as prototype/non-runtime until wired
7. Add app contract tests for authenticated web flows and adapter payloads.

**Acceptance criteria:**

- Web public hook behavior remains compatible.
- Web, MCP, VS Code, and Studio no longer need divergent DTO definitions for migrated surfaces.
- Authenticated web file/session flows pass.

**Test matrix:**

| Area | Required tests |
| --- | --- |
| Web store | public selectors/actions preserve behavior |
| Web auth | file/session/live-state routes use authenticated client path |
| MCP | workflow registry aliases and blocker payloads match contracts |
| VS Code | parser handles canonical fixtures |
| Studio | contract status is tested or explicitly documented as prototype |

**Metrics dashboard fields:**

- `app.contractConsumersMigrated`
- `app.legacyDtoCount`
- `app.webStoreSliceCount`
- `app.bridgeDeepImportCount`
- `app.authFlowFailures`

**Rollback/compatibility notes:**

- Keep old web hook exports stable.
- Migrate one surface at a time so contract regressions are isolated.

**Exit gate:** App contract tests and authenticated web flows pass.

**Deferred status (2026-05-04):** Phase 6 remains intentionally out of scope for this SRC-first merge. A few low-risk app-surface contract import slices landed where they supported shared DTO convergence, but broad web, VS Code, Studio, and app-store restructuring is not required to merge the source-runtime refactor. Treat remaining Phase 6 work as a follow-up roadmap item with its own PR stack and app-specific verification gate.

## Phase 7: Process Consolidation Plan

**Goal:** Consolidate shipping paths and align docs/process with the actual DB-backed and CI-backed system.

**Owned areas:**

- `/gsd ship`.
- `git.auto_pr`.
- GitHub sync PR generation.
- PR evidence generation.
- CI/release docs.
- DB-vs-markdown workflow docs.

**Implementation plan:**

1. Create one PR evidence generator used by:
   - `/gsd ship`
   - `git.auto_pr`
   - GitHub sync
2. Evidence generator must include:
   - TL;DR
   - linked issue when required
   - change type checklist
   - tests run
   - AI-assisted disclosure
   - rollback notes for behavior changes
3. Align workflow docs:
   - DB is authoritative for auto-mode state
   - markdown is projection/manual/legacy unless explicitly stated
   - actual CI/release workflows are documented as they exist
4. Add one recommended task path per task size:
   - hotfix
   - bugfix
   - small feature
   - large feature
   - architecture change

**Acceptance criteria:**

- All PR creation paths use the same evidence generator.
- Generated PR bodies satisfy the repo template and contribution policy.
- Docs no longer conflict on DB state authority or release workflow behavior.

**Test matrix:**

| Area | Required tests |
| --- | --- |
| PR evidence | generated body includes required sections for each change type |
| Ship paths | `/gsd ship`, `git.auto_pr`, GitHub sync call shared generator |
| Docs examples | command examples match actual supported flows |
| Process classification | task size maps to expected planning/execution path |

**Metrics dashboard fields:**

- `process.prGeneratorConsumers`
- `process.prBodiesMissingIssue`
- `process.prBodiesMissingTests`
- `process.docsConflictCount`
- `process.shipPathCount`

**Rollback/compatibility notes:**

- Keep command names stable.
- If generator rollout breaks one path, route only that path back temporarily while preserving shared tests.

**Exit gate:** Generated PR bodies satisfy template, linked issue, tests, and AI disclosure requirements.

**Closeout status (2026-05-04):** Phase 7 SRC-first process consolidation is closed. `/gsd ship`, `git.auto_pr`, and GitHub sync PR body generation now use the shared `buildPrEvidence` generator with TL;DR, linked issue, tests run, change type, rollback/compatibility, and AI disclosure sections. GitHub sync slice PRs and swarm lane PRs reuse the same generator through their existing formatter surface. Process routing now has one canonical recommended path for hotfix, bugfix, small feature, large feature, and architecture-change work, surfaced in `/gsd start` and `/gsd templates` help. Baseline reporting now emits the Phase 7 dashboard fields: `process.prGeneratorConsumers`, `process.prBodiesMissingIssue`, `process.prBodiesMissingTests`, `process.docsConflictCount`, and `process.shipPathCount`; the current scan reports three shared PR evidence consumers, zero missing issue/test evidence flags, and zero DB-vs-markdown docs conflicts. Verification used targeted PR evidence, GitHub sync formatter, process path, workflow template, changed-src, and `npm run baseline:refactor:gate` tests.

## Phase 8: Legacy Cleanup Plan

**Goal:** Remove compatibility layers only after telemetry and tests prove they are safe.

**Owned areas:**

- Legacy markdown state fallback.
- Legacy workflow engines/templates.
- UOK parity/fallback wrappers.
- Duplicate MCP aliases.
- Legacy component formats.
- Provider-biased defaults or docs where touched.

**Implementation plan:**

1. Add telemetry counters before deletion:
   - markdown fallback used
   - legacy workflow engine selected
   - UOK fallback/parity path used
   - MCP alias used
   - legacy component format loaded
   - provider-specific default selected without explicit user preference
2. Add runtime diagnostics for deprecated paths.
3. Publish migration notes for each removed path.
4. Delete only one legacy category per PR.
5. Keep deletions independently reversible.

**Implemented so far:**

- Added runtime counters and baseline dashboard fields for all six Phase 8 deprecated paths.
- Wired `legacy.markdownFallbackUsed` to explicit markdown state derivation fallback.
- Wired `legacy.workflowEngineUsed` to legacy workflow template dispatch paths.
- Wired `legacy.uokFallbackUsed` to non-kernel UOK execution paths.
- Wired `legacy.mcpAliasUsed` to execution through backward-compatible MCP tool aliases.
- Wired `legacy.componentFormatUsed` to successful legacy `SKILL.md` and agent `.md` component loads.
- Wired `legacy.providerDefaultUsed` to canonical provider-default model fallback selection.
- Added one-warning-per-counter diagnostics through the shared legacy telemetry layer.
- Added opt-in snapshot persistence via `GSD_LEGACY_TELEMETRY_FILE` so representative runs can produce deletion-gate evidence without hardcoded local paths.
- Added explicit zero-use snapshot flushing so representative runs can produce deletion-gate evidence even when no legacy counters increment.
- Added `npm run legacy:cleanup:gate -- --file <snapshot>` to block deletion PRs when any Phase 8 counter is missing or nonzero.
- Added `npm run legacy:cleanup:evidence -- --file <snapshot>` to run representative checks, write a zero-use snapshot if no legacy path is touched, and then apply the cleanup gate.

**Migration notes before deletion:**

- Markdown state fallback: migrate projects to DB-authoritative state and keep markdown as projection/manual reference only. Do not remove fallback until `legacy.markdownFallbackUsed` stays at zero on representative runs.
- Legacy workflow engines/templates: move active workflows to `auto-milestone` templates and keep legacy aliases documented until `legacy.workflowEngineUsed` is zero.
- UOK fallback/parity wrappers: resolve blockers that require `legacy_fallback` or `GSD_UOK_FORCE_LEGACY`; removal is allowed only after kernel path telemetry shows no fallback use.
- MCP tool aliases: update agents and prompts to canonical `gsd_*` tool names before alias removal. Alias wrappers now count actual alias execution.
- Legacy component formats: migrate installed skills and agents to `component.yaml` plus `SKILL.md` or `AGENT.md` entry files before removing legacy loaders.
- Provider defaults: configure explicit provider-aware model preferences or available model registries before removing canonical provider-default fallbacks.

**Acceptance criteria:**

- No legacy path is removed before telemetry exists.
- Removal PRs include tests proving supported replacements.
- Migration notes exist for affected users or extension authors.

**Test matrix:**

| Area | Required tests |
| --- | --- |
| Telemetry | counters increment for each legacy path |
| Diagnostics | deprecated path warning appears once and is actionable |
| Replacement | modern path covers the supported behavior |
| Deletion | old fixtures fail with migration guidance where appropriate |

**Metrics dashboard fields:**

- `legacy.markdownFallbackUsed`
- `legacy.workflowEngineUsed`
- `legacy.uokFallbackUsed`
- `legacy.mcpAliasUsed`
- `legacy.componentFormatUsed`
- `legacy.providerDefaultUsed`

**Rollback/compatibility notes:**

- Every deletion PR must identify the exact commit that can restore the path.
- Prefer feature-flagged disablement before hard deletion for high-risk paths.

**Exit gate:** Each deletion is small, tested, telemetry-backed, documented, and independently reversible.

**Closeout status (2026-05-04):** Phase 8 telemetry readiness is closed. No legacy path has been deleted in this stack. Deletion work is intentionally blocked until representative runs pass `npm run legacy:cleanup:evidence -- --file <snapshot>`, or an equivalent manually collected zero-use snapshot passes `npm run legacy:cleanup:gate -- --file <snapshot>`.

## File Ownership Map

| Phase | Primary owners | Must not overlap with |
| --- | --- | --- |
| 0 | metrics scripts, test fixtures, docs for baseline command | implementation refactors in auto/DB/web |
| 1A | `packages/contracts`, source-owned RPC/headless/auto fixtures | prompt builder rewrites that change payload shape |
| 2 | `src/resources/extensions/gsd/prompts/**`, `src/resources/extensions/gsd/*context*`, skill filtering, GSD prompt/context compiler | workflow kernel side-effect moves |
| 3 | source build/test scripts and `dist-test` lifecycle | test fixture schema moves from Phase 1A without coordination |
| 4 | auto-mode kernel/facade/adapters | DB module moves and prompt compiler churn in same files |
| 5 | DB internals and repositories | workflow kernel changes that depend on DB private functions |
| 6 | deferred web store, bridge, MCP, VS Code, Studio adapters | active `src` phases |
| 7 | ship/PR generator, GitHub sync, docs | app adapter DTO migration |
| 8 | one legacy category per deletion PR | any active behavior-changing phase |

## Long-Running Program Dashboard

The implementation program should maintain a dashboard with these groups:

| Group | Fields |
| --- | --- |
| Speed | build wall time, unit test wall time, package test wall time, scoped verify wall time, startup wall time |
| Tokens | system chars, skill chars, unit instruction chars, volatile context chars, total prompt chars, input tokens, output tokens, cache read/write |
| Quality | golden prompt required-section pass rate, output eval pass rate, verification pass rate, retry count |
| Contracts | fixture pass rate by surface, legacy DTO count, incompatible payload failures |
| Workflow | kernel action count, blocked reason counts, recovery count, unit wall time |
| DB | derive state p95, query count, write count, migration wall time, single-writer violations |
| Process | PR generator consumers, missing issue/test evidence count, docs conflict count |
| Legacy | usage counters for each deprecated path |

## Implementation Order

1. Phase 0: Baseline and Safety
2. Phase 1A: SRC Contracts Closure
3. Phase 2: Token and Context Reduction
4. Phase 4: Workflow Kernel
5. Phase 5: DB Split
6. Phase 3: SRC Build/Test Speed where it accelerates active source work
7. Phase 7: Process Consolidation
8. Phase 8: Legacy Cleanup
9. Phase 6: App Surface, deferred until source runtime simplification lands

Parallel work is allowed only inside a phase when file ownership is disjoint and the phase lead owns integration.

## Done Definition For The Whole Program

- Prompt/context size is materially lower and tracked by repeatable metrics.
- Shared contracts are used where they protect `src` runtime behavior; app-surface convergence is deferred and tracked separately.
- Warm local verification is materially faster while full `verify:pr` remains intact.
- Auto-mode has a pure testable workflow kernel and explicit side-effect adapters.
- DB internals are split without weakening the single-writer invariant.
- App-surface convergence is either completed in a dedicated Phase 6 stack or explicitly deferred from the SRC-first merge.
- Shipping paths produce one consistent PR evidence format.
- Legacy paths are removed only after telemetry, tests, and migration notes.
