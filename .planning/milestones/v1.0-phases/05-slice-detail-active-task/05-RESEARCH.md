# Phase 5: Slice Detail + Active Task - Research

**Researched:** 2026-03-10
**Domain:** React component development, state deriver extension, data visualization (bar charts, status displays)
**Confidence:** HIGH

## Summary

Phase 5 fills the remaining two content areas of the dashboard: the Slice Detail panel (context budget bar chart, boundary maps, UAT status) and the Active Task panel (executing/waiting states with task metadata). Both panels require extending the state deriver to parse new data from PLAN.md frontmatter (must_haves, files_modified, task count) and from VERIFICATION.md/VALIDATION.md files. The UI components follow the exact same patterns established in Phases 3-4: functional components with typed props, PanelWrapper for loading/empty/error states, STATUS_CONFIG/STATUS_ICONS lookup objects, cn() for class composition, design tokens for colors/spacing, and bun:test with JSON.stringify inspection for testing.

The critical insight is that "context budget" in the GSD system is not a numeric field in plan files -- it is derived from task count and file count per plan (plans target 2-3 tasks, ~50% context budget). The bar chart must derive budget usage from `tasks.length` and `files_modified.length` per plan. "Boundary maps" correspond to the `must_haves.key_links` and `files_modified` data in PLAN.md frontmatter, showing what each phase/plan produces and consumes. UAT status comes from VERIFICATION.md files per completed phase. Active task state is derived from STATE.md's `stopped_at` field and the current plan's task list.

**Primary recommendation:** Extend the state deriver to parse must_haves, key_links, and verification data from plan files, then build pure presentational components that receive this data as props through the existing PlanningState -> TabLayout -> component chain.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLCD-01 | Context usage bar chart with one bar per task, color-coded by budget (green <50%, amber 50-70%, red >70%) | State deriver parses task count and files_modified per plan; ContextBudgetChart component renders bars with COLORS.status tokens |
| SLCD-02 | Boundary map shows PRODUCES (green-bordered) and CONSUMES (blue-bordered) lists | State deriver parses must_haves.artifacts (produces) and must_haves.key_links (consumes) from PLAN.md frontmatter |
| SLCD-03 | UAT status rows per completed phase with test count, verification bars, and status badges | State deriver parses VERIFICATION.md files for score, status, and truth count per phase |
| TASK-01 | Executing state: pulsing amber dot, task ID, wave number, context budget meter with color shift | Derive from STATE.md status + current plan metadata; amber dot uses COLORS.status.warning + animate-pulse |
| TASK-02 | Must-haves list with completion state, tier badges (BEHAVIORAL, STATIC, COMMAND, HUMAN) | Parse must_haves.truths from current plan frontmatter; tier badges use variant styling |
| TASK-03 | Target files list with FileCode icons | Use files_modified from current plan frontmatter; FileCode icon from lucide-react |
| TASK-04 | Checkpoint reference showing git checkpoint before task started | Parse checkpoint from SUMMARY.md or derive from git state |
| TASK-05 | Waiting state: last completed summary, next task name, run-next-task prompt | Derive from STATE.md stopped_at + next incomplete plan in phases array |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | UI components | Already installed, project standard |
| lucide-react | 0.577.0 | Icons (FileCode, Activity, CheckCircle2, Circle, BarChart3, ArrowRight, GitCommit) | Already used in sidebar and milestone components |
| tailwindcss | 4.2.1 | Utility-first styling | Already installed, project standard |
| bun:test | built-in | Testing | Project standard, no config needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| gray-matter | 4.0.3 | YAML frontmatter parsing from PLAN.md/VERIFICATION.md | Already used by state deriver for plan parsing |
| class-variance-authority | 0.7.1 | Variant-based component styling | For tier badges (BEHAVIORAL/STATIC/COMMAND/HUMAN) |
| clsx + tailwind-merge (via cn()) | installed | Class composition | Every component |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom CSS bar chart | recharts/d3 | Overkill for simple horizontal bars; custom divs with width% match existing ProgressBar pattern |
| Complex state management | Props drilling from TabLayout | Project pattern is props-from-AppShell, no need for context/zustand at this scale |

**Installation:**
```bash
# No new packages needed - everything is already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── slice-detail/       # SLCD-01, SLCD-02, SLCD-03 components
│   │   ├── ContextBudgetChart.tsx    # Bar chart for context usage per task
│   │   ├── BoundaryMap.tsx           # PRODUCES/CONSUMES lists
│   │   └── UatStatus.tsx             # UAT verification rows per phase
│   ├── active-task/        # TASK-01 through TASK-05 components
│   │   ├── TaskExecuting.tsx         # Pulsing amber dot, task ID, wave, budget meter
│   │   ├── TaskWaiting.tsx           # Last completed summary, next task, prompt
│   │   ├── MustHavesList.tsx         # Must-haves with tier badges
│   │   ├── TargetFiles.tsx           # Files list with FileCode icons
│   │   └── CheckpointRef.tsx         # Git checkpoint reference
│   └── shared/
│       └── ProgressBar.tsx           # Already exists, reuse for budget meters
├── server/
│   ├── types.ts            # Extended with SliceDetailState, ActiveTaskState
│   └── state-deriver.ts    # Extended to parse must_haves, verification data
└── tests/
    ├── slice-detail.test.tsx   # Tests for slice detail components
    └── active-task.test.tsx    # Tests for active task components
```

### Pattern 1: STATUS_CONFIG Lookup (established project pattern)
**What:** Map state values to visual properties via const object
**When to use:** Any component that maps a status/type to colors, icons, labels
**Example:**
```typescript
// Source: Existing pattern in ConnectionStatus.tsx and PhaseRow.tsx
const BUDGET_COLORS = {
  green: { bg: "bg-status-success", label: "Under budget" },
  amber: { bg: "bg-status-warning", label: "Near budget" },
  red: { bg: "bg-status-error", label: "Over budget" },
} as const;

function getBudgetColor(percent: number): keyof typeof BUDGET_COLORS {
  if (percent < 50) return "green";
  if (percent <= 70) return "amber";
  return "red";
}
```

### Pattern 2: PanelWrapper for Tab Content (established project pattern)
**What:** Wrap tab content in PanelWrapper with isLoading/isEmpty/error states
**When to use:** Every tab content area
**Example:**
```typescript
// Source: Existing pattern in TabLayout.tsx milestone tab
<PanelWrapper
  title="Slice Detail"
  isLoading={planningState === null}
  isEmpty={planningState !== null && !hasSliceData}
>
  <ContextBudgetChart plans={currentPhase.plans} />
  <BoundaryMap plans={currentPhase.plans} />
  <UatStatus phases={planningState.phases} />
</PanelWrapper>
```

### Pattern 3: Direct Function Call Testing (established project pattern)
**What:** Test components by calling them as functions and inspecting JSON.stringify output
**When to use:** All component tests in this project
**Example:**
```typescript
// Source: Existing pattern in milestone.test.tsx and sidebar.test.tsx
import { describe, expect, it } from "bun:test";
const result = ContextBudgetChart({ plans: mockPlans });
const json = JSON.stringify(result);
expect(json).toContain("bg-status-success");
expect(json).toContain("50%");
```

### Pattern 4: Props from AppShell via TabLayout
**What:** All state flows from AppShell -> TabLayout -> content components via props
**When to use:** Always. No component fetches its own data.
**Example:**
```typescript
// TabLayout receives planningState, passes relevant slices to children
// AppShell already passes full planningState to TabLayout
if (activeTab === "slice") {
  return (
    <PanelWrapper title="Slice Detail" ...>
      <SliceDetailContent
        phases={planningState.phases}
        verifications={planningState.verifications}
      />
    </PanelWrapper>
  );
}
```

### Anti-Patterns to Avoid
- **Don't use useState for derived data:** Context budget percentages, boundary lists, and active task state are all computed from PlanningState. Use plain computation in render, not local state.
- **Don't create a separate data fetching layer:** The WebSocket pipeline already delivers all state. Components are pure presentational.
- **Don't use DOM-based testing:** Project pattern is JSON.stringify inspection, not render + querySelector.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bar chart rendering | SVG/canvas chart library | Simple div elements with width percentages | ProgressBar pattern already exists; horizontal bars are just divs with dynamic widths and colored backgrounds |
| YAML frontmatter parsing | Custom regex parser | gray-matter (already used) | Handles edge cases in YAML, already a dependency |
| Icon rendering | Custom SVG icons | lucide-react (already used) | Consistent icon set, tree-shakeable |
| Class composition | Manual string concatenation | cn() from @/lib/utils | Already standardized across all components |
| Badge variants | Custom conditional classes | class-variance-authority (cva) | Already installed, ideal for tier badge variants |

**Key insight:** The context budget "bar chart" is NOT a chart library use case. It is a set of horizontal colored divs, exactly like the existing ProgressBar component but with per-task granularity and color coding. Do not reach for recharts or d3.

## Common Pitfalls

### Pitfall 1: Misunderstanding Context Budget Data Source
**What goes wrong:** Assuming there is a `context_budget` field in plan files. There is not.
**Why it happens:** The requirements mention "context budget" as a displayed metric, but GSD plans track this implicitly through task count and file count.
**How to avoid:** Derive budget percentage from `plan.files_modified.length` relative to a threshold. A plan with 2-3 tasks and ~5-8 files is ~50% budget. Use heuristics: files_per_task ratio or total_files / max_expected_files.
**Warning signs:** Looking for a field called `context_budget` in frontmatter and not finding it.

### Pitfall 2: Parsing Must-Haves as Simple Strings
**What goes wrong:** The `must_haves` frontmatter is a nested YAML structure (truths array, artifacts array, key_links array), not a flat string list.
**Why it happens:** Quick glance at frontmatter might miss the nesting.
**How to avoid:** Use gray-matter which properly parses nested YAML. Type the parsed data as `MustHaves { truths: string[]; artifacts: Artifact[]; key_links: KeyLink[] }`.
**Warning signs:** Getting `[object Object]` in rendered output.

### Pitfall 3: Forgetting Empty/Loading States
**What goes wrong:** Components crash or show nothing when there is no current phase selected or no active task.
**Why it happens:** Happy-path development without considering null states.
**How to avoid:** Use PanelWrapper (already handles isLoading/isEmpty/error). Active task has two explicit states: executing and waiting. Design for waiting-with-no-data as a third empty state.
**Warning signs:** Undefined property access errors in console.

### Pitfall 4: Not Extending PlanningState Type
**What goes wrong:** New data (verifications, must_haves parsed data) is not available to components because the type was not extended.
**Why it happens:** Adding UI components without updating the data pipeline first.
**How to avoid:** Always extend types.ts and state-deriver.ts BEFORE building components. This was the pattern in Phase 4 (Plan 01 extended types, Plan 02 built components).
**Warning signs:** Components receiving undefined props.

### Pitfall 5: Active Task State Confusion
**What goes wrong:** Cannot determine if a task is "executing" or "waiting" from existing state.
**Why it happens:** The GSD system does not have a real-time "currently executing" signal -- it is inferred from STATE.md status and file timestamps.
**How to avoid:** Define clear rules: if `state.status === "active"` and current plan has incomplete tasks (no SUMMARY.md), show executing state. Otherwise show waiting state. The `.continue-here.md` file presence also indicates in-progress work.
**Warning signs:** Both executing and waiting states showing simultaneously.

## Code Examples

### Context Budget Bar (SLCD-01)
```typescript
// Pure presentational component following ProgressBar pattern
interface BudgetBar {
  taskId: string;
  filesCount: number;
  maxFiles: number;
}

function getBudgetPercent(filesCount: number, maxFiles: number): number {
  return Math.min(100, Math.round((filesCount / maxFiles) * 100));
}

// Renders one bar per task with color-coded fill
// green <50%, amber 50-70%, red >70%
```

### Boundary Map (SLCD-02)
```typescript
// Derived from must_haves.artifacts (PRODUCES) and must_haves.key_links (CONSUMES)
interface BoundaryItem {
  label: string;
  type: "produces" | "consumes";
}

// PRODUCES: artifacts[].path values -> green border
// CONSUMES: key_links[].to values -> blue/cyan border
```

### Tier Badge (TASK-02)
```typescript
// Using cva for tier badge variants
import { cva } from "class-variance-authority";

const tierBadge = cva(
  "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs uppercase",
  {
    variants: {
      tier: {
        BEHAVIORAL: "bg-cyan-accent/20 text-cyan-accent",
        STATIC: "bg-status-success/20 text-status-success",
        COMMAND: "bg-status-warning/20 text-status-warning",
        HUMAN: "bg-status-error/20 text-status-error",
      },
    },
  }
);
```

### Active Task Executing State (TASK-01)
```typescript
// Amber pulsing dot matching ConnectionStatus pattern
<div className="flex items-center gap-2">
  <div className="h-2 w-2 rounded-full bg-status-warning animate-pulse" />
  <span className="font-display text-xs uppercase tracking-wider text-slate-400">
    EXECUTING
  </span>
</div>
// Task ID, wave number, context budget meter follow below
```

### Waiting State (TASK-05)
```typescript
// Shows last completed info and next task prompt
<div className="space-y-4">
  <div className="text-slate-500 font-mono text-xs">
    Last: {lastCompletedSummary}
  </div>
  <div className="text-slate-300 font-mono text-sm">
    Next: {nextTaskName}
  </div>
  <div className="text-cyan-accent font-display text-xs uppercase">
    Run /gsd:progress to continue
  </div>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PanelShell 5-panel layout | Sidebar + TabLayout | Phase 3.1 (2026-03-10) | Slice Detail and Active Task content goes inside the "Slice" and "Chat & Task" tabs respectively |
| Placeholder empty panels | PanelWrapper with content | Phase 4 (2026-03-10) | Milestone tab fully wired; Slice and Chat & Task tabs still show PanelWrapper empty state |
| PhaseState without completedPlans | PhaseState with completedPlans | Phase 4 (2026-03-10) | UAT status can reference completed plan counts |

**Key architectural note:** The original 5-panel layout was replaced in Phase 3.1 with a sidebar + tab navigation. The three tabs are "Chat & Task", "Milestone", and "Slice". Phase 5 fills the "Slice" tab with slice detail content and adds active task content to the "Chat & Task" tab. The TabLayout.tsx `renderTabContent()` function is the integration point for both.

## Open Questions

1. **Context budget calculation heuristic**
   - What we know: Plans target 2-3 tasks, ~50% context budget. files_modified tracks affected files per plan.
   - What's unclear: The exact formula to convert task/file counts into a percentage. No explicit numeric field exists.
   - Recommendation: Use `files_per_task = files_modified.length / tasks.length`. Define thresholds: <4 files/task = green, 4-6 = amber, >6 = red. Alternatively, use total files per plan: <8 = green, 8-12 = amber, >12 = red. The planner should pick one formula and document it.

2. **Active task detection mechanism**
   - What we know: STATE.md has `status` field and `stopped_at` field. `.continue-here.md` files indicate in-progress work.
   - What's unclear: Whether to detect "currently executing" in real time (file watcher sees writes) or from STATE.md snapshots.
   - Recommendation: Use STATE.md status as primary signal. The file watcher already triggers state rebuilds on changes. If status is "active" and current phase has plans without matching SUMMARY files, show executing. Otherwise show waiting.

3. **Phase selection for Slice Detail**
   - What we know: Slice detail shows data for a specific phase (context budget per task, boundary map).
   - What's unclear: How does the user select which phase to view? Click on PhaseRow in Milestone tab?
   - Recommendation: Default to current active phase (derived from STATE.md). Phase selection interaction can be deferred to a later enhancement. For now, slice detail always shows the current/latest phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | None -- bun:test works by convention |
| Quick run command | `cd packages/mission-control && bun test tests/slice-detail.test.tsx tests/active-task.test.tsx` |
| Full suite command | `cd packages/mission-control && bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLCD-01 | Context usage bar chart renders bars with correct colors per budget threshold | unit | `cd packages/mission-control && bun test tests/slice-detail.test.tsx -t "ContextBudgetChart"` | No -- Wave 0 |
| SLCD-02 | Boundary map renders PRODUCES (green) and CONSUMES (blue) lists | unit | `cd packages/mission-control && bun test tests/slice-detail.test.tsx -t "BoundaryMap"` | No -- Wave 0 |
| SLCD-03 | UAT status rows render per completed phase with status badges | unit | `cd packages/mission-control && bun test tests/slice-detail.test.tsx -t "UatStatus"` | No -- Wave 0 |
| TASK-01 | Executing state shows amber dot, task ID, wave number, budget meter | unit | `cd packages/mission-control && bun test tests/active-task.test.tsx -t "TaskExecuting"` | No -- Wave 0 |
| TASK-02 | Must-haves list renders with tier badges | unit | `cd packages/mission-control && bun test tests/active-task.test.tsx -t "MustHavesList"` | No -- Wave 0 |
| TASK-03 | Target files list renders with FileCode icons | unit | `cd packages/mission-control && bun test tests/active-task.test.tsx -t "TargetFiles"` | No -- Wave 0 |
| TASK-04 | Checkpoint reference renders git checkpoint info | unit | `cd packages/mission-control && bun test tests/active-task.test.tsx -t "CheckpointRef"` | No -- Wave 0 |
| TASK-05 | Waiting state shows last completed, next task, and prompt | unit | `cd packages/mission-control && bun test tests/active-task.test.tsx -t "TaskWaiting"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/mission-control && bun test tests/slice-detail.test.tsx tests/active-task.test.tsx`
- **Per wave merge:** `cd packages/mission-control && bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/slice-detail.test.tsx` -- covers SLCD-01, SLCD-02, SLCD-03
- [ ] `tests/active-task.test.tsx` -- covers TASK-01, TASK-02, TASK-03, TASK-04, TASK-05
- [ ] `tests/state-deriver-phase5.test.ts` -- covers state deriver extensions for must_haves, verification parsing

## Sources

### Primary (HIGH confidence)
- Project codebase direct inspection -- types.ts, state-deriver.ts, TabLayout.tsx, PhaseRow.tsx, milestone.test.tsx, sidebar.test.tsx
- PLAN.md frontmatter structure -- 04-01-PLAN.md examined for must_haves, key_links, files_modified format
- VERIFICATION.md structure -- 04-VERIFICATION.md examined for score, status, truth table format
- design-tokens.ts -- COLORS.status (success/warning/error), TYPOGRAPHY, SPACING constants

### Secondary (MEDIUM confidence)
- GSD agent documentation (gsd-planner.md, gsd-verifier.md) -- for must_haves structure and context budget concepts
- GSD plan-checker documentation -- for context budget heuristics (2-3 tasks, ~50% target)

### Tertiary (LOW confidence)
- Context budget percentage calculation -- no explicit formula exists in the codebase; heuristic must be defined by planner

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and used in Phases 3-4
- Architecture: HIGH - follows exact same component/test/state patterns from Phases 3-4
- Pitfalls: HIGH - based on direct codebase inspection of data structures and existing patterns
- Context budget formula: LOW - requires planner decision on heuristic since no explicit field exists

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- all dependencies locked, patterns established)
