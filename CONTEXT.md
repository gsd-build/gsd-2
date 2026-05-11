# CONTEXT

## Domain glossary

- **Auto Orchestration**: runtime coordination of GSD auto-mode units from start to completion, including dispatch, recovery, and stop/resume behavior.
- **Unit**: the smallest executable workflow step (e.g., plan slice, execute task, complete slice).
- **Unit progression**: movement from one Unit to the next under orchestration rules.
- **Dispatch decision**: selection of the next Unit plus rationale and preconditions.
- **Recovery decision**: retry/escalate/abort choice after runtime failure.
- **Runtime persistence**: lock state, transition journal, and any persisted execution state required for safe resume.
- **DB snapshot persistence**: crash-safe persistence of a full SQLite image exported from `sql.js`, written as a same-directory temporary file and atomically renamed over the live database path.
- **Worktree Lifecycle**: creation, entry, teardown, and merge of an auto-mode worktree, including `s.basePath` mutation, `process.chdir` discipline, and milestone lease coordination.
- **Worktree State Projection**: directional flow of state files between the project root and the auto-worktree, where one side is authoritative per file class (e.g., project root is authoritative for `completed-units.json` after crash recovery; worktree is authoritative for in-flight artifacts).
- **Drift**: a state-shape mismatch between DB rows, disk artifacts, and in-memory state that has a known repair. Distinct from a `blocker`, which describes a terminal condition needing human attention or recovery escalation.
- **Drift catalog**: the discriminated union of drift kinds the State Reconciliation Module recognizes and can repair.

## Architecture terms adopted for this area

- **Auto Orchestration module**: the module that owns unit lifecycle control-flow.
- **Dispatch adapter**: adapter behind the Dispatch seam.
- **Recovery adapter**: adapter behind the Recovery seam.
- **Worktree adapter**: adapter behind the Worktree seam.
- **Health adapter**: adapter behind the Health seam.
- **Runtime persistence adapter**: adapter behind the Runtime persistence seam.
- **Notification adapter**: adapter behind the Notification seam.
- **DB snapshot persistence module**: the deep module that owns `sql.js` snapshot write semantics, including temp-file naming, fsync, cleanup, and rename ordering.
- **State Reconciliation module**: module that runs `reconcileBeforeDispatch` before any Dispatch decision or worker spawn. Surfaces terminal `blockers: string[]` and machine-actionable `DriftRecord[]`. Owns the drift catalog (detectors and idempotent repairs). Throws `ReconciliationFailedError` to Recovery Classification on persistent or repair-failed drift. See `docs/dev/ADR-017-state-reconciliation-drift-driven.md`.
- **Worktree Safety module**: module that validates project root, worktree registration, lease ownership, and git health before a source-writing Unit runs.
- **Worktree Lifecycle module**: module that owns worktree create/enter/teardown/merge verbs, `s.basePath` mutation, and `process.chdir` discipline. Sole owner of these mutations across single-loop and parallel callers.
- **Worktree State Projection module**: module that owns the direction-and-rules of state file flow between project root and auto-worktree. Encodes the bug-hardened invariants (additive milestone copy, ASSESSMENT verdict overwrite, completed-units forward-sync, WAL/SHM cleanup) that `syncProjectRootToWorktree` and `syncStateToProjectRoot` carry today.
- **Recovery Classification module**: module that maps provider, tool, policy, git, worktree, runtime, and reconciliation-drift failures to a Recovery decision.
- **Tool Contract module**: module that keeps Unit prompts, tool schemas, tool policy, and pre-dispatch validation aligned.
- **DriftRecord**: typed, machine-actionable signal of a single drift instance. Discriminated union over drift kinds; carries the identifiers (e.g., milestone id, slice id) the matching repair needs.
- **Drift repair**: idempotent function that resolves one `DriftRecord`. Repairs are owned by the State Reconciliation Module's `drift/` folder; owning modules retain raw primitives (DB writes, file IO) but not the detection-and-repair composition.
- **Reconciliation pass**: one cycle of derive → detect drift → apply repairs → re-derive, performed by `reconcileBeforeDispatch`. Capped at 2 passes per call; loops only when the prior pass fully succeeded but new drift surfaces in the re-derive.

## Current decision in force

- Auto-mode architecture should deepen around a single Auto Orchestration module with interface:
  - `start(sessionContext)`
  - `advance()`
  - `resume()`
  - `stop(reason)`
  - `getStatus()`

See `docs/dev/ADR-014-auto-orchestration-deep-module.md`.

- Runtime invariants should deepen into four first-class modules: State Reconciliation, Worktree Safety, Recovery Classification, and Tool Contract.

See `docs/dev/ADR-015-runtime-invariant-modules.md`.

- Auto Orchestration `advance()` should call invariant modules explicitly in sequence rather than hiding the pre-dispatch pipeline inside the Dispatch adapter:
  - State Reconciliation
  - Dispatch decision
  - Tool Contract
  - Worktree Safety
  - Runtime persistence/journal

Dispatch remains responsible for selecting the next Unit from reconciled state. It should not own DB/disk repair, tool-policy compilation, or worktree root preparation.

- Worktree Safety should fail closed for source-writing Units under worktree isolation. A Unit whose Tool Contract permits writes outside `.gsd/**` must run in a proven milestone worktree root; it must not silently degrade to project-root source writes when the worktree is missing, empty, unregistered, on the wrong branch, or no longer lease-owned. Planning-only Units may continue to write `.gsd/**` artifacts at the project root.

- State Reconciliation should be drift-driven. The Module surfaces terminal `blockers: string[]` and machine-actionable `DriftRecord[]`. Each pre-dispatch and pre-spawn site calls `reconcileBeforeDispatch` (strict closure). Drift catalog includes sketch-flag, merge-state, stale-render, stale-worker, unregistered-milestone, roadmap-divergence, missing-completion-timestamp. Repairs are idempotent. Re-derive is capped at 2 passes (loops only on cascading-drift success path). Persistent or repair-failed drift throws `ReconciliationFailedError` to Recovery Classification (kind `reconciliation-drift`).

  See `docs/dev/ADR-017-state-reconciliation-drift-driven.md`.

## Current implementation snapshot (phase 1)

- `auto.ts` now wires a concrete Auto Orchestration module through `createWiredAutoOrchestrationModule(...)`.
- Session state now carries orchestration status via `AutoSession.orchestration`.
- Runtime snapshot exports orchestration telemetry (`orchestrationPhase`, `orchestrationTransitionCount`, `orchestrationLastTransitionAt`).
- Initial adapters are live for Dispatch, Health, and Runtime persistence seams.
- Main auto-loop dispatch is still the existing path; orchestration seam is integrated incrementally for lifecycle and observability.

## Triage synthesis (2026-05-05)

Recent triage showed repeated failures concentrated in orchestration state coherence, worktree hygiene, and tool-surface contracts.

### Common issue families

- **State drift between DB, disk artifacts, and in-memory loop state**
- Stale flags/rows repeatedly re-dispatch units (`is_sketch`, stale worker/lock, stale sequence/dependency rows)
- Disk artifacts exist but DB status lags or never reconciles (`PROJECT.md` milestone registration, completion timestamps, roadmap divergence)
- Recovery helpers exist but are not wired into dispatch/state derivation paths

- **Worktree lifecycle and path-root ambiguity**
- Units dispatch into ghost/invalid worktree roots (`.git` missing, fallback path-only creation, non-worktree git operations)
- Health checks are unit-specific instead of lifecycle-wide, allowing earlier units to write in invalid roots
- Worktree exit/merge decisions rely on brittle artifact signals instead of authoritative branch/commit state

- **Auto-loop recovery policy gaps**
- Deterministic and schema-validation failure modes are misclassified as generic provider failures
- Retry counters and stuck-loop controls are inconsistently keyed or reset across pause/resume boundaries
- Terminal guardrails are bypassed in side branches (e.g., complete-milestone placeholder behavior)

- **Tool contract mismatches**
- Prompt/tool/schema drift causes repeated invalid calls (`gsd_exec` runtime enums, closeout prompts vs policy constraints)
- Tool availability/surface inconsistencies under session boot/registration timing
- Validation happens too late (pre-exec catches issues that planner tools should reject upfront)

- **Provider/platform integration edge cases**
- Windows process/pipe semantics (`EOF`/abort timing) not normalized with POSIX assumptions
- Provider-specific metadata/capabilities not fully surfaced (reasoning support, context budgeting semantics, model override behavior)

- **Telemetry and diagnosis blind spots**
- Exit reasons collapse into `other`, masking repeatable failure classes
- Missing/imbalanced lifecycle events (`iteration-end`, dispatch/settlement gaps) weaken forensics and automated recovery decisions

### Priority review focus areas

- **Dispatch and state derivation invariants**
- Verify every state gate has a deterministic DB+disk reconciliation path before dispatch
- Ensure sketch/refine/plan transitions clear lifecycle flags atomically

- **Recovery and error classification**
- Add explicit classes for tool-schema overload, deterministic policy blocks, stale worker states, and worktree invalidity
- Ensure each class maps to an intentional action (`retry`, `pause with remediation`, `self-heal`, `stop`)

- **Worktree safety envelope**
- Enforce root validity checks for all source-writing unit types, not only `execute-task`
- Fail closed on worktree creation/registration errors; do not spawn workers into unresolved paths

- **Prompt-policy-tool alignment**
- Review every unit prompt against effective tools policy and schema enums
- Remove contradictory instructions (e.g., “fix failures” where policy forbids writes)

- **Migration and reconciliation**
- Add startup and pre-dispatch reconciliation for PROJECT/ROADMAP/DB drift
- Persist completion metadata consistently during recover/import flows

- **Observability completeness**
- Normalize exit reasons with dedicated buckets
- Guarantee dispatch lifecycle event pairs and settlement records for each unit attempt

### Deepening opportunities from triage

#### State Reconciliation module

- Files: `state.ts`, `gsd-db.ts`, `db-writer.ts`, `md-importer.ts`, `auto-recovery.ts`, PROJECT/ROADMAP parsers
- Problem: DB rows, markdown projections, and cached state are reconciled opportunistically. Helpers such as sketch-flag repair exist but are not wired into the state path, so bugs reappear as wrong Dispatch decisions.
- Refactor target: expose one pre-dispatch reconciliation Interface, e.g. `reconcileBeforeDispatch(basePath)`, that refreshes DB reads, repairs known projection drift, returns blocking inconsistencies, and invalidates derived-state caches.
- Leverage: Dispatch and recovery callers stop needing to know each artifact-specific repair rule.
- Locality: sketch flags, PROJECT milestone registration, ROADMAP sequence/dependency sync, completion timestamps, and artifact/DB mismatch handling move into one module.
- Test focus: call the Interface with DB+disk fixture states and assert the resulting state changes or blockers.

#### Worktree Safety module

- Files: `worktree-resolver.ts`, `auto/phases.ts`, `auto-worktree.ts`, `worktree-manager.ts`, parallel and slice-parallel orchestrators, git helpers
- Problem: worktree validity is checked in scattered, unit-specific places. Some paths build a worktree path string without proving it is registered, has `.git`, owns the lease, and matches `GSD_PROJECT_ROOT`.
- Refactor target: expose one Interface for source-writing Units, e.g. `prepareUnitRoot(unitType, unitId)`, that returns a valid root or a typed `worktree-invalid` Recovery decision.
- Leverage: every source-writing Unit receives the same root validation, lease fencing, and failure classification.
- Locality: ghost worktree, missing `.git`, stale worktree, branch/HEAD mismatch, and worktree cleanup logic are reviewed in one module.
- Test focus: invalid root, missing `.git`, stale path-only fallback, branch mismatch, and `GSD_PROJECT_ROOT` cases.

#### Recovery Classification module

- Files: `error-classifier.ts`, `bootstrap/agent-end-recovery.ts`, `auto-post-unit.ts`, `auto-timeout-recovery.ts`, `crash-recovery.ts`, `provider-error-pause.ts`
- Problem: recovery behavior is distributed across provider handlers, post-unit verification, timeout recovery, and crash cleanup. New deterministic failures often fall through as generic provider errors or `other` exit reasons.
- Refactor target: expose one failure taxonomy Interface, e.g. `classifyFailure(input) -> Recovery decision`, with explicit classes for tool schema, deterministic policy, stale worker, worktree invalid, provider quota, network, and verification drift.
- Leverage: callers ask for a Recovery decision instead of re-implementing retry/pause/stop semantics.
- Locality: bounded retries, pause messages, auto-resume behavior, exit reason normalization, and telemetry buckets are changed together.
- Test focus: table-driven classification and action tests covering every known triage failure family.

#### Tool Contract module

- Files: `unit-context-manifest.ts`, prompts under `prompts/`, `bootstrap/write-gate.ts`, `bootstrap/exec-tools.ts`, `workflow-tool-executors.ts`, `pre-execution-checks.ts`, `tools/plan-slice.ts`
- Problem: Unit prompts, tool schemas, and tool policy drift independently. The model can be instructed to do work the policy blocks, or call a schema value the tool rejects. Some validation waits until after planning artifacts are committed.
- Refactor target: compile a Unit Tool Contract before dispatch that includes prompt obligations, allowed tools, schema enum values, validation requirements, and closeout tools.
- Leverage: prompt authors and dispatch code get one reviewable contract per Unit type.
- Locality: prompt wording, policy gates, schema descriptions, and planner-time validation stop drifting across files.
- Test focus: prompt/policy/schema parity tests and planner tool validation tests for concrete task inputs.

#### Auto Orchestration adapter depth pass

- Files: `auto/orchestrator.ts`, `auto/contracts.ts`, `auto/phases.ts`, `auto.ts`, `auto-post-unit.ts`
- Problem: ADR-014 introduced adapter seams, but adapter boundaries can become too shallow if Dispatch hides unrelated pre-dispatch invariants. That would make `advance()` look simple while preserving the same cross-cutting state repair, tool-contract, and worktree-safety coupling behind a larger Dispatch adapter.
- Refactor target: keep `advance()` as the explicit lifecycle pipeline owner. It should call State Reconciliation before Dispatch, then call Tool Contract and Worktree Safety checks for the selected Unit before persisting/journaling the transition.
- Leverage: reviewers can inspect orchestration ordering in one place, tests can assert the invariant sequence directly, and each adapter stays deep around one concern.
- Locality: orchestration flow remains in Auto Orchestration; invariant modules own their own policy; Dispatch only selects the next Unit from reconciled state.
- Test focus: contract tests for `advance()` ordering, short-circuit behavior, idempotency for the same reconciled snapshot, and typed failure handoff to Recovery Classification.

### Refactor order

- Start with the **Auto Orchestration adapter depth pass** so `advance()` has an explicit invariant pipeline before individual modules are extracted underneath it.
- Then implement the **State Reconciliation module** and **Worktree Safety module**. They address the highest-cost loops and prevent invalid Dispatch decisions before a model turn is launched.
- Follow with the **Recovery Classification module** to normalize outcomes once invalid runtime states are no longer the dominant source of noise.
- Then add the **Tool Contract module** to prevent prompt/schema/policy drift from creating new recovery cases.

### Standing review checklist for this context

- Is DB state authoritative, and if yes, where is disk->DB reconciliation guaranteed?
- Can this unit dispatch into an invalid basePath/worktree and still mutate artifacts?
- Are retry/stuck-loop counters stable across pause/resume and keyed consistently by unit identity?
- Do prompt instructions require tools or writes blocked by the current policy?
- Can tool schema/documentation mismatch induce repeated invalid calls?
- Does each abnormal stop path produce a distinct reason code and actionable remediation?
