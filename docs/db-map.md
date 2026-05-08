# GSD-2 Database Map

> Complete schema, access layer, migration history, and cross-reference to the prompt system.

---

## 1. Database Infrastructure Stack

```
gsd_* tool call (from LLM)
       │
       ▼
bootstrap/db-tools.ts          ← tool registration + input parsing
       │
       ▼
tools/workflow-tool-executors.ts  ← business logic
       │
       ├── validation reads (milestones, slices, tasks)
       │
       ▼
gsd-db.ts  ← typed write API, transaction wrapper
       │
       ├── transaction()  (db-transaction.ts — depth counter, no nested BEGIN)
       │
       ▼
db-adapter.ts  ← normalized prepared-statement cache
       │
       ▼
db-provider.ts  ← node:sqlite (primary) or better-sqlite3 (fallback)
       │
       ▼
SQLite WAL  (.gsd/gsd.db)
       │
       ▼
After commit: regenerate markdown artifacts → write to disk → invalidate cache
```

**Connection scoping (db-connection-cache.ts):**
- Keyed by workspace `identityKey` (realpath of project root)
- Sibling worktrees share the same `.gsd/gsd.db` via SQLite WAL
- Only one connection is "active" at a time; others cached for fast re-activation
- On process exit: checkpoint WAL → vacuum → close

**Provider fallback chain:**
1. `node:sqlite` (Node ≥ 22 built-in) — preferred
2. `better-sqlite3` (npm) — fallback if node:sqlite unavailable
3. null → DB unavailable (non-fatal; GSD degrades gracefully)

---

## 2. Schema Version History

Current version: **V28**

| Version | What Changed |
|---------|-------------|
| V1 | schema_version + decisions + requirements tables |
| V2 | artifacts table |
| V3 | memories + memory_processed_units; FTS3 |
| V4 | decisions.made_by column |
| V5 | **Core hierarchy**: milestones, slices, tasks, verification_evidence |
| V6 | slices.full_summary_md, full_uat_md |
| V7 | slices.depends, demo; milestones.depends_on |
| V8 | Deep planning fields on milestones/slices/tasks; replan_history; assessments |
| V9 | sequence ordering on slices + tasks |
| V10 | slices.replan_triggered_at |
| V11 | tasks.full_plan_md; replan_history unique index |
| V12 | quality_gates table (broken DDL, fixed in V22) |
| V13 | Hot-path indexes; verification_evidence dedup index |
| V14 | slice_dependencies table |
| V15 | gate_runs, turn_git_transactions, audit_events, audit_turn_index |
| V16 | slices.is_sketch, sketch_scope (ADR-011); decisions.source |
| V17 | tasks escalation columns (blocker_source, escalation_*) |
| V18 | memory_sources; memories.scope + tags |
| V19 | memory_embeddings; memories_fts (FTS5 virtual table + triggers) |
| V20 | memory_relations |
| V21 | memories.structured_fields |
| V22 | quality_gates table repair (task_id constraint); scope column |
| V23 | milestones.sequence |
| V24 | **Auto-mode coordination**: workers, milestone_leases, unit_dispatches, cancellation_requests, command_queue |
| V25 | runtime_kv (soft state KV with global/worker/milestone scope) |
| V26 | milestone_commit_attributions |
| V27 | artifacts.content_hash (SHA-256 of full_content, computed on every insertArtifact) |
| V28 | memories.last_hit_at; incrementMemoryHitCount sets it; queryMemoriesRanked applies time-decay (1.0 → 0.7 floor over 90 days) |

---

## 3. Complete Table Inventory

### 3a. Core Hierarchy (V1, V5–V11)

#### `schema_version`
```
version    INTEGER NOT NULL
applied_at TEXT NOT NULL
```
Tracks which migrations have run.

---

#### `decisions`
```
seq            INTEGER PRIMARY KEY AUTOINCREMENT
id             TEXT NOT NULL UNIQUE
when_context   TEXT NOT NULL DEFAULT ''
scope          TEXT NOT NULL DEFAULT ''
decision       TEXT NOT NULL DEFAULT ''
choice         TEXT NOT NULL DEFAULT ''
rationale      TEXT NOT NULL DEFAULT ''
revisable      TEXT NOT NULL DEFAULT ''
made_by        TEXT NOT NULL DEFAULT 'agent'     ← V4
source         TEXT NOT NULL DEFAULT 'discussion' ← V16
superseded_by  TEXT DEFAULT NULL
```
- Index: `idx_memories_active` (superseded_by)
- View: `active_decisions` WHERE superseded_by IS NULL

---

#### `requirements`
```
id                TEXT PRIMARY KEY
class             TEXT NOT NULL DEFAULT ''
status            TEXT NOT NULL DEFAULT ''
description       TEXT NOT NULL DEFAULT ''
why               TEXT NOT NULL DEFAULT ''
source            TEXT NOT NULL DEFAULT ''
primary_owner     TEXT NOT NULL DEFAULT ''
supporting_slices TEXT NOT NULL DEFAULT ''
validation        TEXT NOT NULL DEFAULT ''
notes             TEXT NOT NULL DEFAULT ''
full_content      TEXT NOT NULL DEFAULT ''
superseded_by     TEXT DEFAULT NULL
```
- View: `active_requirements` WHERE superseded_by IS NULL

---

#### `artifacts` (V2)
```
path          TEXT PRIMARY KEY
artifact_type TEXT NOT NULL DEFAULT ''
milestone_id  TEXT DEFAULT NULL
slice_id      TEXT DEFAULT NULL
task_id       TEXT DEFAULT NULL
full_content  TEXT NOT NULL DEFAULT ''
imported_at   TEXT NOT NULL DEFAULT ''
content_hash  TEXT DEFAULT NULL                  ← V27, SHA-256 of full_content
```
Stores markdown artifact content (PROJECT, REQUIREMENTS, SUMMARY, RESEARCH, CONTEXT, etc.).
V27: `content_hash` is computed and stored on every `insertArtifact` for integrity fingerprinting.

---

#### `milestones` (V5)
```
id                      TEXT PRIMARY KEY
title                   TEXT NOT NULL DEFAULT ''
status                  TEXT NOT NULL DEFAULT 'active'
depends_on              TEXT NOT NULL DEFAULT '[]'   ← JSON array, V7
created_at              TEXT NOT NULL DEFAULT ''
completed_at            TEXT DEFAULT NULL
vision                  TEXT NOT NULL DEFAULT ''           ← V8
success_criteria        TEXT NOT NULL DEFAULT '[]'         ← V8, JSON
key_risks               TEXT NOT NULL DEFAULT '[]'         ← V8, JSON
proof_strategy          TEXT NOT NULL DEFAULT '[]'         ← V8, JSON
verification_contract   TEXT NOT NULL DEFAULT ''           ← V8
verification_integration TEXT NOT NULL DEFAULT ''          ← V8
verification_operational TEXT NOT NULL DEFAULT ''          ← V8
verification_uat        TEXT NOT NULL DEFAULT ''           ← V8
definition_of_done      TEXT NOT NULL DEFAULT '[]'         ← V8, JSON
requirement_coverage    TEXT NOT NULL DEFAULT ''           ← V8
boundary_map_markdown   TEXT NOT NULL DEFAULT ''           ← V8
sequence                INTEGER DEFAULT 0                  ← V23
```
- Index: `idx_milestones_status` (status)
- Status values: `active`, `closed`, `queued`

---

#### `slices` (V5)
```
milestone_id         TEXT NOT NULL
id                   TEXT NOT NULL
title                TEXT NOT NULL DEFAULT ''
status               TEXT NOT NULL DEFAULT 'pending'
risk                 TEXT NOT NULL DEFAULT 'medium'
depends              TEXT NOT NULL DEFAULT '[]'         ← V7, JSON
demo                 TEXT NOT NULL DEFAULT ''           ← V7
created_at           TEXT NOT NULL DEFAULT ''
completed_at         TEXT DEFAULT NULL
full_summary_md      TEXT NOT NULL DEFAULT ''           ← V6
full_uat_md          TEXT NOT NULL DEFAULT ''           ← V6
goal                 TEXT NOT NULL DEFAULT ''           ← V8
success_criteria     TEXT NOT NULL DEFAULT ''           ← V8
proof_level          TEXT NOT NULL DEFAULT ''           ← V8
integration_closure  TEXT NOT NULL DEFAULT ''           ← V8
observability_impact TEXT NOT NULL DEFAULT ''           ← V8
sequence             INTEGER DEFAULT 0                  ← V9
replan_triggered_at  TEXT DEFAULT NULL                  ← V10
is_sketch            INTEGER NOT NULL DEFAULT 0         ← V16
sketch_scope         TEXT NOT NULL DEFAULT ''           ← V16
PRIMARY KEY (milestone_id, id)
FOREIGN KEY milestone_id → milestones(id)
```
- Index: `idx_slices_active` (milestone_id, status)
- Status values: `pending`, `in_progress`, `complete`, `skipped`

---

#### `tasks` (V5)
```
milestone_id                TEXT NOT NULL
slice_id                    TEXT NOT NULL
id                          TEXT NOT NULL
title                       TEXT NOT NULL DEFAULT ''
status                      TEXT NOT NULL DEFAULT 'pending'
one_liner                   TEXT NOT NULL DEFAULT ''
narrative                   TEXT NOT NULL DEFAULT ''
verification_result         TEXT NOT NULL DEFAULT ''
duration                    TEXT NOT NULL DEFAULT ''
completed_at                TEXT DEFAULT NULL
blocker_discovered          INTEGER DEFAULT 0
blocker_source              TEXT NOT NULL DEFAULT ''           ← V17
escalation_pending          INTEGER NOT NULL DEFAULT 0         ← V17
escalation_awaiting_review  INTEGER NOT NULL DEFAULT 0         ← V17
escalation_artifact_path    TEXT DEFAULT NULL                  ← V17
escalation_override_applied_at TEXT DEFAULT NULL              ← V17
deviations                  TEXT NOT NULL DEFAULT ''
known_issues                TEXT NOT NULL DEFAULT ''
key_files                   TEXT NOT NULL DEFAULT '[]'         ← JSON
key_decisions               TEXT NOT NULL DEFAULT '[]'         ← JSON
full_summary_md             TEXT NOT NULL DEFAULT ''
description                 TEXT NOT NULL DEFAULT ''           ← V8
estimate                    TEXT NOT NULL DEFAULT ''           ← V8
files                       TEXT NOT NULL DEFAULT '[]'         ← V8, JSON
verify                      TEXT NOT NULL DEFAULT ''           ← V8
inputs                      TEXT NOT NULL DEFAULT '[]'         ← V8, JSON
expected_output             TEXT NOT NULL DEFAULT '[]'         ← V8, JSON
observability_impact        TEXT NOT NULL DEFAULT ''           ← V8
full_plan_md                TEXT NOT NULL DEFAULT ''           ← V11
sequence                    INTEGER DEFAULT 0                  ← V9
PRIMARY KEY (milestone_id, slice_id, id)
FOREIGN KEY (milestone_id, slice_id) → slices(milestone_id, id)
```
- Indexes: `idx_tasks_active` (milestone_id, slice_id, status), `idx_tasks_escalation_pending`
- Status values: `pending`, `in_progress`, `complete`, `skipped`, `blocked`

---

#### `verification_evidence` (V5)
```
id           INTEGER PRIMARY KEY AUTOINCREMENT
task_id      TEXT NOT NULL DEFAULT ''
slice_id     TEXT NOT NULL DEFAULT ''
milestone_id TEXT NOT NULL DEFAULT ''
command      TEXT NOT NULL DEFAULT ''
exit_code    INTEGER DEFAULT 0
verdict      TEXT NOT NULL DEFAULT ''
duration_ms  INTEGER DEFAULT 0
created_at   TEXT NOT NULL DEFAULT ''
FOREIGN KEY (milestone_id, slice_id, task_id) → tasks
```
- Indexes: `idx_verification_evidence_task`, unique dedup index (V13)

---

#### `replan_history` (V8)
```
id                       INTEGER PRIMARY KEY AUTOINCREMENT
milestone_id             TEXT NOT NULL
slice_id                 TEXT DEFAULT NULL
task_id                  TEXT DEFAULT NULL
summary                  TEXT NOT NULL DEFAULT ''
previous_artifact_path   TEXT DEFAULT NULL
replacement_artifact_path TEXT DEFAULT NULL
created_at               TEXT NOT NULL DEFAULT ''
FOREIGN KEY milestone_id → milestones(id)
```

---

#### `assessments` (V8)
```
path         TEXT PRIMARY KEY
milestone_id TEXT NOT NULL DEFAULT ''
slice_id     TEXT DEFAULT NULL
task_id      TEXT DEFAULT NULL
status       TEXT NOT NULL DEFAULT ''
scope        TEXT NOT NULL DEFAULT ''
full_content TEXT NOT NULL DEFAULT ''
created_at   TEXT NOT NULL DEFAULT ''
FOREIGN KEY milestone_id → milestones(id)
```

---

#### `quality_gates` (V12, repaired V22)
```
milestone_id TEXT NOT NULL
slice_id     TEXT NOT NULL
gate_id      TEXT NOT NULL
scope        TEXT NOT NULL DEFAULT 'slice'   ← V22
task_id      TEXT NOT NULL DEFAULT ''        ← V22 (was broken)
status       TEXT NOT NULL DEFAULT 'pending'
verdict      TEXT NOT NULL DEFAULT ''
rationale    TEXT NOT NULL DEFAULT ''
findings     TEXT NOT NULL DEFAULT ''
evaluated_at TEXT DEFAULT NULL
PRIMARY KEY (milestone_id, slice_id, gate_id, task_id)
FOREIGN KEY (milestone_id, slice_id) → slices
```
- Index: `idx_quality_gates_pending`

---

#### `slice_dependencies` (V14)
```
milestone_id        TEXT NOT NULL
slice_id            TEXT NOT NULL
depends_on_slice_id TEXT NOT NULL
PRIMARY KEY (milestone_id, slice_id, depends_on_slice_id)
FOREIGN KEY (milestone_id, slice_id) → slices
FOREIGN KEY (milestone_id, depends_on_slice_id) → slices
```
- Index: `idx_slice_deps_target`

---

#### `gate_runs` (V15)
```
id            INTEGER PRIMARY KEY AUTOINCREMENT
trace_id      TEXT NOT NULL
turn_id       TEXT NOT NULL
gate_id       TEXT NOT NULL
gate_type     TEXT NOT NULL DEFAULT ''
unit_type     TEXT DEFAULT NULL
unit_id       TEXT DEFAULT NULL
milestone_id  TEXT DEFAULT NULL
slice_id      TEXT DEFAULT NULL
task_id       TEXT DEFAULT NULL
outcome       TEXT NOT NULL DEFAULT 'pass'
failure_class TEXT NOT NULL DEFAULT 'none'
rationale     TEXT NOT NULL DEFAULT ''
findings      TEXT NOT NULL DEFAULT ''
attempt       INTEGER NOT NULL DEFAULT 1
max_attempts  INTEGER NOT NULL DEFAULT 1
retryable     INTEGER NOT NULL DEFAULT 0
evaluated_at  TEXT NOT NULL DEFAULT ''
```
- Indexes: `idx_gate_runs_turn`, `idx_gate_runs_lookup`

---

#### `turn_git_transactions` (V15)
```
trace_id      TEXT NOT NULL
turn_id       TEXT NOT NULL
unit_type     TEXT DEFAULT NULL
unit_id       TEXT DEFAULT NULL
stage         TEXT NOT NULL DEFAULT 'turn-start'
action        TEXT NOT NULL DEFAULT 'status-only'
push          INTEGER NOT NULL DEFAULT 0
status        TEXT NOT NULL DEFAULT 'ok'
error         TEXT DEFAULT NULL
metadata_json TEXT NOT NULL DEFAULT '{}'
updated_at    TEXT NOT NULL DEFAULT ''
PRIMARY KEY (trace_id, turn_id, stage)
```
- Index: `idx_turn_git_tx_turn`

---

#### `audit_events` (V15)
```
event_id     TEXT PRIMARY KEY
trace_id     TEXT NOT NULL
turn_id      TEXT DEFAULT NULL
caused_by    TEXT DEFAULT NULL
category     TEXT NOT NULL
type         TEXT NOT NULL
ts           TEXT NOT NULL
payload_json TEXT NOT NULL DEFAULT '{}'
```
- Indexes: `idx_audit_events_trace`, `idx_audit_events_turn`

---

#### `audit_turn_index` (V15)
```
trace_id    TEXT NOT NULL
turn_id     TEXT NOT NULL
first_ts    TEXT NOT NULL
last_ts     TEXT NOT NULL
event_count INTEGER NOT NULL DEFAULT 0
PRIMARY KEY (trace_id, turn_id)
```

---

#### `milestone_commit_attributions` (V26)
```
commit_sha   TEXT NOT NULL
milestone_id TEXT NOT NULL
slice_id     TEXT DEFAULT NULL
task_id      TEXT DEFAULT NULL
source       TEXT NOT NULL DEFAULT 'recorded'
confidence   REAL NOT NULL DEFAULT 1.0
files_json   TEXT NOT NULL DEFAULT '[]'
created_at   TEXT NOT NULL DEFAULT ''
PRIMARY KEY (commit_sha, milestone_id)
```
- Index: `idx_milestone_commit_attr_milestone`

---

### 3b. Memory & Knowledge Layer (V3, V18–V21)

#### `memories` (V3)
```
seq               INTEGER PRIMARY KEY AUTOINCREMENT
id                TEXT NOT NULL UNIQUE
category          TEXT NOT NULL
content           TEXT NOT NULL
confidence        REAL NOT NULL DEFAULT 0.8
source_unit_type  TEXT
source_unit_id    TEXT
created_at        TEXT NOT NULL
updated_at        TEXT NOT NULL
superseded_by     TEXT DEFAULT NULL
hit_count         INTEGER NOT NULL DEFAULT 0
scope             TEXT NOT NULL DEFAULT 'project'   ← V18
tags              TEXT NOT NULL DEFAULT '[]'         ← V18, JSON
structured_fields TEXT DEFAULT NULL                  ← V21, JSON
last_hit_at       TEXT DEFAULT NULL                  ← V28, set by incrementMemoryHitCount
```
- Index: `idx_memories_active` (superseded_by), `idx_memories_scope` (scope)
- View: `active_memories` WHERE superseded_by IS NULL
- FTS: `memories_fts` virtual table (V19)
- V28: `queryMemoriesRanked` applies `memoryDecayFactor(last_hit_at)` — linear decay from 1.0 (≤0 days) to 0.7 floor (≥90 days)

---

#### `memory_processed_units` (V3)
```
unit_key     TEXT PRIMARY KEY
activity_file TEXT
processed_at TEXT NOT NULL
```

---

#### `memory_sources` (V18)
```
id           TEXT PRIMARY KEY
kind         TEXT NOT NULL
uri          TEXT
title        TEXT
content      TEXT NOT NULL
content_hash TEXT NOT NULL UNIQUE
imported_at  TEXT NOT NULL
scope        TEXT NOT NULL DEFAULT 'project'
tags         TEXT NOT NULL DEFAULT '[]'
```
- Indexes: `idx_memory_sources_kind`, `idx_memory_sources_scope`

---

#### `memory_embeddings` (V19)
```
memory_id  TEXT PRIMARY KEY
model      TEXT NOT NULL
dim        INTEGER NOT NULL
vector     BLOB NOT NULL
updated_at TEXT NOT NULL
```

---

#### `memory_relations` (V20)
```
from_id    TEXT NOT NULL
to_id      TEXT NOT NULL
rel        TEXT NOT NULL
confidence REAL NOT NULL DEFAULT 0.8
created_at TEXT NOT NULL
PRIMARY KEY (from_id, to_id, rel)
```
- Indexes: `idx_memory_relations_from`, `idx_memory_relations_to`

---

#### `memories_fts` (V19, Virtual)
```
FTS5 virtual table
Content: memories.content
Tokenizer: porter unicode61
Triggers: memories_ai, memories_ad, memories_au (keep in sync)
Fallback: LIKE scan if FTS5 unavailable
```

---

### 3c. Auto-Mode Coordination (V24)

#### `workers`
```
worker_id              TEXT PRIMARY KEY
host                   TEXT NOT NULL
pid                    INTEGER NOT NULL
started_at             TEXT NOT NULL
version                TEXT NOT NULL
last_heartbeat_at      TEXT NOT NULL
status                 TEXT NOT NULL
project_root_realpath  TEXT NOT NULL
```

---

#### `milestone_leases`
```
milestone_id   TEXT PRIMARY KEY
worker_id      TEXT NOT NULL
fencing_token  INTEGER NOT NULL
acquired_at    TEXT NOT NULL
expires_at     TEXT NOT NULL
status         TEXT NOT NULL
FOREIGN KEY worker_id → workers(worker_id)
FOREIGN KEY milestone_id → milestones(id)
```

---

#### `unit_dispatches`
```
id                      INTEGER PRIMARY KEY AUTOINCREMENT
trace_id                TEXT NOT NULL
turn_id                 TEXT
worker_id               TEXT NOT NULL
milestone_lease_token   INTEGER NOT NULL
milestone_id            TEXT NOT NULL
slice_id                TEXT
task_id                 TEXT
unit_type               TEXT NOT NULL
unit_id                 TEXT NOT NULL
status                  TEXT NOT NULL
attempt_n               INTEGER NOT NULL DEFAULT 1
started_at              TEXT NOT NULL
ended_at                TEXT
exit_reason             TEXT
error_summary           TEXT
verification_evidence_id INTEGER
next_run_at             TEXT
retry_after_ms          INTEGER
max_attempts            INTEGER NOT NULL DEFAULT 3
last_error_code         TEXT
last_error_at           TEXT
FOREIGN KEY worker_id → workers
FOREIGN KEY verification_evidence_id → verification_evidence(id)
```
- Indexes: `idx_unit_dispatches_active`, `idx_unit_dispatches_trace`
- Unique partial index: `idx_unit_dispatches_active_per_unit` ON unit_id WHERE status IN ('claimed','running') — prevents double-claim

---

#### `cancellation_requests`
```
id              INTEGER PRIMARY KEY AUTOINCREMENT
requested_at    TEXT NOT NULL
requested_by    TEXT NOT NULL
scope           TEXT NOT NULL
scope_id        TEXT NOT NULL
dispatch_id     INTEGER
reason          TEXT NOT NULL
status          TEXT NOT NULL
acked_at        TEXT
acked_worker_id TEXT
FOREIGN KEY dispatch_id → unit_dispatches(id)
FOREIGN KEY acked_worker_id → workers(worker_id)
```

---

#### `command_queue`
```
id           INTEGER PRIMARY KEY AUTOINCREMENT
target_worker TEXT     ← NULL = broadcast to all workers
command      TEXT NOT NULL
args_json    TEXT NOT NULL DEFAULT '{}'
enqueued_at  TEXT NOT NULL
claimed_at   TEXT
claimed_by   TEXT
completed_at TEXT
result_json  TEXT
```
- Index: `idx_command_queue_pending` (target_worker, claimed_at)

---

### 3d. Soft State (V25)

#### `runtime_kv`
```
scope      TEXT NOT NULL    ← 'global' | 'worker' | 'milestone'
scope_id   TEXT NOT NULL DEFAULT ''
key        TEXT NOT NULL
value_json TEXT NOT NULL
updated_at TEXT NOT NULL
PRIMARY KEY (scope, scope_id, key)
```
Non-correctness-critical state: UI cursors, dashboard caches, resume pointers. Safe to lose.

---

## 4. Entity Relationship Diagram

```
milestones ──┐
  │ id        │ (depends_on → milestones.id, via JSON)
  │           │
  ▼           │
slices ───────┘
  │ (milestone_id, id) PRIMARY KEY
  │
  ├──► slice_dependencies (milestone_id, slice_id, depends_on_slice_id)
  │
  ▼
tasks
  │ (milestone_id, slice_id, id) PRIMARY KEY
  │
  ├──► verification_evidence (milestone_id, slice_id, task_id)
  ├──► quality_gates (milestone_id, slice_id, gate_id, task_id)
  └──► unit_dispatches.task_id (via coordination layer)

milestones ──► replan_history (milestone_id)
milestones ──► assessments (milestone_id)
milestones ──► milestone_leases (milestone_id) ◄── workers
milestones ──► unit_dispatches (milestone_id) ◄── workers
milestones ──► milestone_commit_attributions (milestone_id)

memories ──► memories_fts (FTS5 virtual, via triggers)
memories ──► memory_embeddings (memory_id)
memories ──► memory_relations (from_id, to_id)
memory_sources ──► (imported content, feeds memories)

unit_dispatches ──► cancellation_requests (dispatch_id)
unit_dispatches ──► verification_evidence (verification_evidence_id)

decisions  (independent, supersedable)
requirements  (independent, supersedable)
artifacts  (independent, keyed by path)
gate_runs  (audit, keyed by trace_id + turn_id + gate_id)
turn_git_transactions  (audit, keyed by trace_id + turn_id + stage)
audit_events  (append-only audit log)
audit_turn_index  (turn-level index into audit_events)
runtime_kv  (soft state KV)
```

---

## 5. Complete gsd_* Tool → Table Map

| Tool | Tables READ | Tables WRITTEN | Disk Artifacts |
|------|------------|----------------|----------------|
| `gsd_decision_save` | decisions | decisions | DECISIONS.md (regenerated) |
| `gsd_requirement_save` | requirements | requirements | REQUIREMENTS.md |
| `gsd_requirement_update` | requirements | requirements | REQUIREMENTS.md |
| `gsd_summary_save` | milestones, slices, tasks | artifacts | M##/S##/T## artifact files |
| `gsd_milestone_generate_id` | milestones | milestones (INSERT OR IGNORE, queued) | — |
| `gsd_plan_milestone` | milestones, slices | milestones, slices, tasks, replan_history | ROADMAP.md |
| `gsd_plan_slice` | slices, tasks | slices, tasks | S##-PLAN.md |
| `gsd_plan_task` | slices, tasks | tasks | T##-PLAN.md |
| `gsd_task_complete` | tasks, slices | tasks, verification_evidence | T##-SUMMARY.md; toggles checkbox in S##-PLAN.md |
| `gsd_slice_complete` | tasks, slices | slices, tasks (cascade skipped) | S##-SUMMARY.md, S##-UAT.md; toggles checkpoint in ROADMAP.md |
| `gsd_complete_milestone` | milestones, slices, tasks | milestones | M##-SUMMARY.md |
| `gsd_validate_milestone` | milestones, slices, tasks | assessments | VALIDATION.md |
| `gsd_reassess_roadmap` | milestones, slices | milestones, slices, assessments | ROADMAP.md, ASSESSMENT.md |
| `gsd_replan_slice` | slices, tasks | slices, tasks, replan_history, quality_gates | S##-PLAN.md, S##-REPLAN.md |
| `gsd_skip_slice` | slices, tasks | slices, tasks | STATE.md (via rebuildState) |
| `gsd_task_reopen` | tasks, slices, milestones | tasks | deletes T##-SUMMARY.md |
| `gsd_slice_reopen` | slices, tasks, milestones | slices, tasks | deletes S##-SUMMARY.md, UAT, all T##-SUMMARY.md |
| `gsd_milestone_reopen` | milestones, slices, tasks | milestones, slices, tasks | deletes all summaries |
| `gsd_save_gate_result` | quality_gates | quality_gates, gate_runs | — |
| `capture_thought` | memories | memories | KNOWLEDGE.md |
| `memory_query` | memories, memories_fts, memory_embeddings | memories (hit_count++) | — |

---

## 6. DB State → Dispatch Rule Mapping

`auto-dispatch.ts` reads DB state to decide which prompt to run. Here's exactly which tables each dispatch rule queries:

| Dispatch Rule | Tables Queried | Condition |
|--------------|----------------|-----------|
| `workflow-preferences` | — | PREFERENCES.md file missing |
| `discuss-project` | artifacts | PROJECT artifact absent |
| `discuss-requirements` | artifacts | REQUIREMENTS artifact absent |
| `research-decision` | runtime_kv | research-decision key absent/unresolved |
| `research-project` | artifacts, milestones | deep mode ON + RESEARCH absent |
| `discuss-milestone` | milestones, artifacts | active milestone + CONTEXT absent |
| `research-milestone` | milestones, artifacts | CONTEXT present + RESEARCH absent (if needed) |
| `plan-milestone` | milestones, slices | CONTEXT present + no slices exist |
| `parallel-research-slices` | slices, artifacts | slices exist + RESEARCH artifacts missing |
| `guided-discuss-slice` | slices, artifacts | slice CONTEXT absent |
| `plan-slice` | slices, tasks | CONTEXT present + no tasks |
| `refine-slice` | slices | `is_sketch = 1` |
| `reactive-execute` | tasks | ≥ 3 tasks WHERE status = 'pending' |
| `execute-task` | tasks | 1–2 tasks WHERE status = 'pending' |
| `gate-evaluate` | quality_gates | status = 'pending' |
| `run-uat` | slices, assessments | tasks all done + UAT absent |
| `complete-slice` | tasks, slices | all tasks complete + slice status ≠ 'complete' |
| `reassess-roadmap` | slices, milestones | slice just completed + roadmap needs update |
| `validate-milestone` | slices, milestones, assessments | all slices complete + VALIDATION absent |
| `complete-milestone` | milestones, assessments | VALIDATION present + milestone status ≠ 'closed' |

---

## 7. Write Path Invariants

1. **Single-writer rule**: all writes go through typed wrappers in `gsd-db.ts`. No raw SQL escapes to the adapter from outside this file. Enforced by structural test.

2. **Transaction wrapping**: every multi-table write uses `transaction()`. Rollback on any error. Re-entrant: nested calls increment depth counter; no nested BEGIN.

3. **Cascade semantics**:
   - `gsd_slice_complete` cascades `pending` tasks → `skipped`
   - `gsd_skip_slice` cascades `pending`/`active` tasks → `skipped`, preserves `complete`
   - `gsd_milestone_reopen` cascades all slices → `in_progress`, all tasks → `pending`

4. **Conflict guards**: `insertSlice`, `insertTask` use `ON CONFLICT` to preserve existing completed status and non-empty fields. Fresh INSERT of an already-complete row is a no-op.

5. **FTS fallback**: if FTS5 unavailable, `memory_query` falls back to LIKE scan on `memories.content`.

6. **Workspace isolation**: same `.gsd/gsd.db` for all worktrees of one project; separate `.gsd/gsd.db` per project root. Coordination tables assume single-host shared WAL. Multi-host needs external coordinator.
