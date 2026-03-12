# Phase 4: Sidebar + Milestone View - Research

**Researched:** 2026-03-10
**Domain:** React component development, live state visualization, SVG rendering
**Confidence:** HIGH

## Summary

Phase 4 fills two existing layout containers -- the Sidebar (Sidebar.tsx) and the Milestone tab (TabLayout.tsx) -- with live content driven by the PlanningState WebSocket hook. The sidebar already has placeholder structure (new-project button, "Projects" label, connection status dot). The TabLayout already has three tabs with empty PanelWrapper content. This phase does NOT create new layout structures; it builds content components INTO these shells.

The key technical challenge is wiring `usePlanningState()` into AppShell so state flows down to sidebar content (project list, nav items, connection indicator, model profile) and milestone tab content (header with progress, phase list rows, committed history). The state deriver already provides all needed data: `PlanningState.state` has milestone/progress, `PlanningState.phases` has phase status/plans, `PlanningState.config` has model_profile, and `PlanningState.roadmap` has phase descriptions.

**Primary recommendation:** Wire `usePlanningState()` at the AppShell level, pass state slices as props to Sidebar and TabLayout children. Build small, focused content components (ProjectList, NavItems, ConnectionStatus, MilestoneHeader, PhaseRow, CommittedHistory) that each receive their typed data slice.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SIDE-01 | GSD pixel-art logo rendered as SVG | Create inline SVG component, no external asset. Design tokens provide cyan accent color. |
| SIDE-02 | Project list shows active/paused status per project | PlanningState.state.status provides current project status. Multi-project support is Phase 7 (SESS-03); for now show single project. |
| SIDE-03 | Navigation items: Projects, Activity, Verify, History | Static nav list with lucide-react icons. Only Projects is functional in Phase 4; others are stubs. |
| SIDE-04 | Claude Code connection indicator: pulsing cyan dot with ACTIVE/DISCONNECTED label | usePlanningState().status provides ConnectionStatus type ("connecting"/"connected"/"disconnected"). Map to UI states. |
| SIDE-05 | Current model profile displayed from config.json | PlanningState.config.model_profile provides the value. Display in sidebar footer. |
| MLST-01 | Header: git branch, milestone name, overall progress bar, tasks complete/total | PlanningState.state has milestone_name, progress.completed_plans/total_plans, progress.percent. Git branch needs `git rev-parse --abbrev-ref HEAD` -- add to state deriver or derive client-side. |
| MLST-02 | Phase list rows: status icon, phase ID in cyan, task progress bar, demo sentence | PlanningState.phases array + PlanningState.roadmap.phases for descriptions. Phase status maps to icons. |
| MLST-03 | Completed phases show squash commit message | Not currently in PlanningState. Need to extend state deriver to extract commit messages from phase directories or git log. |
| MLST-04 | Committed history section: all squash merge commits at panel bottom | Same gap as MLST-03 -- needs git integration or file-based commit tracking. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | Component framework | Already installed, project standard |
| lucide-react | 0.577.0 | Icons for nav items, status indicators | Already installed, consistent icon style |
| Tailwind CSS | 4.2.1 | Styling with design tokens | Already configured with custom theme |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx + tailwind-merge | 2.1.1 / 3.5.0 | Conditional class composition | Via existing `cn()` utility |
| class-variance-authority | 0.7.1 | Component variants (status badges) | For status icon/badge variants |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline SVG for logo | External SVG file | Inline allows dynamic theming with design tokens, no asset loading |
| CSS animations for pulsing dot | Framer Motion | Already using Tailwind animate-pulse, no new dependency needed |

**Installation:**
```bash
# No new packages needed -- everything is already installed
```

## Architecture Patterns

### Recommended Component Structure
```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx          # MODIFY: accept state props, render content
│   │   ├── TabLayout.tsx        # MODIFY: accept state, render milestone tab
│   │   └── AppShell.tsx         # MODIFY: wire usePlanningState, pass state down
│   ├── sidebar/
│   │   ├── GsdLogo.tsx          # NEW: pixel-art SVG logo component
│   │   ├── ProjectList.tsx      # NEW: project entries with status
│   │   ├── NavItems.tsx         # NEW: navigation item list
│   │   └── ConnectionStatus.tsx # NEW: connection dot + label + model profile
│   ├── milestone/
│   │   ├── MilestoneHeader.tsx  # NEW: branch, name, progress bar, counts
│   │   ├── PhaseRow.tsx         # NEW: single phase row with status/progress
│   │   ├── PhaseList.tsx        # NEW: maps phases array to PhaseRow components
│   │   └── CommittedHistory.tsx # NEW: squash merge commit list
│   └── shared/
│       └── ProgressBar.tsx      # NEW: reusable progress bar (used in header + rows)
```

### Pattern 1: State Lifting to AppShell
**What:** Call `usePlanningState()` once in AppShell, pass slices as props to children.
**When to use:** Always -- single source of truth, no duplicate WebSocket connections.
**Example:**
```typescript
export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { state, status } = usePlanningState();

  return (
    <div className="flex h-screen bg-navy-base">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        connectionStatus={status}
        projectState={state?.state ?? null}
        configState={state?.config ?? null}
      />
      <TabLayout
        className="flex-1"
        planningState={state}
      />
    </div>
  );
}
```

### Pattern 2: Phase Status to Visual Mapping
**What:** Map PhaseStatus enum to icon + color combinations using a lookup object.
**When to use:** PhaseRow component rendering.
**Example:**
```typescript
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

const STATUS_MAP: Record<PhaseStatus, { icon: typeof Circle; color: string; label: string }> = {
  not_started: { icon: Circle, color: "text-slate-500", label: "Not Started" },
  in_progress: { icon: Loader2, color: "text-status-warning", label: "In Progress" },
  complete: { icon: CheckCircle2, color: "text-status-success", label: "Complete" },
};
```

### Pattern 3: Progress Bar Component
**What:** Reusable progress bar with percentage fill and color theming.
**When to use:** Milestone header (overall) and PhaseRow (per-phase task progress).
**Example:**
```typescript
interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-navy-700", className)}>
      <div
        className="h-full rounded-full bg-cyan-accent transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Multiple usePlanningState calls:** Each call opens a new WebSocket. Call it ONCE in AppShell.
- **Putting git commands in React components:** Git branch detection belongs in the server state deriver, not client-side.
- **Hard-coding phase descriptions:** Use PlanningState.roadmap.phases[].description, not duplicated strings.
- **Building the logo as a raster image:** Use inline SVG for crisp rendering at all sizes and dynamic color theming.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icons | Custom SVG icons for nav/status | lucide-react | Already installed, consistent 24x24 grid |
| Progress bar animation | Manual CSS keyframes | Tailwind transition-all + inline width | Simpler, matches existing patterns |
| Connection status pulse | Custom animation | Tailwind animate-pulse class | Already used in current Sidebar.tsx |
| Class composition | String concatenation | cn() utility (clsx + tailwind-merge) | Project standard, avoids class conflicts |

**Key insight:** The project already has all needed UI primitives. Phase 4 is a composition exercise, not an infrastructure one.

## Common Pitfalls

### Pitfall 1: Missing Data During Loading
**What goes wrong:** Components crash with null access when PlanningState is null (initial load or disconnected).
**Why it happens:** usePlanningState() returns null until first WebSocket message arrives.
**How to avoid:** Always check for null state. Use PanelWrapper's isLoading/isEmpty states. Sidebar should render skeleton or empty states gracefully.
**Warning signs:** TypeError: Cannot read property of null in console.

### Pitfall 2: Stale Connection Status Display
**What goes wrong:** Connection dot shows "Active" but WebSocket is actually disconnected.
**Why it happens:** Using PlanningState presence as proxy for connection instead of the `status` field from usePlanningState().
**How to avoid:** Use the `status` return value directly: "connected" = cyan pulse, "connecting" = amber pulse, "disconnected" = red static.
**Warning signs:** Dot stays cyan even when server is stopped.

### Pitfall 3: Phase Progress Calculation Errors
**What goes wrong:** Progress bars show wrong percentages or NaN.
**Why it happens:** Division by zero when a phase has 0 plans, or plans array is empty.
**How to avoid:** Guard: `plans.length > 0 ? (completedPlans / plans.length) * 100 : 0`.
**Warning signs:** NaN in progress bars, 100% shown for phases with no plans.

### Pitfall 4: SVG Logo Not Respecting Design Tokens
**What goes wrong:** Logo colors are hard-coded, don't match the rest of the UI.
**Why it happens:** SVG fill/stroke values use hex literals instead of currentColor or CSS custom properties.
**How to avoid:** Use `currentColor` for SVG fills and set text color via Tailwind classes on the wrapper, or reference CSS custom properties directly.
**Warning signs:** Logo looks different from the cyan accent used elsewhere.

### Pitfall 5: Git Branch Data Not Available in PlanningState
**What goes wrong:** MLST-01 requires git branch display but PlanningState has no branch field.
**Why it happens:** The state deriver (state-deriver.ts) only parses .planning/ files, not git state.
**How to avoid:** Extend the state deriver to run `git rev-parse --abbrev-ref HEAD` and include it in ProjectState, OR add a separate server endpoint. Prefer extending the deriver since it already runs server-side.
**Warning signs:** Milestone header has no branch name or shows "unknown".

### Pitfall 6: MLST-03/MLST-04 Squash Commit Data Not in State
**What goes wrong:** Cannot display squash commit messages because they're not in PlanningState.
**Why it happens:** State deriver doesn't parse git log or commit history.
**How to avoid:** Two options: (a) extend state deriver to run `git log --oneline` for squash merges, or (b) read commit info from phase SUMMARY.md files if they contain it. Option (b) is simpler and avoids git dependency in the deriver.
**Warning signs:** Empty committed history section.

## Code Examples

### GSD Logo SVG Component
```typescript
// Pixel-art style logo using SVG rects for a blocky/terminal aesthetic
export function GsdLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Pixel grid blocks forming "GSD" letters or a terminal icon */}
      {/* Use currentColor so parent text-cyan-accent colors it */}
      <rect x="2" y="2" width="4" height="4" fill="currentColor" />
      {/* ... additional pixel blocks ... */}
    </svg>
  );
}
```

### Extending AppShell with State
```typescript
import { usePlanningState } from "@/hooks/usePlanningState";

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { state, status } = usePlanningState();

  return (
    <div className="flex h-screen bg-navy-base">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        connectionStatus={status}
        projectState={state?.state ?? null}
        configState={state?.config ?? null}
      />
      <TabLayout
        className="flex-1"
        planningState={state}
      />
    </div>
  );
}
```

### Connection Status Component
```typescript
import type { ConnectionStatus as ConnStatus } from "@/hooks/useReconnectingWebSocket";

const STATUS_CONFIG: Record<ConnStatus, { dotClass: string; label: string }> = {
  connected: { dotClass: "bg-cyan-accent animate-pulse", label: "ACTIVE" },
  connecting: { dotClass: "bg-status-warning animate-pulse", label: "CONNECTING" },
  disconnected: { dotClass: "bg-status-error", label: "DISCONNECTED" },
};

export function ConnectionStatus({ status }: { status: ConnStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <div className="flex items-center gap-2">
      <span className={cn("inline-block h-2 w-2 rounded-full", config.dotClass)} />
      <span className="font-display text-xs uppercase tracking-wider text-slate-400">
        {config.label}
      </span>
    </div>
  );
}
```

### Phase Row Component
```typescript
import type { PhaseState, RoadmapPhase } from "@/server/types";

interface PhaseRowProps {
  phase: PhaseState;
  roadmapInfo?: RoadmapPhase;
}

export function PhaseRow({ phase, roadmapInfo }: PhaseRowProps) {
  const statusConfig = STATUS_MAP[phase.status];
  const Icon = statusConfig.icon;
  const completedPlans = phase.plans.filter(/* determine completed */).length;
  const progress = phase.plans.length > 0
    ? (completedPlans / phase.plans.length) * 100
    : 0;

  return (
    <div className="flex items-center gap-4 border-b border-navy-700 px-4 py-3">
      <Icon className={cn("h-4 w-4 shrink-0", statusConfig.color)} />
      <span className="font-display text-sm text-cyan-accent">
        Phase {phase.number}
      </span>
      <div className="flex-1">
        <p className="font-mono text-xs text-slate-400">
          {roadmapInfo?.description ?? phase.name}
        </p>
        <ProgressBar value={progress} className="mt-1" />
      </div>
      <span className="font-mono text-xs text-slate-500">
        {completedPlans}/{phase.plans.length}
      </span>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 5-panel PanelShell layout | Sidebar + TabLayout (Phase 3.1) | 2026-03-10 | All Phase 4 content targets Sidebar.tsx and TabLayout.tsx containers |
| PanelWrapper for each panel | PanelWrapper still used inside tabs | Phase 3.1 | Keep using PanelWrapper for loading/empty/error in tab content |

**Deprecated/outdated:**
- PanelShell.tsx: Legacy 5-panel layout, kept for reference but not used in current AppShell

## State Deriver Gaps

The current `PlanningState` type and `state-deriver.ts` are missing data needed by Phase 4:

| Missing Data | Required By | Proposed Solution |
|-------------|-------------|-------------------|
| Git branch name | MLST-01 | Add `branch` field to ProjectState; run `git rev-parse --abbrev-ref HEAD` in buildFullState |
| Per-phase task completion count | MLST-02 | Already available: count SUMMARY.md files vs PLAN.md files in state-deriver.ts |
| Squash commit messages | MLST-03, MLST-04 | Add `commitMessage` to PhaseState; parse from git log or phase directory files |
| Phase descriptions for "demo sentence" | MLST-02 | Available via RoadmapState.phases[].description -- cross-reference by phase number |

These gaps should be addressed in the first plan (server-side state extension) before building UI components.

## Open Questions

1. **Git branch in state deriver**
   - What we know: `git rev-parse --abbrev-ref HEAD` works from Bun via `Bun.spawn`
   - What's unclear: Should this be in buildFullState (called on every file change) or a separate one-time call?
   - Recommendation: Call once on startup and on reconnect, cache in state. Branch doesn't change during a session typically.

2. **Squash commit messages source**
   - What we know: GSD creates squash merge commits when completing phases. These could be read from git log.
   - What's unclear: Is there a file-based source (like SUMMARY.md containing the commit message), or must we parse git log?
   - Recommendation: Use `git log --oneline --grep="squash"` or look for a pattern in phase directories. File-based is more reliable than git log parsing.

3. **Multi-project support scope**
   - What we know: SIDE-02 says "project list shows active/paused status per project" but SESS-03 (multi-project) is Phase 7.
   - What's unclear: Should Phase 4 show a list with just one project, or prepare the list component for multiple?
   - Recommendation: Build ProjectList component that accepts an array but populate with single current project for now. Multi-project data source is Phase 7's concern.

4. **Pixel-art logo design**
   - What we know: SIDE-01 says "matching terminal screenshot" but no reference screenshot is provided.
   - What's unclear: Exact pixel layout for the logo.
   - Recommendation: Create a simple blocky/terminal-aesthetic SVG (e.g., stylized "GSD" in a grid, or a terminal cursor icon). Keep it 32x32 viewBox with 4px grid cells for pixel-art feel.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | None -- bun:test works by convention |
| Quick run command | `bun test tests/sidebar.test.tsx tests/milestone.test.tsx` |
| Full suite command | `cd packages/mission-control && bun test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SIDE-01 | GSD logo renders as SVG | unit | `bun test tests/sidebar.test.tsx -t "logo"` | No -- Wave 0 |
| SIDE-02 | Project list shows active/paused status | unit | `bun test tests/sidebar.test.tsx -t "project"` | No -- Wave 0 |
| SIDE-03 | Navigation items visible | unit | `bun test tests/sidebar.test.tsx -t "nav"` | No -- Wave 0 |
| SIDE-04 | Connection indicator with status label | unit | `bun test tests/sidebar.test.tsx -t "connection"` | No -- Wave 0 |
| SIDE-05 | Model profile displayed | unit | `bun test tests/sidebar.test.tsx -t "model"` | No -- Wave 0 |
| MLST-01 | Milestone header with progress | unit | `bun test tests/milestone.test.tsx -t "header"` | No -- Wave 0 |
| MLST-02 | Phase rows with status/progress | unit | `bun test tests/milestone.test.tsx -t "phase row"` | No -- Wave 0 |
| MLST-03 | Completed phase commit message | unit | `bun test tests/milestone.test.tsx -t "commit"` | No -- Wave 0 |
| MLST-04 | Committed history section | unit | `bun test tests/milestone.test.tsx -t "history"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/mission-control && bun test tests/sidebar.test.tsx tests/milestone.test.tsx`
- **Per wave merge:** `cd packages/mission-control && bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/sidebar.test.tsx` -- covers SIDE-01 through SIDE-05
- [ ] `tests/milestone.test.tsx` -- covers MLST-01 through MLST-04
- [ ] `tests/state-deriver-extended.test.ts` -- covers git branch and commit message extraction

## Sources

### Primary (HIGH confidence)
- Project source code: Sidebar.tsx, TabLayout.tsx, AppShell.tsx, design-tokens.ts, types.ts, state-deriver.ts, usePlanningState.ts -- read directly from codebase
- PlanningState type definition in server/types.ts -- defines exact data shape available
- Existing test patterns in tests/layout.test.tsx -- defines test conventions (bun:test, JSON.stringify inspection)

### Secondary (MEDIUM confidence)
- Tailwind CSS v4 @theme syntax in globals.css -- verified in project source
- lucide-react icon availability -- verified via package.json dependency

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed, no new dependencies
- Architecture: HIGH - extending existing patterns (AppShell -> Sidebar/TabLayout prop drilling)
- Pitfalls: HIGH - identified from direct code reading (null state, missing git data, progress division)
- State gaps: MEDIUM - git integration approach needs validation during implementation

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- no external dependencies changing)
