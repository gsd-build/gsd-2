# Plan: GSD Phase Guard for Subagents

## Problem
The `planner` subagent and GSD's built-in `plan-milestone`/`plan-slice` phases are both
available to the LLM simultaneously. Nothing prevents the LLM from calling
`subagent planner` when GSD auto-mode is running its own planning phase, bypassing
GSD's state machine, artifact system, and verification gates.

## Solution: Two-layer protection

### Layer 1: Shared GSD phase state module (`shared/gsd-phase-state.ts`)
A lightweight module that GSD auto.ts writes to and subagent/index.ts reads from.
No circular dependency — both import from `shared/`.

Exports:
- `setActiveGSDPhase(unitType: string | null): void`
- `getActiveGSDPhase(): string | null`
- `isGSDAutoActive(): boolean`

### Layer 2: Agent conflict map + filtering in subagent tool

Add optional `conflicts_with` field to agent frontmatter:
```yaml
---
name: planner
conflicts_with: plan-milestone, plan-slice, plan-task
---
```

In `subagent/index.ts` execute(), before spawning:
1. Read active GSD phase from shared state
2. If active, filter out agents whose `conflicts_with` includes the current phase
3. Return a clear error message explaining why the agent was blocked

### Files to modify:
1. **`src/resources/extensions/shared/gsd-phase-state.ts`** — NEW: shared state module
2. **`src/resources/extensions/subagent/agents.ts`** — Parse `conflicts_with` from frontmatter
3. **`src/resources/extensions/subagent/index.ts`** — Check phase conflicts before spawning
4. **`src/resources/extensions/gsd/auto.ts`** — Set/clear active phase via shared state
5. **`src/resources/agents/planner.md`** — Add `conflicts_with` field
6. **Tests** for the guard logic

### Design decisions:
- Using a simple module-level variable (not file-based) since both extensions
  run in the same process
- `conflicts_with` is opt-in per agent — only agents that overlap GSD phases need it
- The guard only blocks during GSD auto-mode, not manual `/gsd` usage
- Clear error message tells the LLM to use the GSD phase instead
