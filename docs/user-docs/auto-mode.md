# Auto Mode

Auto mode is GSD's autonomous execution engine. Run `/gsd auto`, walk away, come back to built software with clean git history.

## How It Works

Auto mode is a **state machine driven by the GSD database at the project root**. It derives the next unit of work from the authoritative SQLite state, creates a fresh agent session, injects a focused prompt with all relevant context pre-inlined, and lets the LLM execute. When the LLM finishes, auto mode persists the result to the database, refreshes markdown projections such as `STATE.md`, and dispatches the next unit.

### The Loop

Each slice flows through phases automatically:

```
Plan (with integrated research) → Execute (per task) → Complete → Reassess Roadmap → Next Slice
                                                                                      ↓ (all slices done)
                                                                              Validate Milestone → Complete Milestone
```

- **Plan** — scouts the codebase, researches relevant docs, and decomposes the slice into tasks with must-haves
- **Execute** — runs each task in a fresh context window
- **Complete** — writes summary, UAT script, marks roadmap, commits
- **Reassess** — checks if the roadmap still makes sense
- **Validate Milestone** — reconciliation gate after all slices complete; compares roadmap success criteria against actual results, catches gaps before sealing the milestone

When progressive planning is enabled, GSD fully plans the first slice and may leave later slices as sketches. Those slices render in `M###-ROADMAP.md` with a `` `[sketch]` `` badge, meaning the slice has an approved scope boundary but has not yet been expanded into task plans. Auto mode runs `refine-slice` just before execution to convert the sketch into a full slice plan using the current codebase and prior slice summaries.

### Idempotent Milestone Completion

Milestone completion is safe to retry. If a `complete-milestone` unit is redispatched after the database already marks the milestone as closed, GSD treats the call as successful instead of returning an error. The existing summary projection is left intact, no duplicate completion event is appended, and the tool response includes `alreadyComplete: true` in its details so operators and integrations can distinguish a retry from the first completion.

`complete-milestone` now also enforces a hard validation prerequisite: the latest `milestone-validation` assessment for that milestone must exist and have verdict `pass`. If the verdict is `fail`, `partial`, or absent, closeout is blocked until `validate-milestone` records a fresh passing verdict.

### Planning-Only Milestone Closeout

When milestone history contains only `.gsd/` artifact changes (for example planning-only or documentation-only closeout), auto mode now continues `complete-milestone` dispatch instead of blocking completion for missing implementation files outside `.gsd/`. GSD emits a warning so operators can distinguish this path from implementation-bearing milestones.

### State Authority

The SQLite database is the runtime source of truth for milestones, slices, tasks, requirements, summaries, and completion status. Durable decisions and project knowledge use the same database through the `memories` table: decisions are stored as `architecture` memories, and KNOWLEDGE patterns/lessons are stored as `pattern`/`gotcha` memories.

Markdown files in `.gsd/` are rendered projections for review, prompts, and git-friendly history. `.gsd/DECISIONS.md` is projected from architecture memories, and the Patterns/Lessons sections of `.gsd/KNOWLEDGE.md` are projected from memory rows; editing those projections does not override the database unless a command imports or saves the change through GSD. The Rules section of `KNOWLEDGE.md` remains manually authored and is preserved separately.

In worktree mode, the project-root database remains authoritative runtime state, while artifact/projection writes render under the active worktree-local `.gsd/`. Those worktree markdown projections are not treated as runtime state fallbacks. If the database is unavailable, runtime state derivation refuses to silently rebuild from markdown. The legacy markdown derivation path is only enabled when `GSD_ALLOW_MARKDOWN_DERIVE_FALLBACK=1`, which exists for tests and explicit recovery scenarios.

### Single-Host Runtime Constraint

Phase C coordination is single-host only. Auto mode and parallel coordination rely on the project-root SQLite database running in WAL mode on local disk for worker heartbeats, milestone leases, dispatch claims, cancellation requests, and command handoff.

That means multiple terminals or worker processes can safely coordinate against the same project on one machine, but sharing `.gsd/gsd.db*` across machines or over network filesystems is unsupported. If you need cross-host orchestration, use an external coordinator instead of trying to stretch the local SQLite/WAL runtime.

### Deep Planning Mode

For projects that need more up-front discovery, enable deep planning mode in project preferences:

```yaml
planning_depth: deep
```

You can also opt in when starting project setup with `/gsd new-project --deep` or `/gsd new-milestone --deep`; GSD writes the project `.gsd/PREFERENCES.md` setting for you.

Deep mode keeps the normal slice execution loop, but first runs a one-time staged discovery flow before milestone-level planning:

```text
Workflow Preferences -> Project Context -> Requirements -> Research Decision -> Optional Project Research -> Milestone Context/Roadmap
```

| Artifact | When it appears | Purpose |
|----------|-----------------|---------|
| `.gsd/PREFERENCES.md` | `--deep` / `workflow-preferences` | Holds `planning_depth: deep` and captured workflow settings |
| `.gsd/PROJECT.md` | `discuss-project` | Project vision, users, anti-goals, constraints, and rough milestone sequence |
| `.gsd/REQUIREMENTS.md` | `discuss-requirements` | Capability contract using `R###` requirements grouped by Active, Validated, Deferred, and Out of Scope |
| `.gsd/runtime/research-decision.json` | `research-decision` | Records `research` or `skip`; this unit only asks the question and writes the marker |
| `.gsd/research/STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` | `research-project`, only when the decision is `research` | Four parallel project-level research outputs for stack, feature norms, architecture, and pitfalls |
| `.gsd/milestones/<MID>/M###-CONTEXT.md` and `M###-ROADMAP.md` | Normal milestone discussion/planning | Milestone-specific context and executable roadmap; `` `[sketch]` `` marks slices awaiting `refine-slice` |

`REQUIREMENTS.md` is rendered from the requirements stored in the GSD database. Agents should save individual requirements with `gsd_requirement_save`; a final `gsd_summary_save` for `REQUIREMENTS` will fail if no active requirement rows exist instead of treating caller-supplied markdown as canonical.

Project research is informational, not binding. It cross-checks the requirements and surfaces table stakes, risks, and omissions; any new commitment should be added to `.gsd/REQUIREMENTS.md` before planning depends on it.

## Key Properties

### Fresh Session Per Unit

Every task, research phase, and planning step gets a clean context window. No accumulated garbage. No degraded quality from context bloat. The dispatch prompt includes everything needed — task plans, prior summaries, dependency context, decisions register — so the LLM starts oriented instead of spending tool calls reading files.

### Runtime Tool Policy

Each auto-mode unit has a `UnitContextManifest` with a `ToolsPolicy`, and GSD enforces that policy before tool calls execute. Execution units use `all` mode and may edit project files, run shell commands, and dispatch subagents. Most planning and discussion units use `planning` mode: they can read broadly, write planning artifacts under `.gsd/`, run only read-only shell commands, and cannot dispatch subagents. Selected planning and closeout units use `planning-dispatch` mode, which keeps the same source-write and bash restrictions but allows `subagent` dispatch for isolated recon, planning, or review work. Documentation units use `docs` mode, which keeps the same restrictions but also allows writes to the manifest's explicit documentation globs such as `docs/**`, top-level `README*.md`, `CHANGELOG.md`, and top-level `*.md`.

The sidecar unit types now have distinct manifest behavior: `triage-captures` runs in `contextMode: triage` with `planning`-mode tools (read-heavy, `.gsd/`-scoped writes, no subagent dispatch), while `quick-task` runs in `contextMode: execution` with `all`-mode tools so it can apply and verify small inline fixes.

Writes outside those allowed paths, unsafe bash commands, and subagent dispatch from non-dispatch planning units are blocked with a hard policy error instead of relying on prompt compliance. In `planning-dispatch` units, prompts steer the parent agent toward read-only specialists such as `scout`, `planner`, `researcher`, `reviewer`, `security`, or `tester`; implementation-tier agents still belong in `execute-task`.

### Pre-Dispatch Runtime Blocks

Before auto mode launches a unit, the orchestration pipeline now enforces runtime invariants in this order: reconcile state, choose the next unit, compile the unit tool contract, validate the worktree or unit root, then persist the runtime transition. A failure in any pre-dispatch step returns a `blocked` result and records the block before a worker session starts.

Common block reasons and operator actions:

| Block reason | What it means | Remediation |
|--------------|---------------|-------------|
| State reconciliation blocker | The authoritative database snapshot is already blocked, or state derivation found existing blockers. | Inspect `/gsd status`, `STATE.md`, and the database-backed blocker message; resolve the blocker or run the appropriate GSD recovery command before retrying `/gsd auto`. |
| `unknown-unit-type` | The dispatch decision selected a unit with no registered `UnitContextManifest`. | Fix the unit registration or manifest mapping. Retrying without a code/config fix will select the same invalid unit. |
| `missing-closeout-tool` | A closeout unit such as task, slice, milestone, UAT, or gate completion has no required workflow tool available. | Restore the missing `gsd_*` workflow tool registration or update the unit manifest/tool contract so the unit can durably save its result. |
| `root-missing` / `root-not-directory` | A source-writing unit would run from a missing or invalid unit root. | Recreate or repair the milestone worktree/root, or clear an incorrect `GSD_UNIT_ROOT`, before launching another source-writing unit. |
| `git-metadata-missing` | A source-writing unit root exists but is not a git worktree or repository root. | Run the unit from the project root or milestone worktree with valid `.git` metadata; recreate the worktree if it was deleted or partially copied. |

Recovery classification now treats deterministic policy, tool-schema, stale-worker, and invalid-worktree failures as non-transient stops. Provider failures still use provider-specific transient classification and may retry automatically, while verification drift and unknown runtime failures escalate for inspection because repeating the same dispatch can preserve the drift.

### Context Pre-Loading

The dispatch prompt is carefully constructed with:

| Inlined Artifact | Purpose |
|------------------|---------|
| Task plan | What to build |
| Slice plan | Where this task fits |
| Prior task summaries | What's already done |
| Dependency summaries | Cross-slice context |
| Roadmap excerpt | Overall direction |
| Decisions register | Architectural context |

The amount of context inlined is controlled by your [token profile](./token-optimization.md). Budget mode inlines minimal context; quality mode inlines everything.

### Context Mode

Context Mode is enabled by default for auto-mode runs. Eligible auto-mode units receive manifest-driven guidance to preserve the conversation window: use `gsd_exec` for noisy codebase scans, builds, tests, and diagnostics; use `gsd_exec_search` before repeating a prior sandboxed run; and use `gsd_resume` after compaction or session resume to read a prior compaction snapshot from `.gsd/last-snapshot.md` when one exists.

`contextMode: triage` is used specifically for capture triage turns so they stay focused on classification and routing decisions instead of implementation work.

`gsd_exec` writes capped stdout/stderr and metadata under `.gsd/exec/`; output may be truncated. It then returns only a short digest to the agent. This keeps large command output out of the LLM context while preserving exact evidence on disk. In milestone worktree mode, `gsd_exec` also rejects scripts that target the original project root (including traversal patterns such as `cd ../../..`) so execution stays inside the active worktree boundary. To opt out of Context Mode guidance, snapshot injection, `gsd_exec`, `gsd_exec_search`, and `gsd_resume`, set:

```yaml
context_mode:
  enabled: false
```

You can also tune sandbox behavior with `context_mode.exec_timeout_ms`, `context_mode.exec_stdout_cap_bytes`, `context_mode.exec_digest_chars`, and `context_mode.exec_env_allowlist`.

### Git Isolation

GSD isolates milestone work using one of three modes (configured via `git.isolation` in preferences):

- **`none`** (default): Work happens directly on your current branch. No worktree, no milestone branch. Ideal for hot-reload workflows where file isolation breaks dev tooling.
- **`worktree`**: Each milestone runs in its own git worktree at `.gsd/worktrees/<MID>/` on a `milestone/<MID>` branch. Worktree mode requires at least one commit; in a zero-commit repo with no committed `HEAD`, GSD temporarily runs as `none` until the first commit exists. All slice work commits sequentially, and the milestone is squash-merged to main as one clean commit.
- **`branch`**: Work happens in the project root on a `milestone/<MID>` branch. Useful for submodule-heavy repos where worktrees don't work well.

See [Git Strategy](./git-strategy.md) for details.

### Parallel Execution

When your project has independent milestones, you can run them simultaneously. Each milestone gets its own worker process and worktree, and the shared project-root SQLite/WAL runtime coordinates worker heartbeats, milestone leases, dispatch ownership, retry windows, and control commands on the same machine. See [Parallel Orchestration](./parallel-orchestration.md) for setup and usage.

### Crash Recovery

Auto mode persists worker state, unit-dispatch state, and paused-session metadata in the project-root SQLite database. If the session dies, the next `/gsd auto` reconstructs the interrupted unit from DB-backed runtime state, reads the surviving session file, synthesizes a recovery briefing from every tool call that made it to disk, and resumes with full context.

**Headless auto-restart (v2.26):** When running `gsd headless auto`, crashes trigger automatic restart with exponential backoff (5s → 10s → 30s cap, default 3 attempts). Configure with `--max-restarts N`. SIGINT/SIGTERM bypasses restart. Combined with crash recovery, this enables true overnight "run until done" execution.

### Provider Error Recovery

GSD classifies provider errors and auto-resumes when safe:

| Error type | Examples | Action |
|-----------|----------|--------|
| **Rate limit** | 429, "too many requests" | Auto-resume after retry-after header or 60s |
| **Server error** | 500, 502, 503, "overloaded", "api_error" | Auto-resume after 30s |
| **Permanent** | "unauthorized", "invalid key", "billing" | Pause indefinitely (requires manual resume) |

No manual intervention needed for transient errors — the session pauses briefly and continues automatically.

### Incremental Memory (v2.26)

GSD maintains durable project memory in the `memories` table and projects selected knowledge back into `.gsd/KNOWLEDGE.md` for review. `KNOWLEDGE.md` keeps manual Rules as file-canonical entries, while Patterns and Lessons are captured as memories, backfilled from existing rows, and rendered into the file on session start.

At the start of each unit, GSD injects the manual Rules from project `KNOWLEDGE.md`; Patterns and Lessons reach the agent through the memory block. Global `~/.gsd/agent/KNOWLEDGE.md` remains user-maintained and is injected unchanged.

### Context Pressure Monitor (v2.26)

When context usage reaches 70%, GSD sends a wrap-up signal to the agent, nudging it to finish durable output (commit, write summaries) before the context window fills. This prevents sessions from hitting the hard context limit mid-task with no artifacts written.

### Meaningful Commit Messages (v2.26)

Commits are generated from task summaries — not generic "complete task" messages. Each commit message reflects what was actually built, giving clean `git log` output that reads like a changelog.

### Stuck Detection (v2.39)

GSD uses a sliding-window analysis to detect stuck loops. Instead of a simple "same unit dispatched twice" counter, the detector examines recent dispatch history for repeated patterns — catching cycles like A→B→A→B as well as single-unit repeats. On detection, GSD retries once with a deep diagnostic prompt. If it fails again, auto mode stops so you can intervene.

The sliding-window approach reduces false positives on legitimate retries (e.g., verification failures that self-correct) while catching genuine stuck loops faster.

### Consecutive Dispatch Blocker

Auto mode also enforces a same-unit consecutive dispatch cap for `complete-milestone`, `validate-milestone`, and `research-slice`. The loop allows two consecutive dispatches of the same unit in the same phase and stops before a third attempt with a repeat-cap warning that instructs you to run `/gsd resume` after intervention.

### Artifact Verification Retries

After each unit, GSD verifies that the expected artifact exists on disk. If the artifact is missing, auto mode re-dispatches the unit with explicit failure context and records an `artifact-verification-retry` journal event.

For `run-uat`, existence alone is not sufficient: a pre-existing `S##-ASSESSMENT.md` only counts as completed when it contains a canonical verdict field (for example frontmatter `verdict: PASS | FAIL | PARTIAL`). If the file exists but has no verdict, artifact verification fails and `run-uat` is redispatched.

Artifact verification retries are capped at 3 attempts. If the expected artifact is still missing after those retries, GSD pauses auto mode with an "Artifact still missing..." error instead of relying on loop detection or an unbounded dispatch counter.

### Post-Mortem Investigation (v2.40)

`/gsd forensics` is a full-access GSD debugger for post-mortem analysis of auto-mode failures. It provides:

- **Anomaly detection** — structured identification of stuck loops, cost spikes, timeouts, missing artifacts, and crashes with severity levels
- **Unit traces** — last 10 unit executions with error details and execution times
- **Metrics analysis** — cost, token counts, and execution time breakdowns
- **Doctor integration** — includes structural health issues from `/gsd doctor`
- **Journal correlation** — uses `.gsd/journal/` events such as `unit-start`, `unit-end`, `post-unit-finalize-start`, `post-unit-finalize-end`, and `iteration-end` to show where the loop stopped
- **Worktree exit telemetry contract** — `auto-exit` journal events now include a normalized `reason` bucket plus `rawReason` (original free-form text) for operator debugging and analytics stability
- **LLM-guided investigation** — an agent session with full tool access to investigate root causes

Normalized `auto-exit` reason buckets are:
`pause`, `stop`, `blocked`, `merge-conflict`, `merge-failed`, `slice-merge-conflict`, `provider-error`, `session-failed`, `stream-aborted`, `unit-aborted`, `verification-exhausted`, `all-complete`, `no-active-milestone`, `other`.

```
/gsd forensics [optional problem description]
```

See [Troubleshooting](./troubleshooting.md) for more on diagnosing issues.

### Timeout Supervision

Three timeout tiers prevent runaway sessions:

| Timeout | Default | Behavior |
|---------|---------|----------|
| Soft | 20 min | Warns the LLM to wrap up |
| Idle | 10 min | Detects stalls, intervenes |
| Hard | 30 min | Starts timeout recovery; pauses auto mode only if recovery cannot make durable progress |

Recovery steering nudges the LLM to finish durable output before timing out. When idle or hard timeout recovery is actively writing durable progress, the unit failsafe records fresh runtime progress in `.gsd/runtime/` and defers its final cancellation check for another short recheck window. This prevents auto mode from pausing while a recovered unit is finalizing, but future-dated or stale runtime timestamps are ignored so clock skew cannot keep the unit alive forever.

For operator forensics, timeout recovery updates the unit runtime record with fields such as `phase`, `timeoutAt`, `lastProgressAt`, `lastProgressKind`, `recoveryAttempts`, and `lastRecoveryReason`. Finalize timeouts are recorded with `lastProgressKind` values like `finalize-pre-timeout` or `finalize-post-timeout`; successful finalization records `finalize-success`.

The journal also closes every iteration explicitly. After a unit ends, auto mode emits `post-unit-finalize-start` before closeout and `post-unit-finalize-end` with a `status`, `action`, and optional `reason`. Every loop iteration then emits `iteration-end` with the final status and, when available, the failure class, unit type, unit id, and reason. Use these events to distinguish "agent never returned" from "agent returned but finalize/closeout stopped the loop."

Configure in preferences:

```yaml
auto_supervisor:
  soft_timeout_minutes: 20
  idle_timeout_minutes: 10
  hard_timeout_minutes: 30
```

### Cost Tracking

Every unit's token usage and cost is captured, broken down by phase, slice, and model. The dashboard shows running totals and projections. Budget ceilings can pause auto mode before overspending.

See [Cost Management](./cost-management.md).

### Adaptive Replanning

After each slice completes, the roadmap is reassessed. If the work revealed new information that changes the plan, slices are reordered, added, or removed before continuing. This can be skipped with the `balanced` or `budget` token profiles.

### Verification Enforcement (v2.26)

Configure shell commands that run automatically after every task execution:

```yaml
verification_commands:
  - npm run lint
  - npm run test
verification_auto_fix: true    # auto-retry on failure (default)
verification_max_retries: 2    # max retry attempts (default: 2)
```

Failures trigger auto-fix retries — the agent sees the verification output and attempts to fix the issues before advancing. This ensures code quality gates are enforced mechanically, not by LLM compliance.

Commands must be directly runnable checks such as `npm run lint`, `npm run test`, or `python3 -m pytest`. GSD rejects shell composition and control syntax in verification commands, including pipes, redirects, semicolons, backticks, and command substitution, so a piped command like `python3 -m pytest 2>&1 | tail -5` must be replaced with the underlying test command.

If you do not configure commands and the task plan does not provide a `verify` command, GSD attempts project discovery. It checks `package.json` scripts first, then Python pytest markers through the `python-project` discovery source: test files under `tests/`, `pytest.ini`, or pytest configuration in `pyproject.toml`.

### Slice Discussion Gate (v2.26)

For projects where you want human review before each slice begins:

```yaml
require_slice_discussion: true
```

Auto-mode pauses before each slice, presenting the slice context for discussion. After you confirm, execution continues. Useful for high-stakes projects where you want to review the plan before the agent builds.

### HTML Reports (v2.26)

After a milestone completes, GSD auto-generates a self-contained HTML report in `.gsd/reports/`. Reports include project summary, progress tree, slice dependency graph (SVG DAG), cost/token metrics with bar charts, execution timeline, changelog, and knowledge base. No external dependencies — all CSS and JS are inlined.

```yaml
auto_report: true    # enabled by default
```

Generate manually anytime with `/gsd export --html`, or generate reports for all milestones at once with `/gsd export --html --all` (v2.28).

### Failure Recovery (v2.28)

v2.28 hardens auto-mode reliability with multiple safeguards: atomic file writes prevent corruption on crash, OAuth fetch timeouts (30s) prevent indefinite hangs, RPC subprocess exit is detected and reported, and blob garbage collection prevents unbounded disk growth. Combined with the existing crash recovery and headless auto-restart, auto-mode is designed for true "fire and forget" overnight execution.

### Pipeline Architecture (v2.40)

The auto-loop is structured as a linear phase pipeline rather than recursive dispatch. Each iteration flows through explicit stages:

1. **Pre-Dispatch** — validate state, check guards, resolve model preferences
2. **Dispatch** — execute the unit with a focused prompt
3. **Post-Unit** — close out the unit, update caches, run cleanup
4. **Verification** — optional validation gate (lint, test, etc.)
5. **Stuck Detection** — sliding-window pattern analysis

This linear flow is easier to debug, uses less memory (no recursive call stack), and provides cleaner error recovery since each phase has well-defined entry and exit conditions.

### Real-Time Health Visibility (v2.40)

Doctor issues (from `/gsd doctor`) now surface in real time across three places:

- **Dashboard widget** — health indicator with issue count and severity
- **Workflow visualizer** — issues shown in the status panel
- **HTML reports** — health section with all issues at report generation time

Issues are classified by severity: `error` (blocks auto-mode), `warning` (non-blocking), and `info` (advisory). Auto-mode checks health at dispatch time and can pause on critical issues.

### Skill Activation in Prompts (v2.39)

Configured skills are automatically resolved and injected into dispatch prompts. The agent receives an "Available Skills" block listing skills that match the current context, based on:

- `always_use_skills` — always included
- `prefer_skills` — included with preference indicator
- `skill_rules` — conditional activation based on `when` clauses

See [Configuration](./configuration.md) for skill routing preferences.

## Controlling Auto Mode

### Start

```
/gsd auto
```

### Pause

Press **Escape**. The conversation is preserved. You can interact with the agent, inspect state, or resume.

### Resume

```
/gsd auto
```

Auto mode derives the latest database state and picks up where it left off.

### Stop

```
/gsd stop
```

Stops auto mode gracefully. Can be run from a different terminal.

### Steer

```
/gsd steer
```

Hard-steer plan documents during execution without stopping the pipeline. Changes are picked up at the next phase boundary.

### Capture

```
/gsd capture "add rate limiting to API endpoints"
```

Fire-and-forget thought capture. Captures are triaged automatically between tasks. See [Captures & Triage](./captures-triage.md).

### Visualize

```
/gsd visualize
```

Open the workflow visualizer — interactive tabs for progress, dependencies, metrics, and timeline. See [Workflow Visualizer](./visualizer.md).

### Remote Control via Telegram

When Telegram is configured as your remote channel, you can control auto-mode and query project status directly from the Telegram chat — without touching the terminal.

| Command | What it does |
|---------|-------------|
| `/pause` | Pause auto-mode after the current unit finishes |
| `/resume` | Clear a pause directive and continue auto-mode |
| `/status` | Show current milestone, active unit, and session cost |
| `/progress` | Roadmap overview (done / open milestones) |
| `/budget` | Token usage and cost for the current session |
| `/log [n]` | Last `n` activity log entries (default: 5) |

GSD polls for incoming Telegram commands every ~5 seconds while auto-mode is active. Commands are only available during active auto-mode sessions.

See [Remote Questions — Telegram Commands](./remote-questions.md#telegram-commands) for the full command reference and setup instructions.

## Dashboard

`Ctrl+Alt+G` or `/gsd status` shows real-time progress:

- Current milestone, slice, and task
- Auto mode elapsed time and phase
- Per-unit cost and token breakdown
- Cost projections
- Completed and in-progress units
- Pending capture count (when captures are awaiting triage)
- Parallel worker status (when running parallel milestones — includes 80% budget alert)

## Phase Skipping

Token profiles can skip certain phases to reduce cost:

| Phase | `budget` | `balanced` | `quality` |
|-------|----------|------------|-----------|
| Milestone Research | Skipped | Runs | Runs |
| Slice Research | Skipped | Skipped | Runs |
| Reassess Roadmap | Skipped | Runs | Runs |

See [Token Optimization](./token-optimization.md) for details.

## Dynamic Model Routing

When enabled, auto-mode automatically selects cheaper models for simple units (slice completion, UAT) and reserves expensive models for complex work (replanning, architectural tasks). See [Dynamic Model Routing](./dynamic-model-routing.md).

## Reactive Task Execution

Reactive task execution is enabled by default. During task execution, GSD derives a dependency graph from the IO annotations in task plans. When at least three ready tasks can be considered safely, tasks that do not conflict (no shared file reads/writes) are dispatched in parallel via subagents, while dependent tasks wait for their predecessors to complete.

```yaml
reactive_execution:
  enabled: false    # opt out; omit this block to keep the default-on behavior
```

The graph derivation is pure and deterministic: it resolves a ready-set of tasks, detects conflicts, and guards against deadlocks. If the graph is ambiguous or fewer than the threshold number of ready tasks are available, auto-mode falls back to the normal sequential executor. Setting `reactive_execution.enabled: true` explicitly keeps the earlier opt-in threshold of two ready tasks; omitting the setting uses the safer default-on threshold of three. Verification results carry forward across parallel batches, so tasks that pass verification don't need to be re-verified when subsequent tasks in the same slice complete.

Optional tuning:

```yaml
reactive_execution:
  enabled: true              # explicit opt-in threshold: 2 ready tasks
  max_parallel: 4            # default: 2, allowed range: 1-8
  isolation_mode: same-tree  # currently the only supported isolation mode
  subagent_model: claude-sonnet-4-6
```

The implementation lives in `reactive-graph.ts` (graph derivation, ready-set resolution, conflict/deadlock detection) with integration into `auto-dispatch.ts` and `auto-prompts.ts`.
