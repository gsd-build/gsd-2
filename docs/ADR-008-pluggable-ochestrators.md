**ADR-008: Minimal Pluggable Orchestrator Interface**

**Status:** Proposed  
**Date:** 2026-04-06  
**Deciders:** Mark Van de Vyver (with team input)  
**Related:** ADR-001 (Branchless Worktree Architecture), ADR-003 (Pipeline Simplification), ADR-004 (Capability-Aware Model Routing), ADR-007 (Model Catalog Split), the linked feature request  

## Context

GSD-2’s orchestration layer has been instrumental to the project’s success. The deliberate, imperative, file-driven design—centered on `.gsd/STATE.md` as single source of truth, fresh Pi sessions, git worktree isolation, verification gates, parallel slice handling, and robust recovery primitives—has delivered exceptional long-running autonomy, debuggability by both humans and agents, and production-grade reliability.  

These choices, as celebrated in ADR-001 (branchless worktree architecture), ADR-003 (pipeline simplification), ADR-004 (capability-aware model routing), and ADR-007 (model catalog split), have kept the core lean, transparent, and fully aligned with the principles in VISION.md: “Extension-first. If it can be an extension, it should be. Core stays lean.” and “Simplicity over abstraction. Every line earns its place.”

As the community and GSD itself explore increasingly sophisticated agent-driven workflows, a natural next step is to enable safe, low-risk experimentation with alternative orchestration strategies *without* touching or risking the proven legacy path.  

Currently there is no lightweight extension point at the root execution layer (the auto runner called from `cli.ts` and `headless.ts`). Any new orchestration approach would otherwise require either invasive core changes or duplicated logic—both of which would contradict the project’s emphasis on minimalism and extension-first design.

### Root Cause

The orchestration entry point directly wires the legacy loop with no factory or strategy pattern. This is not a flaw—the design delivered the robustness we rely on today—but it is the precise point that prevents safe experimentation today.

## Decision

We will introduce a *minimally invasive* pluggable orchestrator abstraction that fully preserves 100 % backward compatibility and requires **only one edit to a single existing core file**.

**Implementation (maximally minimal, aligned with CONTRIBUTING.md and VISION.md):**

- **New directory and files** (all additive, zero impact on existing code):  
  - `src/orchestrators/orchestrator.interface.ts` — defines a tiny `Orchestrator` interface with a single required method:  
    ```ts
    export interface Orchestrator {
      run(session: AutoSession, initialState: any): Promise<RunResult>;
    }
    ```

  - `src/orchestrators/orchestrator-factory.ts` — contains a simple registry/factory plus config resolver that re-uses the *existing* PREFERENCES.md + environment-variable pattern (identical to the RTK experimental guard).

- **LegacyOrchestrator.ts** (new) — thin, zero-behavior-change wrapper that calls today’s exact legacy logic.

- **Single minimal core change** (the *only* edit to any pre-existing GSD-2 file):  
  In the main auto entry point — the function inside the GSD extension / `gsd-orchestrator` package that is called from `cli.ts` and `headless.ts` (the `startAuto()` / auto runner) — replace the direct legacy call with a one-line factory lookup:  
  ```ts
  const config = getOrchestratorConfig(); // re-uses existing preference + env logic
  const orchestrator = createOrchestrator(config);
  await orchestrator.run(session, initialState);
  ```

All experimental orchestrators live in `src/orchestrators/` and are activated via `GSD_ORCHESTRATOR=experimental` (or `orchestrator.type: experimental` in PREFERENCES.md). The default remains `legacy`.

**What is NOT changing**  
- The legacy orchestration path remains byte-for-byte identical and is the production default.  
- No changes to `.gsd/STATE.md`, Pi sessions, git worktrees, verification gates, recovery primitives, or any other existing files beyond the one-line edit above.  
- No runtime overhead in the legacy path.  
- No new dependencies.

This change is deliberately smaller than the pipeline simplifications in ADR-003 and follows the same extension-first philosophy that has served the project so well.

## Consequences

**Positive**  
- Enables safe experimentation with new orchestration paradigms while the legacy path remains untouched and is the production default.  
- Aligns perfectly with VISION.md (“if it can be an extension, it should be”) and CONTRIBUTING.md requirements for architectural changes (RFC → ADR → minimal PR).  
- Future orchestrators (or community contributions) require no further core edits — just a one-line registry entry.  
- Preserves all existing strengths: disk-based state, crash recovery, agent transparency, and debuggability.  
- Positions GSD-2 for long-term evolution without technical debt or complexity creep.

**Negative / Trade-offs**  
- One additional (tiny) conditional in the main entry point (negligible runtime cost, fully tested).  
- New directory `src/orchestrators/` (consistent with the project’s clean modular layout).

**Risks & Mitigations**  
- None to existing users or deployments — flag defaults to legacy.  
- Full test coverage required for both paths before merge.

**ADR Register Update**  
This record will be appended to `docs/DECISIONS.md` (or referenced from `docs/README.md`) alongside ADR-001, ADR-003, ADR-004, and ADR-007.

**Next Steps**  
- Open short RFC issue (already prepared as the linked feature request).  
- Once approved, implement as a single focused PR limited to `src/orchestrators/` + the one-line core change.  
- Add corresponding entry in CHANGELOG.md under “Architecture”.

This ADR keeps GSD-2’s core philosophy intact while opening a clean, low-risk path for the next layer of orchestration capabilities — exactly the kind of thoughtful, minimal evolution the project has always championed.
