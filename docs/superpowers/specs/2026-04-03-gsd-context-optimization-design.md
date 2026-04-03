# GSD Context Optimization — Design Spec

**Date:** 2026-04-03
**Scope:** GSD extension layer only (`src/resources/extensions/gsd/`)
**Goal:** Equal-weight cost reduction and context drift prevention across the GSD auto-mode lifecycle
**Approach:** Option B — Context Pipeline + Routing
**Related:** ADR-004 (Phase 2 completion), Issues #3452, #3171, #3406, #3433

---

## Background

GSD auto-mode dispatches agents across a full milestone lifecycle (discuss → plan → execute → verify). Two structural problems drive wasted spend and degraded output quality:

1. **Context accumulation**: Tool results from early turns are re-sent verbatim to the LLM on every subsequent turn. Compaction fires reactively at 91.5% window utilization — by which point context drift has typically already degraded output quality.

2. **Phase blindness**: Each phase agent starts with no structured knowledge of what the previous phase decided, discovered, or left unresolved. The discuss phase writes `S##-CONTEXT.md` artifacts, but no downstream prompt builder reads them. Phases reinfer context from scratch.

Research grounding:
- JetBrains SWE-bench study (500 tasks, 250-turn trajectories): observation masking cut costs 50%+ with no accuracy regression, outperforming LLM summarization.
- Zylos production data: context drift (not exhaustion) causes ~65% of enterprise agent failures. Performance degrades measurably beyond ~30K tokens.
- Caliber AI pattern: platform-specific context files + session learning distillation into persistent anchor files.

---

## Architecture

Six changes, all scoped to `src/resources/extensions/gsd/`. Zero changes to `packages/pi-coding-agent` or `packages/pi-agent-core`. All new behaviour is additive and off-by-default where it touches routing preferences.

```
src/resources/extensions/gsd/
  model-router.ts          ← Change 1: capability profiles + scoring
  auto-model-selection.ts  ← Change 1: before_model_select hook emission
  [prompt builders]        ← Change 2: S##-CONTEXT.md injection
  phase-anchor.ts          ← Change 3: new file — anchor write/read
  context-masker.ts        ← Change 4: new file — transformContext handler
  register-hooks.ts        ← Change 4: register masker
  [session init path]      ← Changes 5 & 6: threshold overrides
```

---

## Change 1: ADR-004 Phase 2 — Capability Profile Scoring

### What's already there (Phase 1)
`model-router.ts` has a working complexity-tier router: light/standard/heavy tiers, budget pressure downgrade, cost-based selection within a tier, fallback chains, adaptive learning via `routing-history.ts`. This is production-ready and unchanged.

### What's missing (Phase 2)
The ADR specifies a second selection dimension — capability scoring — that ranks tier-eligible models by task-type fit, not just cost. The data structures and scoring function are fully specced in ADR-004 but not implemented.

### Implementation

**`model-router.ts` additions:**

```typescript
// 7-dimension capability profiles, 0–100 normalized
const MODEL_CAPABILITY_PROFILES: Record<string, ModelCapabilities> = {
  "claude-opus-4-6":   { coding: 95, debugging: 90, research: 85, reasoning: 95, speed: 30, longContext: 80, instruction: 90 },
  "claude-sonnet-4-6": { coding: 85, debugging: 80, research: 75, reasoning: 80, speed: 60, longContext: 75, instruction: 85 },
  "claude-haiku-4-5":  { coding: 60, debugging: 50, research: 45, reasoning: 50, speed: 95, longContext: 50, instruction: 75 },
  "gpt-4o":            { coding: 80, debugging: 75, research: 70, reasoning: 75, speed: 65, longContext: 70, instruction: 80 },
  "gpt-4o-mini":       { coding: 55, debugging: 45, research: 40, reasoning: 45, speed: 90, longContext: 45, instruction: 70 },
  "gemini-2.5-pro":    { coding: 75, debugging: 70, research: 85, reasoning: 75, speed: 55, longContext: 90, instruction: 75 },
  "gemini-2.0-flash":  { coding: 50, debugging: 40, research: 50, reasoning: 40, speed: 95, longContext: 60, instruction: 65 },
  "deepseek-chat":     { coding: 75, debugging: 65, research: 55, reasoning: 70, speed: 70, longContext: 55, instruction: 65 },
  "o3":                { coding: 80, debugging: 85, research: 80, reasoning: 92, speed: 25, longContext: 70, instruction: 85 },
};

// Base requirement vectors by unit type
const BASE_REQUIREMENTS: Record<string, Partial<Record<keyof ModelCapabilities, number>>> = {
  "execute-task":       { coding: 0.9, instruction: 0.7, speed: 0.3 },
  "research-milestone": { research: 0.9, longContext: 0.7, reasoning: 0.5 },
  "research-slice":     { research: 0.9, longContext: 0.7, reasoning: 0.5 },
  "plan-milestone":     { reasoning: 0.9, coding: 0.5 },
  "plan-slice":         { reasoning: 0.9, coding: 0.5 },
  "replan-slice":       { reasoning: 0.9, debugging: 0.6, coding: 0.5 },
  "reassess-roadmap":   { reasoning: 0.9, research: 0.5 },
  "complete-slice":     { instruction: 0.8, speed: 0.7 },
  "run-uat":            { instruction: 0.7, speed: 0.8 },
  "discuss-milestone":  { reasoning: 0.6, instruction: 0.7 },
  "complete-milestone": { instruction: 0.8, reasoning: 0.5 },
};
```

`computeTaskRequirements(unitType, metadata?)` refines the base vector using existing `TaskMetadata` signals (tags, complexityKeywords, fileCount, estimatedLines). Exactly as specced in ADR-004 §"Dynamic Task Requirement Vectors".

`scoreModel(capabilities, requirements)` — weighted average of `capability[dim] * requirement[dim]` across all requirement dimensions, normalized by total weight. Tie-break: within 2 points, prefer cheaper model by `MODEL_COST_PER_1K_INPUT`; further tie-break by lexicographic model ID.

`resolveModelForComplexity()` gains a new step after tier filtering: if `capability_routing: true` AND >1 eligible model AND at least one eligible model has a profile, score all eligible models and select the winner. Models without profiles score 50 uniformly (capability scoring is a no-op for unknown models — falls back to cheapest-in-tier).

`RoutingDecision` gains:
```typescript
capabilityScores?: Record<string, number>;
taskRequirements?: Partial<Record<string, number>>;
selectionMethod: "tier-only" | "capability-scored";
```

Verbose routing output: `Dynamic routing [S]: claude-sonnet-4-6 (scored 82.3 — capability-scored)`

**`auto-model-selection.ts` addition:**

Emit `before_model_select` hook after `classifyUnitComplexity()` resolves tier, before `resolveModelForComplexity()` runs. Hook receives `{ unitType, unitId, classification, taskMetadata, eligibleModels, phaseConfig }`. Return `{ modelId }` to override, or `undefined` to proceed normally. This enables external capability routing extensions and is the extension-first rollout path specced in ADR-004.

**New preference key:**
```yaml
dynamic_routing:
  capability_routing: false   # default off, consistent with existing opt-in pattern
```

No existing routing behaviour changes unless `capability_routing: true` is set.

**Lint rule:** any model present in `MODEL_CAPABILITY_TIER` but absent from `MODEL_CAPABILITY_PROFILES` should produce a build warning.

---

## Change 2: S##-CONTEXT.md Injection Fix

### Problem
The discuss phase writes `M00x-CONTEXT.md` into the milestone directory (via the discuss prompt's artifact instructions). This file contains the full structured context for the milestone: requirements, constraints, acceptance criteria, open questions. No downstream prompt builder reads it. Plan and execute agents reinfer this context from scratch on every dispatch.

### Fix

New helper: `loadMilestoneContext(basePath: string, milestoneId: string): string | null`
- Resolves path: `{basePath}/.gsd/milestones/{milestoneId}/S{milestoneId}-CONTEXT.md` (and common variants)
- Returns file content truncated to 1500 tokens (~6000 chars) with graceful tail-truncation and a `[truncated]` marker if oversized
- Returns `null` if file doesn't exist (backward compatible — no-op for milestones without a discuss phase)

Inject point: the prompt builder sections for `plan-milestone`, `execute-task`, and `research-slice`. Injection format:

```
## Milestone Context (from discuss phase)
{content}
---
```

Injected as a read-only, non-editable section near the top of the agent prompt, before task-specific instructions. The 1500-token cap ensures it never dominates the prompt budget.

---

## Change 3: Phase Handoff Anchor

### Problem
Between phases, there is no compact structured record of what was decided, what was discovered, and what is blocked. Each new phase agent's only context is the full conversation history (pre-masking) and any CONTEXT.md from the discuss phase. Architectural decisions made during planning, blockers surfaced during execution, and unresolved questions accumulate as noise rather than structured signal.

### Design

New file: `phase-anchor.ts`

```typescript
interface PhaseAnchor {
  phase: string;           // "discuss" | "plan" | "execute-slice-N"
  milestoneId: string;
  generatedAt: string;     // ISO timestamp
  intent: string;          // 1–2 sentences: what this phase was doing
  decisions: string[];     // bullet list: key decisions made
  blockers: string[];      // bullet list: unresolved issues or risks
  nextSteps: string[];     // bullet list: what the next phase should know
}
```

**Write path** (`writePhaseAnchor`): Called at the end of discuss, plan, and each execute-slice completion. A short structured prompt (routed to light-tier — Haiku-class) summarises the phase's tool call history and assistant messages into the four anchor fields. Token budget for the anchor output: 300 tokens max. Written to `{basePath}/.gsd/milestones/{milestoneId}/anchors/{phase}.md`.

**Read path** (`readPhaseAnchor`): Called by the next phase's prompt builder. Reads the most recent relevant anchor(s). For example, `plan-milestone` reads the `discuss` anchor; `execute-task` reads the `plan` anchor and the previous slice's `execute` anchor if present.

**Injection format:**
```
## Handoff from {phase}
**Intent:** {intent}
**Decisions:** {decisions as bullets}
**Blockers:** {blockers as bullets}
**Next steps:** {nextSteps as bullets}
---
```

Total injection: ~300 tokens. Controlled and predictable — unlike injecting full conversation history.

**Failure mode**: If anchor generation fails (LLM error, timeout), log a warning and continue without injection. Anchors are enhancement, not a hard dependency. The anchor generation call uses a 30-second timeout and does not block the main phase dispatch.

---

## Change 4: Observation Masking

### Design

New file: `context-masker.ts`

```typescript
export function createObservationMask(keepRecentTurns: number = 8): TransformContextFn {
  return (messages: AgentMessage[]): AgentMessage[] => {
    const boundary = findTurnBoundary(messages, keepRecentTurns);
    return messages.map((m, i) => {
      if (i >= boundary) return m;
      if (m.type === "toolResult" || m.type === "bashExecution") {
        return { ...m, content: "[result masked — within summarized history]" };
      }
      return m;
    });
  };
}
```

`findTurnBoundary(messages, keepRecentTurns)`: walks backward from the end of `messages`, counts user-turn boundaries, returns the index of the message that is `keepRecentTurns` turns from the end. A "turn" is defined as a user message (or `bashExecution` that initiated an agent loop turn).

**What is never masked**: assistant messages (reasoning visible), user messages, compaction summaries, phase anchor injections.

**What is masked**: `toolResult` and `bashExecution` content older than `keepRecentTurns` turns. The message stays in history (ordering preserved, role preserved); only the content field is replaced. This means the LLM still sees that a tool was called and roughly when — it just doesn't re-read the full output.

**Registration**: `register-hooks.ts` adds:
```typescript
session.on("transformContext", createObservationMask(
  preferences.context_management?.observation_mask_turns ?? 8
));
```

**New preference keys:**
```yaml
context_management:
  observation_masking: true          # default on
  observation_mask_turns: 8          # turns to keep verbatim
```

Masking is on by default (unlike routing changes) because it has no accuracy cost and the JetBrains data is strong. Users can disable via `observation_masking: false`.

---

## Changes 5 & 6: Threshold Overrides

Both are single-value overrides passed when GSD configures the agent session, using existing extension configuration paths.

**Change 5 — Compaction threshold:**
Where GSD sets agent session options (the `before_agent_start` handler or session init), pass `compactionThresholdPercent: 0.70`. This overrides the default 91.5% trigger to 70% for all GSD-managed sessions. Fires compaction ~43K tokens earlier on a 200K window, before performance degrades and before drift compounds.

**Change 6 — Tool result truncation:**
Same location, pass `toolResultMaxChars: 800`. Tightens the existing per-tool-result char cap from 2000 to 800 for GSD sessions only. The truncation appends `[truncated — {originalLength} chars total]` so agents know output was cut. Applies at write time so context never accumulates oversized results between compactions.

Both values are surfaced as preferences for user override:
```yaml
context_management:
  compaction_threshold_percent: 0.70   # 0.0–1.0
  tool_result_max_chars: 800
```

---

## Data Flow After All Changes

```
Discuss phase completes
  → writePhaseAnchor("discuss")          [Change 3]
  → M00x-CONTEXT.md already written by discuss prompt

Plan phase starts
  → loadMilestoneContext() injected      [Change 2]
  → readPhaseAnchor("discuss") injected  [Change 3]
  → observation masker registered        [Change 4]
  → compactionThreshold=70%, toolResultMaxChars=800 active [Changes 5, 6]
  → model selected via capability scoring if enabled [Change 1]
  → plan runs with full context hygiene

Plan phase completes
  → writePhaseAnchor("plan")

Execute-slice-N starts
  → loadMilestoneContext() injected
  → readPhaseAnchor("plan") + readPhaseAnchor("execute-slice-N-1") injected
  → masker drops old tool results each turn
  → compaction fires at 70% if context grows large
  → model scored for execute-task requirements
```

---

## Testing Requirements

| Area | Coverage needed |
|------|----------------|
| `MODEL_CAPABILITY_PROFILES` completeness | lint: every model in `MODEL_CAPABILITY_TIER` must have a profile |
| `computeTaskRequirements()` | unit tests per unit type + metadata branch (docs tag, concurrency keyword, fileCount ≥6) |
| `scoreModel()` | unit: weighted average correctness, tie-break by cost, tie-break by ID |
| `resolveModelForComplexity()` with capability routing | integration: single eligible model (no-op), multiple with profiles, mixed with unknown model |
| `before_model_select` hook | extension can override; undefined return uses default |
| `loadMilestoneContext()` | file missing → null; file present → capped at 6000 chars; oversized → truncated with marker |
| `phase-anchor.ts` | write then read roundtrip; missing file → null; anchor generation failure → non-blocking |
| `createObservationMask()` | boundary detection at turn 8; toolResult masked; assistantMessage not masked; compaction summary not masked |
| Preference keys | validation for all new keys in `preferences-validation.ts` |
| Threshold overrides | session init passes correct values to agent config |

---

## Preferences Summary (all new keys)

```yaml
# Existing section, new key added
dynamic_routing:
  capability_routing: false

# New section
context_management:
  observation_masking: true
  observation_mask_turns: 8
  compaction_threshold_percent: 0.70
  tool_result_max_chars: 800
```

All new keys must be validated in `preferences-validation.ts` with range checks (`observation_mask_turns`: 1–50, `compaction_threshold_percent`: 0.5–0.95, `tool_result_max_chars`: 200–10000).

---

## Files Touched

| File | Change type |
|------|-------------|
| `model-router.ts` | Add profiles table, requirement vectors, `computeTaskRequirements()`, `scoreModel()`, update `resolveModelForComplexity()`, extend `RoutingDecision` |
| `auto-model-selection.ts` | Emit `before_model_select` hook, pass `taskMetadata` to classifier |
| `phase-anchor.ts` | New file |
| `context-masker.ts` | New file |
| `register-hooks.ts` | Register `transformContext` masker |
| `[session init path]` | Set `compactionThresholdPercent`, `toolResultMaxChars` |
| `[prompt builders]` | Inject `loadMilestoneContext()` and `readPhaseAnchor()` in plan/execute/research builders |
| `preferences-types.ts` | Add `capability_routing`, `context_management` block |
| `preferences-validation.ts` | Validate all new preference keys |
| `preferences-reference.md` | Document all new keys |
| Tests: `model-router.test.ts`, `auto-model-selection.test.ts` | New test cases per testing table |
| Tests: `phase-anchor.test.ts`, `context-masker.test.ts` | New test files |

---

## Out of Scope

- Changes to `packages/pi-coding-agent` or `packages/pi-agent-core`
- Drift detection / CDR framework (Option C — separate milestone)
- Cross-milestone CONTEXT.md carry-forward (Option C)
- Prompt caching (`cache_control`) — pi layer, documented in `docs/pi-context-optimization-opportunities.md`
- Dynamic tool set delivery — pi layer
