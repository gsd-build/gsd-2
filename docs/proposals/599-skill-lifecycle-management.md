# Proposal: Skill Lifecycle Management (#599)

## Context

GSD skills are fire-and-forget. No feedback loop exists between skill performance during execution and whether a skill should be improved, retired, or replaced. The SkillsBench research (Feb 2026) found curated skills boost pass rates by +16.2pp while self-generated skills provide zero benefit — the difference is quality control.

This document explores how to close that loop within GSD's existing architecture.

## What Already Exists (as of 2.19.x)

GSD has substantial infrastructure that Phase 1 can hook into without new abstractions:

| Primitive | Location | What it provides |
|---|---|---|
| **Per-unit metrics** | `metrics.ts` → `metrics.json` | Token counts, cost, duration, tool calls, model, complexity tier per unit |
| **Routing history** | `routing-history.ts` → `routing-history.json` | Success/fail per tier per unit-type pattern, feedback entries, rolling window |
| **Activity logs** | `activity-log.ts` → `.gsd/activity/` | Full JSONL session dumps per unit |
| **Skill discovery** | `skill-discovery.ts` | Snapshot/diff of installed skills during auto-mode, XML injection into prompts |
| **Skill preferences** | `preferences.ts` | `always_use_skills`, `prefer_skills`, `avoid_skills`, `skill_rules` |
| **Post-unit hooks** | `post-unit-hooks.ts` | Configurable hooks that fire after unit completion (used for UAT, reassessment) |
| **KNOWLEDGE.md** | `.gsd/KNOWLEDGE.md` | Append-only project-specific rules and lessons learned |
| **Task summaries** | `T##-SUMMARY.md` with YAML frontmatter | `blocker_discovered`, outcome status per task |
| **Doctor** | `doctor.ts` | Diagnostic + auto-fix framework |

### What's Missing

1. **No skill→unit association** — metrics record unit type/id but not which skills were loaded
2. **No skill-level aggregation** — can't answer "how does skill X perform across projects?"
3. **No staleness signal** — no last-used timestamp, no decay mechanism
4. **No feedback channel** — routing-history tracks tier outcomes, not skill outcomes

## Phase 1: Skill Usage Telemetry

**Goal:** Record which skills were loaded per unit. Near-zero implementation cost.

### Approach A: Extend UnitMetrics (Recommended)

Add an optional `skills` field to `UnitMetrics`:

```typescript
// In metrics.ts
export interface UnitMetrics {
  // ... existing fields ...
  skills?: string[];  // skill names loaded during this unit
}
```

**Where to capture:** In `snapshotUnitMetrics()`, read the current system prompt's `<available_skills>` block (already parsed by the extension runner) and extract skill names. Alternatively, track in `auto.ts` by reading `skill-discovery.ts`'s snapshot + any skills the LLM loaded via `read` tool calls to SKILL.md files.

**Simpler path:** The system prompt already has `<available_skills>` injected by pi. The extension's `before_agent_start` hook can capture the skill names at dispatch time and stash them in a module-level variable that `snapshotUnitMetrics` reads.

```typescript
// In auto.ts or a new skill-telemetry.ts
let currentUnitSkills: string[] = [];

// Set at dispatch time (before sendMessage)
function captureLoadedSkills(ctx: ExtensionContext): void {
  // Extract from system prompt's <available_skills> block
  // + any skills from preferences (always_use_skills, prefer_skills)
  currentUnitSkills = [...]; 
}

// Read in snapshotUnitMetrics
function getAndClearSkills(): string[] {
  const skills = currentUnitSkills;
  currentUnitSkills = [];
  return skills;
}
```

**Effort:** ~30 lines. No new files, no schema changes beyond the optional field.

### Approach B: Separate Skill Log

Write a dedicated `skill-usage.jsonl` alongside `metrics.json`:

```jsonl
{"ts":1710000000,"unit":"M001/S01/T01","unitType":"execute-task","skills":["rust-core","axum-web-framework"],"outcome":"success","tokens":12000,"duration":45000}
{"ts":1710000100,"unit":"M001/S01/T02","unitType":"execute-task","skills":["rust-core"],"outcome":"retry","tokens":28000,"duration":90000}
```

**Pros:** Independent of metrics schema, easier to parse externally, can include skill-specific context (e.g., was the skill explicitly loaded via `read` or just available).
**Cons:** Another file to manage, duplicates some metrics data.

**Recommendation:** Start with Approach A. If skill-specific analysis needs grow, extract to a separate log later.

## Phase 2: Skill Health Dashboard

**Goal:** Surface skill performance data via `gsd skill-health`.

### Data Model

Aggregate from `metrics.json` entries that have `skills` field:

```typescript
interface SkillHealth {
  name: string;
  totalUses: number;
  successRate: number;        // units with this skill that succeeded / total
  retryRate: number;          // units that needed retry
  avgTokens: number;          // average token usage when skill is loaded
  tokenTrend: "stable" | "rising" | "declining";
  lastUsed: number;           // timestamp
  staleDays: number;          // days since last use
  projects: string[];         // which projects used it (if multi-project tracking)
}
```

### Commands

```
gsd skill-health              # overview table: name, uses, success%, tokens, last used
gsd skill-health rust-core     # detailed view for one skill
gsd skill-health --stale 30    # skills unused for 30+ days
gsd skill-health --declining   # skills with falling success rates
```

### Implementation

- New command registered in `commands.ts`
- Read `metrics.json`, filter units with `skills` field, aggregate
- Determine success/failure from: unit retry count (from `unitDispatchCount`), `blocker_discovered` in task summaries, or presence in `completed-units.json`
- Token trend: compare last 5 uses to previous 5 uses
- Output as a formatted table (reuse TUI primitives from dashboard)

**Effort:** ~150-200 lines. One new file (`skill-health.ts`), one command registration.

## Phase 3: Staleness Detection & Auto-Exclusion

**Goal:** Skills unused for N days get deprioritized. Configurable threshold.

### Mechanism

1. **Preference:** `skill_staleness_days: 60` (default, 0 = disabled)
2. **At dispatch time:** Before building the `<available_skills>` block, check each skill's last-used timestamp from the aggregated metrics. If stale, exclude from the description-matching list but keep it invokable via explicit `read`.
3. **`gsd skill-health --prune`:** Interactive command to archive stale skills (move to `~/.gsd/agent/skills/.archived/`)

### Where to Hook

The `<available_skills>` block is built by pi's system prompt assembler, not by GSD directly. GSD's options:

- **Option 1:** Use existing `avoid_skills` preference — automatically append stale skill names to the avoid list. Simple, uses existing infrastructure.
- **Option 2:** Add a `before_system_prompt` hook to filter skills. More precise but requires pi SDK changes.

**Recommendation:** Option 1. Write stale skills to a computed `avoid_skills` list at auto-mode start.

## Phase 4: Auto-Improvement Suggestions

**Goal:** Flag skills with declining performance for human review.

### Trigger Conditions

- Success rate drops below 70% over last 10 uses
- Token usage trend is "rising" (>20% increase over last 10 vs previous 10)
- Retry rate exceeds 30%

### Output

Write suggestions to `.gsd/skill-review-queue.md`:

```markdown
## Skill Review Queue

### rust-core (flagged 2026-03-16)
- **Trigger:** Success rate dropped to 60% (last 10 uses)
- **Token trend:** Rising (+35% vs baseline)
- **Suggestion:** Review SKILL.md for stale patterns. Consider updating error handling section.
- **Action:** [ ] Reviewed [ ] Updated [ ] Dismissed
```

### Integration Points

- **Post-slice hook:** After complete-slice, check if any loaded skills triggered a flag
- **Step mode wizard:** Surface pending review items in the wizard
- **Auto mode:** Log flag, don't block
- **KNOWLEDGE.md:** When a skill is updated, append a knowledge entry noting what changed and why

## Phase 5: Skill Versioning & KNOWLEDGE.md Integration

**Goal:** Track skill changes over time and feed lessons back.

### Skill Version Tracking

Add a `skill-versions.json` in `~/.gsd/agent/`:

```json
{
  "rust-core": {
    "currentHash": "abc123",
    "history": [
      {"hash": "abc123", "date": "2026-03-16", "reason": "Updated error handling patterns"},
      {"hash": "def456", "date": "2026-02-01", "reason": "Initial install"}
    ]
  }
}
```

Hash the SKILL.md content on each auto-mode start. When it changes, log the transition.

### KNOWLEDGE.md Feedback

When a skill-related issue is discovered during execution (blocker, retry, unexpected behavior), append to KNOWLEDGE.md:

```markdown
### [2026-03-16] Skill: rust-core — Error handling section outdated
- **Context:** T03 in M002/S02 failed because skill recommended `?` operator in a context where `match` was needed
- **Action:** Updated skill, added pattern for fallible trait implementations
```

This creates a durable record that future agents (and humans) can reference.

## Implementation Priority

| Phase | Effort | Value | Dependencies | Recommendation |
|---|---|---|---|---|
| Phase 1 (telemetry) | ~30 lines | Unblocks everything | None | **Land immediately as standalone** |
| Phase 2 (dashboard) | ~200 lines | Visibility before automation | Phase 1 | Land with Phase 1 or shortly after |
| Phase 3 (staleness) | ~50 lines | Prevents silent degradation | Phase 1 | Can land independently |
| Phase 4 (suggestions) | ~150 lines | Closes the feedback loop | Phase 1 + 2 | After dashboard proves useful |
| Phase 5 (versioning) | ~200 lines | Long-term skill evolution | Phase 1 | Can land independently |

## Open Questions

1. **Multi-project aggregation:** Should skill health be per-project or global? Per-project is simpler (data is in `.gsd/metrics.json`). Global requires a user-level store (`~/.gsd/skill-metrics.json`).

2. **Skill attribution accuracy:** The system prompt includes all available skills, but the LLM may only read and follow one. Should we track "available" vs "actively loaded" (detected via `read` tool calls to SKILL.md files)?

3. **Integration with gsd-skill-creator:** If the skill-creator tool is installed, should Phase 4 suggestions automatically trigger skill regeneration? The SkillsBench research suggests no — human review is the critical differentiator.

4. **Copilot Memory comparison:** GitHub Copilot's agentic memory auto-expires stale memories after 28 days. Should skill staleness use a similar fixed window, or should it be usage-count based (stale after N milestone completions without use)?
