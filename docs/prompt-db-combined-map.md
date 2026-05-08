# GSD-2 Prompt ↔ Database Combined Map

> How each prompt in the pipeline reads and writes the database, and which DB state drives which prompt to fire.

See also:
- [prompt-map.md](./prompt-map.md) — full prompt system detail
- [db-map.md](./db-map.md) — full database schema detail

---

## 1. Master Flow: State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                         gsd.db (SQLite WAL)                         │
│                                                                     │
│  milestones  slices  tasks  quality_gates  workers  unit_dispatches │
│  memories  artifacts  decisions  requirements  runtime_kv  ...      │
└──────────────────────┬──────────────────────────────────────────────┘
                       │  reads
                       ▼
              auto-dispatch.ts
            (DISPATCH_RULES, 29 rules,
             first match → prompt + builder)
                       │
                       ▼
              auto-prompts.ts
           (buildXxxPrompt — inlines
            context from DB + disk files)
                       │
                       ▼
              Pi SDK session.run(prompt)
                       │
                       ▼
                   LLM runs
                       │
                       ▼ calls gsd_* tools
              bootstrap/db-tools.ts
                       │
                       ▼
              gsd-db.ts  (typed write API)
                       │
                 transaction()
                       │
                       ▼
               SQLite writes
                       │
         ┌─────────────┴──────────────┐
         │                            │
         ▼                            ▼
   DB tables updated          Markdown artifacts
   (canonical source)         regenerated + written to disk
         │
         ▼
   auto.ts loop ──► back to auto-dispatch.ts
```

---

## 2. Prompt → DB Read/Write Reference

Each row = one prompt file. Columns show which DB tables it touches and how.

### Setup Phase

| Prompt | DB Reads | DB Writes | Disk Artifact Written |
|--------|----------|-----------|----------------------|
| `guided-workflow-preferences` | — | runtime_kv (research-decision seed) | PREFERENCES.md |
| `guided-discuss-project` | — | artifacts (PROJECT) | PROJECT.md |
| `guided-discuss-requirements` | requirements | requirements (INSERT), artifacts (REQUIREMENTS) | REQUIREMENTS.md |
| `guided-research-decision` | runtime_kv | runtime_kv (research-decision.json key) | — |
| `guided-research-project` | milestones, artifacts | artifacts (RESEARCH × 4 aspects) | M##-RESEARCH.md |

### Milestone Planning Phase

| Prompt | DB Reads | DB Writes | Disk Artifact Written |
|--------|----------|-----------|----------------------|
| `discuss` / `guided-discuss-milestone` | milestones, artifacts | artifacts (CONTEXT) | M##-CONTEXT.md |
| `discuss-headless` | milestones, artifacts | milestones, slices, decisions, artifacts | M##-CONTEXT.md, DECISIONS.md |
| `research-milestone` | milestones, artifacts | artifacts (RESEARCH) | M##-RESEARCH.md |
| `plan-milestone` | milestones, slices | milestones (UPDATE planning), slices (INSERT), tasks (INSERT), decisions | ROADMAP.md, S##-PLAN.md sketches |
| `queue` | milestones | milestones (INSERT queued), artifacts (CONTEXT) | PROJECT.md, QUEUE.md |

### Slice Planning Phase

| Prompt | DB Reads | DB Writes | Disk Artifact Written |
|--------|----------|-----------|----------------------|
| `parallel-research-slices` | slices, artifacts | artifacts (RESEARCH per slice) | S##-RESEARCH.md × N |
| `guided-discuss-slice` | slices, artifacts | artifacts (CONTEXT) | S##-CONTEXT.md |
| `research-slice` / `guided-research-slice` | slices, memories | artifacts (RESEARCH), memories (hit_count++) | S##-RESEARCH.md |
| `plan-slice` | slices, tasks, memories | slices (UPDATE planning), tasks (INSERT), memories (hit_count++) | S##-PLAN.md, T##-PLAN.md |
| `refine-slice` | slices (is_sketch=1), tasks | slices (UPDATE is_sketch=0), tasks (INSERT/UPDATE) | S##-PLAN.md |

### Execution Phase

| Prompt | DB Reads | DB Writes | Disk Artifact Written |
|--------|----------|-----------|----------------------|
| `execute-task` | tasks, slices, milestones, memories, quality_gates | tasks (UPDATE status, narrative, summary), verification_evidence (INSERT), memories (hit_count++) | T##-SUMMARY.md; S##-PLAN.md checkbox |
| `guided-resume-task` | tasks, slices | tasks (UPDATE status, summary), verification_evidence (INSERT) | T##-SUMMARY.md |
| `reactive-execute` | tasks | tasks (via N× execute-task subagents) | T##-SUMMARY.md × N |
| `quick-task` | — | — (no DB; writes summaryPath directly) | {{summaryPath}} |

### Quality Gate Phase

| Prompt | DB Reads | DB Writes | Disk Artifact Written |
|--------|----------|-----------|----------------------|
| `gate-evaluate` | quality_gates | quality_gates (UPDATE), gate_runs (INSERT) | gate result per subagent |
| `validate-milestone` | milestones, slices, tasks, quality_gates | assessments (INSERT VALIDATION) | VALIDATION.md |
| `run-uat` | slices, assessments | assessments (INSERT ASSESSMENT) | S##-ASSESSMENT.md |

### Completion Phase

| Prompt | DB Reads | DB Writes | Disk Artifact Written |
|--------|----------|-----------|----------------------|
| `complete-slice` | tasks, slices | slices (UPDATE status+summary), tasks (cascade skipped) | S##-SUMMARY.md, S##-UAT.md; ROADMAP.md checkpoint |
| `reassess-roadmap` | milestones, slices | milestones (UPDATE), slices (INSERT/UPDATE/DELETE), assessments | ROADMAP.md, ASSESSMENT.md |
| `complete-milestone` | milestones, slices, tasks | milestones (UPDATE status=closed, completed_at) | M##-SUMMARY.md |

### Maintenance Phase

| Prompt | DB Reads | DB Writes | Disk Artifact Written |
|--------|----------|-----------|----------------------|
| `replan-slice` | slices, tasks | slices, tasks, replan_history, quality_gates | S##-PLAN.md, S##-REPLAN.md |
| `rethink` | milestones, slices, artifacts | slices (UPDATE status=skipped), milestones (UPDATE sequence) | QUEUE-ORDER.json, PARKED.md |
| `rewrite-docs` | decisions, requirements, artifacts | decisions, requirements, artifacts | DECISIONS.md, REQUIREMENTS.md, task/slice plans |
| `doctor-heal` | slices, tasks, artifacts | artifacts (repair CONTEXT/SUMMARY/UAT) | repairs existing artifacts |
| `review-migration` | milestones, slices, tasks, artifacts, decisions, requirements | — (read-only audit) | — |
| `scan` | — | — | STACK.md, INTEGRATIONS.md, ARCHITECTURE.md |
| `debug-diagnose` | memories | memories (INSERT pattern/gotcha), memories (hit_count++) | — |
| `forensics` | audit_events, gate_runs, turn_git_transactions | — (read-only) | — |
| `triage-captures` | artifacts (CAPTURES) | artifacts (CAPTURES, updated classifications) | CAPTURES.md |
| `add-tests` | tasks, slices | — | test files (via code execution) |
| `heal-skill` | — | — | skill-review-queue.md |

---

## 3. DB State → Which Prompt Fires

The dispatch loop reads DB state to determine which prompt to issue next. This is the precise join between DB and prompt layer:

```
DB State                                           → Prompt Dispatched
───────────────────────────────────────────────────────────────────────
PREFERENCES.md missing                             → guided-workflow-preferences

artifacts WHERE artifact_type='PROJECT' missing    → guided-discuss-project

requirements table empty                           → guided-discuss-requirements

runtime_kv[scope='global', key='research-decision']
  absent or value='pending'                        → guided-research-decision

runtime_kv[research-decision]='deep' AND
  M##-RESEARCH artifacts missing                   → guided-research-project × 4 subagents

milestones.status='active' AND
  artifacts WHERE artifact_type='CONTEXT' missing  → discuss / guided-discuss-milestone

CONTEXT present AND
  M##-RESEARCH missing AND complexity='high'       → research-milestone

CONTEXT present AND
  slices WHERE milestone_id=M## count = 0          → plan-milestone

slices exist AND
  S##-RESEARCH artifacts missing                   → parallel-research-slices × N subagents

slices WHERE slice_id=S## AND
  S##-CONTEXT artifact missing                     → guided-discuss-slice

S##-CONTEXT present AND
  tasks WHERE slice_id=S## count = 0               → plan-slice

slices WHERE is_sketch = 1                         → refine-slice

tasks WHERE status='pending' AND count ≥ 3         → reactive-execute (parallel)

tasks WHERE status='pending' AND count < 3         → execute-task (sequential)

quality_gates WHERE status='pending'               → gate-evaluate

tasks all status='complete' AND
  S##-ASSESSMENT artifact missing                  → run-uat

tasks all complete AND
  slices.status ≠ 'complete'                       → complete-slice

slice just completed AND
  roadmap requires update                          → reassess-roadmap

slices all complete AND
  VALIDATION artifact missing                      → validate-milestone

VALIDATION present AND
  milestones.status ≠ 'closed'                     → complete-milestone

milestones.status = 'closed' AND
  next milestone in queue                          → loop: next milestone

nothing matches                                    → stop
```

---

## 4. Full Data Lineage: Task Completion

One task's full DB journey from creation to completion:

```
plan-milestone prompt fires
  └─► gsd_plan_milestone tool
        └─► INSERT INTO slices (milestone_id, id, title, status='pending', is_sketch=1, sequence)
        └─► INSERT INTO tasks (milestone_id, slice_id, id, title, status='pending', description, sequence)

refine-slice prompt fires (if is_sketch=1)
  └─► gsd_plan_slice tool
        └─► UPDATE slices SET is_sketch=0, goal, success_criteria, proof_level, ...
        └─► INSERT INTO tasks (full task plans for this slice)
        └─► UPDATE tasks SET full_plan_md, description, estimate, files, verify, ...

execute-task prompt fires
  └─► (reads) tasks WHERE id=T## → full_plan_md, description, estimate, files, verify
  └─► (reads) slices WHERE id=S## → goal, success_criteria
  └─► (reads) memories FTS → relevant knowledge
  └─► (reads) quality_gates WHERE status='pending' → gates to close
  └─► LLM executes the task
  └─► gsd_task_complete tool
        └─► UPDATE tasks SET
              status='complete',
              one_liner, narrative, verification_result,
              full_summary_md, key_files, key_decisions,
              completed_at, blocker_discovered
        └─► INSERT INTO verification_evidence (command, exit_code, verdict, duration_ms)
        └─► UPDATE quality_gates SET status='evaluated', verdict (if gate was open)
        └─► INSERT INTO gate_runs (audit)
        └─► Write T##-SUMMARY.md to disk
        └─► Toggle checkbox in S##-PLAN.md

complete-slice prompt fires (after all tasks complete)
  └─► gsd_slice_complete tool
        └─► UPDATE slices SET status='complete', full_summary_md, full_uat_md, completed_at
        └─► UPDATE tasks SET status='skipped' WHERE status='pending' (cascade)
        └─► Write S##-SUMMARY.md, S##-UAT.md to disk
        └─► Toggle checkpoint in ROADMAP.md

complete-milestone prompt fires (after all slices complete)
  └─► gsd_complete_milestone tool
        └─► UPDATE milestones SET status='closed', completed_at
        └─► Write M##-SUMMARY.md to disk
```

---

## 5. Memory System: capture_thought → memory_query

```
execute-task / debug-diagnose / complete-milestone prompts
  └─► capture_thought(category, content)
        └─► INSERT INTO memories (id, category, content, confidence, source_unit_type, created_at)
        └─► FTS triggers fire: INSERT INTO memories_fts

later execute-task / plan-slice / research-slice prompts
  └─► memory_query(keywords)
        └─► SELECT FROM memories_fts WHERE content MATCH keywords  (FTS5)
             OR  SELECT FROM memories WHERE content LIKE '%keywords%' LIMIT cap  (fallback)
        └─► incrementMemoryHitCount(id, now):
            UPDATE memories SET hit_count = hit_count + 1, last_hit_at = now  ← V28
        └─► queryMemoriesRanked applies memoryDecayFactor(last_hit_at):
            score *= max(0.7, 1.0 - 0.3 * min(1.0, daysAgo/90))               ← V28
        └─► Returns ranked memory rows → inlined into {{inlinedContext}}
```

### Artifact Integrity Fingerprint (V27)

Every prompt that writes an artifact (e.g. `guided-discuss-project` writing
`artifacts (PROJECT)`, `complete-slice` writing the slice summary) flows through
`insertArtifact` in `gsd-db.ts`, which now computes and persists a SHA-256 of
`full_content` alongside the row:

```
prompt → gsd_summary_save tool → insertArtifact({...})
  └─► content_hash = createHash('sha256').update(full_content).digest('hex')   ← V27
  └─► INSERT OR REPLACE INTO artifacts (..., content_hash) VALUES (..., :hash)
```

The hash is read-only metadata for now (no consumers verify it yet); the column
exists so future integrity-check tooling can detect manual edits or truncated
writes without breaking older binaries (column is nullable).

---

## 6. Coordination: Auto-Mode Multi-Worker DB Interactions

```
worker process starts
  └─► INSERT INTO workers (worker_id, host, pid, started_at, version, status)

worker claims a milestone
  └─► INSERT INTO milestone_leases (milestone_id, worker_id, fencing_token, expires_at, status='active')
  └─► (unique PK on milestone_id prevents two workers claiming same milestone)

worker dispatches a unit
  └─► INSERT INTO unit_dispatches (trace_id, turn_id, worker_id, milestone_lease_token,
                                   milestone_id, slice_id, task_id, unit_type, unit_id,
                                   status='claimed', attempt_n, started_at)
  └─► unique partial index: only one row with status IN ('claimed','running') per unit_id

user cancels
  └─► INSERT INTO cancellation_requests (scope, scope_id, dispatch_id, reason, status='pending')
  └─► worker polls: SELECT FROM cancellation_requests WHERE status='pending'
  └─► UPDATE cancellation_requests SET status='acked', acked_worker_id, acked_at

command broadcast
  └─► INSERT INTO command_queue (target_worker=NULL, command, args_json)  ← NULL = all workers
  └─► INSERT INTO command_queue (target_worker='w-123', command, args_json) ← targeted

unit completes
  └─► UPDATE unit_dispatches SET status='done'|'failed', ended_at, exit_reason, error_summary
  └─► (all further state from gsd_task_complete, gsd_slice_complete, etc.)
```

---

## 7. Schema File → Tables Defined

| Source File | Tables |
|------------|--------|
| `db-base-schema.ts` | schema_version, decisions, requirements, artifacts, memories, memory_processed_units, memory_sources, memory_embeddings, memory_relations, milestones, slices, tasks, verification_evidence, replan_history, assessments, quality_gates, slice_dependencies, gate_runs, turn_git_transactions, milestone_commit_attributions, audit_events, audit_turn_index + all indexes + active_decisions/active_requirements/active_memories views |
| `db-coordination-schema.ts` | workers, milestone_leases, unit_dispatches, cancellation_requests, command_queue |
| `db-memory-fts-schema.ts` | memories_fts (FTS5 virtual table), memories_ai/ad/au triggers |
| `db-runtime-kv-schema.ts` | runtime_kv |
| `db-verification-evidence-schema.ts` | verification_evidence dedup index (helper for V13 migration) |
| `eval-review-schema.ts` | eval_reviews (EVAL-REVIEW status tracking, separate from milestone validation) |

---

## 8. Accessor Layer → Tables

| Row Accessor File | Tables It Accesses |
|------------------|--------------------|
| `db-task-slice-rows.ts` | slices, tasks (row → typed struct parsers) |
| `db-milestone-artifact-rows.ts` | milestones, artifacts (row → typed struct parsers) |
| `db-decision-requirement-rows.ts` | decisions, requirements (row → typed struct parsers) |
| `db-gate-rows.ts` | quality_gates (row → GateRow) |
| `db-verification-evidence-rows.ts` | verification_evidence (row → VerificationEvidenceRow) |
| `db-lightweight-query-rows.ts` | tasks (IdStatusSummary, ActiveTaskSummary, TaskStatusCounts aggregates) |

---

## 9. Key Invariants (Cross-Cutting)

| Invariant | Where Enforced |
|-----------|---------------|
| Single-writer: all DB writes through `gsd-db.ts` typed API | structural test `single-writer-invariant.test.ts` |
| Cascade on slice complete: pending tasks → skipped | `gsd_slice_complete` transaction |
| Cascade on milestone reopen: all slices → in_progress, tasks → pending | `gsd_milestone_reopen` transaction |
| No nested transactions | `db-transaction.ts` depth counter |
| Workspace isolation: one DB per project root, shared across worktrees via WAL | `db-connection-cache.ts` identityKey |
| Coordination: one active dispatch per unit_id at a time | `idx_unit_dispatches_active_per_unit` unique partial index |
| Memory FTS fallback: LIKE scan if FTS5 unavailable | `tryCreateMemoriesFtsSchema` onUnavailable callback |
| Pre-migration backup: .db.bak-vN before any migration run | `db-migration-backup.ts` |
| Prompt template vars: all `{{vars}}` must be provided before substitution | `prompt-loader.ts` pre-substitution validation |
| Prompt cache stability: static sections always before dynamic | `prompt-ordering.ts` reorderForCaching |
