You are executing GSD auto-mode.

## UNIT: Plan Slice {{sliceId}} ("{{sliceTitle}}") — Milestone {{milestoneId}}

## Working Directory

Your working directory is `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

All relevant context is preloaded below. Start immediately without re-reading these files.

{{inlinedContext}}

### Dependency Slice Summaries

Pay particular attention to **Forward Intelligence** sections: fragile areas, changed assumptions, and things this slice should watch.

{{dependencySummaries}}

## Mission

Plan this slice against real code, then persist the plan through the DB-backed tool.

### Delegate Recon and Sub-Decomposition When Useful

This unit runs under `planning-dispatch`: use `subagent` when isolated context improves planning.

- More than ~3 files for a subsystem -> dispatch **scout** and use its compressed report.
- Slice spans subsystems and decomposition is unclear -> dispatch **planner** or use **decompose-into-slices** on the focused area, then integrate.
- Current external facts are needed -> dispatch the **scout** agent.

**Do not** dispatch implementation-tier agents (`worker`, `refactorer`, `tester`); they would write source and bypass this unit. Implementation belongs in `execute-task`.

### Verify Roadmap Assumptions (JIT Reassessment — ADR-003 §4)

Before planning, verify roadmap assumptions against prior slice summaries and dependency findings.

**If the remaining roadmap needs adjustment, modify it before proceeding:**

- Wrong downstream title/demo/dependencies: call `gsd_reassess_roadmap` with `sliceChanges.modified`.
- New work deserves its own slice: use `sliceChanges.added`.
- Downstream slice is redundant or out of scope: use `sliceChanges.removed`.
- **Bias toward "roadmap is fine."** Adjust only with concrete evidence, not speculative concern.

Completed slices are immutable: never modify or remove complete slices.

Then plan this slice against the possibly updated roadmap. The roadmap description may be stale; verify it against current code.

### Source Files

{{sourceFilePaths}}

If slice research exists inlined above, trust it and skip redundant exploration.

Explore enough relevant code to confirm what exists, what changes, and boundaries. Executors later receive only their task plan, slice plan excerpt, and prior task summaries; put every needed path, step, input, and output in the task plan.

Narrate decomposition reasoning proportionally: grouping, ordering risks, and verification strategy.

**Right-size the plan.** Use 1 task for simple slices. Do not split cosmetic sub-steps. Omit inapplicable sections instead of filling "None."

{{executorContextConstraints}}

Then:
0. If `REQUIREMENTS.md` is preloaded, identify Active requirements this slice owns/supports. Owned requirements need task coverage plus verification. Supporting requirements are compatibility constraints; do not pull later primary work into this slice unless assigned.
0a. Call `memory_query` with keywords from the slice title and source files. Use prior decisions, conventions, and gotchas to inform decomposition.
1. Read the templates:
   - `{{planTemplatePath}}`
   - `{{taskPlanTemplatePath}}`
2. {{skillActivation}} Record expected executor skills in each task plan's `skills_used` frontmatter.
3. Define slice-level verification:
   - Non-trivial slices need real test files with assertions; name them.
   - Simple slices can use executable commands or script assertions.
   - If no test framework exists in a non-trivial project, make setup the first task.
   - Boundary contracts need contract-exercising verification.
   - Planned tests may only read/import git-tracked paths. Do NOT plan tests using ignored paths such as `.gsd/`, `.planning/`, or `.audits/`; use inline fixtures or tracked samples.
4. For non-trivial slices, plan observability, proof level, and integration closure. Use `Observability / Diagnostics` when failure diagnosis matters. State proof truthfully; do not present fixture/contract-only proof as live integration. Omit for simple slices.
5. For non-trivial slices, fill quality gates:
   - **Threat Surface (Q3):** abuse, data exposure, and input trust boundaries. Required for user input, auth, authorization, or sensitive data; omit for simple/internal refactors.
   - **Requirement Impact (Q4):** requirements touched, what to re-verify, and decisions to reconsider. Omit if none.
   - For non-trivial tasks with dependencies, shared resources, or input handling, fill Failure Modes (Q5), Load Profile (Q6), and Negative Tests (Q7). Omit for simple tasks.
6. Decompose into tasks, each fitting one context window. Each task needs:
   - a concrete action title
   - inline task entry fields from the plan.md template: Why / Files / Do / Verify / Done when
   - a matching task plan file with description, steps, must-haves, verification, inputs, and expected output
   - **Inputs and Expected Output must list concrete backtick-wrapped file paths** (e.g. `` `src/types.ts` ``). These are machine-parsed for dependencies; vague prose breaks parallel execution. Every task must have at least one output file path.
   - Observability Impact section **only if the task touches runtime boundaries, async flows, or error paths** — omit it otherwise
7. **Persist planning state through `gsd_plan_slice`.** Call it with `goal`, `successCriteria`, optional `proofLevel`, optional `integrationClosure`, optional `observabilityImpact`, and `tasks`. Keep task description first paragraphs concise. `gsd_plan_slice` handles task persistence, writes DB state transactionally, and renders `{{outputPath}}` plus `{{slicePath}}/tasks/T##-PLAN.md`. Do **not** call `gsd_plan_task` separately. Do **not** rely on direct `PLAN.md` writes as the source of truth; the DB-backed tool is the canonical write path.
8. **Self-audit before finishing.** Fix any failure:
    - Completion semantics: completed tasks make the slice goal/demo true.
    - Requirement coverage: every must-have and owned Active requirement maps to task verification.
    - Decisions honored: locked decisions are respected, not silently re-litigated.
    - Task completeness: steps, must-haves, verification, inputs, and expected output are concrete; paths are backtick-wrapped.
    - Dependency correctness: no task depends on later work.
    - Key links planned: connected artifacts have explicit wiring steps.
    - Scope sanity: target 2-5 steps and 3-8 files per task; split 10+ steps or 12+ files.
    - Proof truthfulness: fixture/contract proof is not described as live integration.
    - Feature completeness: tasks produce real progress, not only scaffolding.
    - Quality gates: non-trivial slices/tasks include specific Q3-Q7 coverage where applicable.
10. If planning produced structural decisions, append them to `.gsd/DECISIONS.md`
11. {{commitInstruction}}

The slice directory and tasks/ subdirectory already exist. Do NOT mkdir. All work stays in `{{workingDirectory}}`.

**Autonomous execution:** Do not call `ask_user_questions` or `secure_env_collect`. No human is available during auto-mode. Make reasonable assumptions, document them, and call `gsd_plan_slice` with the best available plan.

**You MUST call `gsd_plan_slice` to persist the planning state before finishing.**

When done, say: "Slice {{sliceId}} planned."
