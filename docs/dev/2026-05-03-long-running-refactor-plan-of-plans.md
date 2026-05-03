# GSD-2 Long-Running Refactor Plan-Of-Plans

Project/App: GSD-2
File Purpose: Complete phase-by-phase implementation roadmap for reducing complexity, token usage, build/test time, and app/process drift without a big-bang rewrite.

**Status:** Proposed
**Date:** 2026-05-03
**Delivery model:** Sequential phase gates with limited parallel work inside a phase
**Primary priorities:** tokens/contracts first, behavior preservation, telemetry-gated legacy removal

## Objective

Create a decision-complete implementation roadmap for the long-running GSD-2 refactor. This document plans the full program before implementation starts. It is not a mandate to execute every phase at the same time.

The refactor should:

1. Reduce prompt and context size while improving output quality.
2. Establish shared contracts across runtime, RPC, MCP, web, VS Code, and future app surfaces.
3. Speed up local build/test loops without weakening `npm run verify:pr`.
4. Simplify auto-mode into a smaller workflow kernel with explicit adapters.
5. Preserve the single-writer DB invariant while splitting the DB monolith.
6. Consolidate duplicated app/process/shipping paths.
7. Retire legacy paths only after telemetry and tests prove they are safe to remove.

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
| 1. Contracts Foundation | Phase 0 | App/API consolidation, golden fixtures, safer adapters |
| 2. Token and Context Reduction | Phase 0, partial Phase 1 | Prompt reductions, quality evals, context compiler migration |
| 3. Build/Test Speed | Phase 0 | Faster iteration for later phases |
| 4. Workflow Kernel | Phases 0-2 | Auto-mode simplification, adapter boundaries |
| 5. DB Split | Phases 0-1 | Repository boundaries, state/query speed work |
| 6. App Surface | Phases 1, 3 | Web/MCP/VS Code/Studio contract convergence |
| 7. Process Consolidation | Phases 1, 6 | Unified ship/PR evidence and docs alignment |
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

## Phase 1: Contracts Foundation Plan

**Goal:** Create one canonical contract boundary for runtime, RPC client, MCP, web, VS Code, and future app surfaces.

**Owned areas:**

- New `packages/contracts` workspace package named `@gsd-build/contracts`.
- Runtime RPC protocol types.
- `@gsd-build/rpc-client` exports.
- MCP blocker and workflow tool contract metadata.
- Web bridge/browser DTOs.
- VS Code client DTOs.

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
4. Move MCP, web bridge, and VS Code to the same contracts in small stacked PRs.
5. Add golden JSONL fixtures shared across packages.

**Acceptance criteria:**

- Runtime, rpc-client, MCP, web, and VS Code share the same contract types for golden fixtures.
- No app surface keeps a hand-rolled incompatible RPC/bash/UI shape.
- Existing public package exports remain compatible or explicitly re-exported.

**Test matrix:**

| Area | Required tests |
| --- | --- |
| Contracts package | type-level compile coverage and runtime fixture validation helpers |
| RPC runtime | golden `get_state`, `get_session_stats`, bash, slash command, UI request events |
| RPC client | parses the same golden fixtures as runtime |
| MCP | blocker confirm/select/multi-select/input/secure-input response shapes |
| Web | bridge DTOs match canonical contracts |
| VS Code | client parser handles canonical fixtures |

**Metrics dashboard fields:**

- `contracts.fixtures.total`
- `contracts.fixtures.sharedBySurface`
- `contracts.surfaceDriftFailures`
- `contracts.legacyTypeImportsRemaining`

**Rollback/compatibility notes:**

- Keep adapter-level compatibility re-exports during migration.
- Do not remove old local types until all consumers use the new package.
- Each surface migration should be independently revertible.

**Exit gate:** Runtime, rpc-client, MCP, web, and VS Code share golden fixtures and no high-risk contract drift remains.

## Phase 2: Token And Context Reduction Plan

**Goal:** Reduce prompt/context size while improving relevance and preserving output quality.

**Owned areas:**

- System prompt assembly.
- Skill filtering and skill catalog rendering.
- GSD prompt builders and `UnitContextManifest`.
- Context budget enforcement.
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

## Phase 3: Build/Test Speed Plan

**Goal:** Speed up local iteration while preserving the full `npm run verify:pr` preflight.

**Owned areas:**

- Test compile script and `dist-test` lifecycle.
- Scoped local verification scripts.
- Web build staleness detection.
- Build/test timing metrics.

**Implementation plan:**

1. Make `test:compile` stale-aware and reusable within one command sequence.
2. Avoid recompiling before both unit and package tests when sources have not changed.
3. Add a scoped changed-test command for local iteration.
4. Preserve `npm run verify:pr` as the full gate.
5. Replace broad web staleness tree walking with tracked-file fingerprints limited to actual web inputs.
6. Emit file count, byte count, cache hit, and wall-time metrics for build/test steps.

**Acceptance criteria:**

- Warm local verification loop is at least 25% faster than Phase 0 baseline.
- Full `npm run verify:pr` still runs build core, extension typecheck, and unit tests.
- Stale detection is tested and does not skip required builds/tests.

**Test matrix:**

| Area | Required tests |
| --- | --- |
| Compile cache | cold run compiles, warm run reuses, source change invalidates |
| Scoped tests | changed-source inputs select expected test set |
| Web fingerprint | actual web input changes invalidate, unrelated files do not |
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

## Phase 6: App Surface Plan

**Goal:** Make app surfaces thin adapters over shared contracts and reduce web store/bridge complexity.

**Owned areas:**

- Web workspace store and bridge service.
- MCP server adapters.
- VS Code client.
- Studio runtime boundary.
- Shared contract imports.

**Implementation plan:**

1. Split web workspace store into store slices while preserving the public hook behavior.
2. Make web routes and bridge services delegate to shared contracts and services instead of importing deep runtime internals.
3. Move MCP workflow tool registration toward the shared workflow registry metadata.
4. Move VS Code DTO parsing to `@gsd-build/contracts`.
5. Decide Studio role:
   - either wire it to the same contracts
   - or mark it explicitly as prototype/non-runtime until wired
6. Add app contract tests for authenticated web flows and adapter payloads.

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

## File Ownership Map

| Phase | Primary owners | Must not overlap with |
| --- | --- | --- |
| 0 | metrics scripts, test fixtures, docs for baseline command | implementation refactors in auto/DB/web |
| 1 | `packages/contracts`, RPC/MCP/web/VS Code contract adapters | prompt builder rewrites that change payload shape |
| 2 | system prompt, skill filtering, GSD prompt/context compiler | workflow kernel side-effect moves |
| 3 | build/test scripts and web fingerprinting | test fixture schema moves from Phase 1 without coordination |
| 4 | auto-mode kernel/facade/adapters | DB module moves and prompt compiler churn in same files |
| 5 | DB internals and repositories | workflow kernel changes that depend on DB private functions |
| 6 | web store, bridge, MCP, VS Code, Studio adapters | contracts package breaking changes |
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
2. Phase 1: Contracts Foundation
3. Phase 2: Token and Context Reduction
4. Phase 3: Build/Test Speed
5. Phase 4: Workflow Kernel
6. Phase 5: DB Split
7. Phase 6: App Surface
8. Phase 7: Process Consolidation
9. Phase 8: Legacy Cleanup

Parallel work is allowed only inside a phase when file ownership is disjoint and the phase lead owns integration.

## Done Definition For The Whole Program

- Prompt/context size is materially lower and tracked by repeatable metrics.
- Shared contracts are used across runtime, RPC client, MCP, web, VS Code, and Studio status.
- Warm local verification is materially faster while full `verify:pr` remains intact.
- Auto-mode has a pure testable workflow kernel and explicit side-effect adapters.
- DB internals are split without weakening the single-writer invariant.
- Web/app surfaces consume shared contracts and have thinner stores/adapters.
- Shipping paths produce one consistent PR evidence format.
- Legacy paths are removed only after telemetry, tests, and migration notes.
