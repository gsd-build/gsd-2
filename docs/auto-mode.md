# Auto Mode

Auto mode is GSD's autonomous execution engine. Run `/gsd auto`, walk away, come back to built software with clean git history.

## How It Works

Auto mode is a **state machine driven by files on disk**. It reads `.gsd/STATE.md`, determines the next unit of work, creates a fresh agent session, injects a focused prompt with all relevant context pre-inlined, and lets the LLM execute. When the LLM finishes, auto mode reads disk state again and dispatches the next unit.

### The Loop

Each slice flows through phases automatically:

```
Research → Plan → Execute (per task) → Complete → Reassess Roadmap → Next Slice
                                                                      ↓ (all slices done)
                                                              Validate Milestone → Complete Milestone
```

- **Research** — scouts the codebase and relevant docs
- **Plan** — decomposes the slice into tasks with must-haves
- **Execute** — runs each task in a fresh context window
- **Complete** — writes summary, UAT script, marks roadmap, commits
- **Reassess** — checks if the roadmap still makes sense
- **Validate Milestone** — reconciliation gate after all slices complete; compares roadmap success criteria against actual results, catches gaps before sealing the milestone

## Key Properties

### Fresh Session Per Unit

Every task, research phase, and planning step gets a clean context window. No accumulated garbage. No degraded quality from context bloat. The dispatch prompt includes everything needed — task plans, prior summaries, dependency context, decisions register — so the LLM starts oriented instead of spending tool calls reading files.

### Incremental Memory

While each unit gets a fresh context window, GSD maintains an **incremental memory system** that persists knowledge across sessions. After each unit completes, a background LLM call extracts durable project knowledge — architecture patterns, gotchas, conventions, environment details — and stores it in the project database.

Active memories are injected into future dispatch prompts, giving the LLM access to lessons learned without polluting the context window with full session history. Memory entries have confidence scores that increase with reinforcement and decay over time if unused.

Memory categories:
- **gotcha** — surprising behaviors, non-obvious failure modes
- **convention** — project coding standards, naming patterns
- **architecture** — structural decisions, module boundaries
- **pattern** — recurring implementation approaches
- **environment** — toolchain, runtime, deployment details
- **preference** — user preferences discovered during execution

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

### Git Isolation

GSD isolates milestone work using one of three modes (configured via `git.isolation` in preferences):

- **`worktree`** (default): Each milestone runs in its own git worktree at `.gsd/worktrees/<MID>/` on a `milestone/<MID>` branch. All slice work commits sequentially — no branch switching, no merge conflicts mid-milestone. When the milestone completes, it's squash-merged to main as one clean commit.
- **`branch`**: Work happens in the project root on a `milestone/<MID>` branch. Useful for submodule-heavy repos where worktrees don't work well.
- **`none`**: Work happens directly on your current branch. No worktree, no milestone branch. Ideal for hot-reload workflows where file isolation breaks dev tooling.

See [Git Strategy](./git-strategy.md) for details.

### Meaningful Commit Messages

When a task completes, GSD generates a conventional commit message from the task summary rather than using a generic `chore()` message. The commit type is inferred from the task content (`feat`, `fix`, `refactor`, `docs`, `test`, `perf`, `chore`), and the description comes from the task summary's one-liner — what was actually built, not just what was planned. Key files are listed in the commit body.

```
feat(S01/T02): Add retry-aware worker status logging

- src/worker/status.ts
- src/worker/retry.ts
- src/tests/worker-status.test.ts
```

Non-task commits (state rebuilds, pre-switch commits) still use generic messages.

### Parallel Execution

When your project has independent milestones, you can run them simultaneously. Each milestone gets its own worker process and worktree. See [Parallel Orchestration](./parallel-orchestration.md) for setup and usage.

### Crash Recovery

A lock file tracks the current unit. If the session dies, the next `/gsd auto` reads the surviving session file, synthesizes a recovery briefing from every tool call that made it to disk, and resumes with full context.

Recovery is milestone-aware: if the crashed unit's milestone is already complete (summary exists), stale recovery context is discarded to prevent phantom skip loops.

### Stuck Detection

If the same unit dispatches twice (the LLM didn't produce the expected artifact), GSD retries once with a deep diagnostic prompt. If it fails again, auto mode stops with the exact file it expected, so you can intervene.

Skip loops are interruptible — pressing Escape breaks out immediately. Skip iterations count toward the lifetime dispatch cap, preventing unbounded retry loops from exhausting the budget.

### Post-Mortem Investigation

When auto mode fails or produces unexpected results, `/gsd forensics` provides structured post-mortem analysis. It inspects activity logs, crash locks, and session state to identify root causes — whether the failure was a model error, missing context, a stuck loop, or a broken tool call. See [Troubleshooting](./troubleshooting.md) for more on diagnosing issues.

### Timeout Supervision

Three timeout tiers prevent runaway sessions:

| Timeout | Default | Behavior |
|---------|---------|----------|
| Soft | 20 min | Warns the LLM to wrap up |
| Idle | 10 min | Detects stalls, intervenes |
| Hard | 30 min | Pauses auto mode |

Recovery steering nudges the LLM to finish durable output before timing out. Configure in preferences:

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

Auto mode reads disk state and picks up where it left off.

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

## Dashboard

`Ctrl+Alt+G` or `/gsd status` shows real-time progress:

- Current milestone, slice, and task
- Auto mode elapsed time and phase
- Per-unit cost and token breakdown
- Cost projections
- Completed and in-progress units
- Pending capture count (when captures are awaiting triage)

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
