You are executing GSD auto-mode.

## UNIT: Plan Slice {{sliceId}} ("{{sliceTitle}}") — Milestone {{milestoneId}}

## Working Directory

Your working directory is `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

All relevant context has been preloaded below — start working immediately without re-reading these files.

{{inlinedContext}}

### Dependency Slice Summaries

Pay particular attention to **Forward Intelligence** sections — they contain hard-won knowledge about what's fragile, what assumptions changed, and what this slice should watch out for.

{{dependencySummaries}}

## Your Role in the Pipeline

You have full tool access. Before decomposing, explore relevant code so the plan reflects reality.

### Delegate Recon and Sub-Decomposition When Useful

This unit runs under `planning-dispatch`: use `subagent` when isolated context improves planning.

- More than ~3 files are needed for a subsystem → dispatch the **scout** agent and use its compressed report.
- The slice spans subsystems and decomposition is unclear → dispatch **planner** or use **decompose-into-slices** on a focused area, then integrate.
- Current external facts are needed → dispatch the **scout** agent.

**Do not** dispatch implementation-tier agents (`worker`, `refactorer`, `tester`) from this unit — they would write user source and bypass this unit's write isolation. Implementation belongs in `execute-task`.

### Verify Roadmap Assumptions (JIT Reassessment — ADR-003 §4)

Before planning, verify roadmap assumptions against prior slice summaries and dependency findings.

**If the remaining roadmap needs adjustment, modify it before proceeding:**

- If a downstream slice's title/demo/dependencies are now wrong, call `gsd_reassess_roadmap` with the corrected `sliceChanges.modified` entry.
- If new work surfaced that deserves its own slice, add it via `sliceChanges.added`.
- If a downstream slice is now redundant or out of scope, remove it via `sliceChanges.removed`.
- **Bias toward "roadmap is fine."** Adjust only with concrete evidence, not speculative concern.

Completed slices are immutable: never modify or remove a slice whose status is complete.

Then proceed with planning this slice against the (possibly updated) roadmap.

The roadmap description may be stale — verify it against the current codebase state.

### Explore Slice Scope

Read relevant code. Confirm what exists, what changes, and what boundaries apply. Use `rg`, `find`, and targeted reads.

### Source Files

{{sourceFilePaths}}

If slice research exists (inlined above), trust those findings and skip redundant exploration.

Executors later receive only their task plan, the slice plan excerpt, and prior task summaries. They do not see research docs, roadmap, or REQUIREMENTS.md. Put every needed file path, step, input, and output in the task plan itself.

Narrate decomposition reasoning proportionally: grouping, ordering risks, and verification strategy in complete sentences.

**Right-size the plan.** Use 1 task for simple slices. Do not split for cosmetic sub-steps. Omit inapplicable sections instead of filling "None." The plan guides execution; it does not fill a template.

{{executorContextConstraints}}

Then:
0. If `REQUIREMENTS.md` is preloaded, identify Active requirements this slice owns/supports. Owned requirements are acceptance criteria and need task coverage plus verification. Supporting requirements are compatibility constraints; do not pull later primary work into this slice unless assigned.
0a. Call `memory_query` with keywords from the slice title and source files. Use prior decisions, conventions, and gotchas to inform decomposition.
1. Read the templates:
   - `{{templatesDir}}/plan.md`
   - `{{templatesDir}}/task-plan.md`
2. {{skillActivation}} Record the installed skills you expect executors to use in each task plan's `skills_used` frontmatter.
3. Define slice-level verification:
   - For non-trivial slices: plan actual test files with real assertions. Name the files.
   - For simple slices: executable commands or script assertions are fine.
   - If the project is non-trivial and has no test framework, the first task should set one up.
   - If this slice establishes a boundary contract, verification must exercise that contract.
   - Planned test files must only read from or import paths that are tracked in git. Do NOT plan tests whose inputs or fixtures are paths listed in `.gitignore` (e.g. `.gsd/`, `.planning/`, `.audits/`). If the scenario seems to require such a file, plan an inline fixture or a tracked sample instead.
4. For non-trivial slices, plan observability, proof level, and integration closure. Use `Observability / Diagnostics` when failure diagnosis matters. State proof truthfully; do not present fixture/contract-only proof as live integration. Omit these sections for simple slices.
5. For non-trivial slices, fill quality gates:
   - **Threat Surface (Q3):** abuse, data exposure, and input trust boundaries. Required for user input, auth, authorization, or sensitive data; omit for simple/internal refactors.
   - **Requirement Impact (Q4):** requirements touched, what to re-verify, and decisions to reconsider. Omit if none.
   - For non-trivial tasks with dependencies, shared resources, or input handling, fill Failure Modes (Q5), Load Profile (Q6), and Negative Tests (Q7). Omit for simple tasks.
6. Decompose the slice into tasks, each fitting one context window. Each task needs:
   - a concrete, action-oriented title
   - the inline task entry fields defined in the plan.md template (Why / Files / Do / Verify / Done when)
   - a matching task plan file with description, steps, must-haves, verification, inputs, and expected output
   - **Inputs and Expected Output must list concrete backtick-wrapped file paths** (e.g. `` `src/types.ts` ``). These are machine-parsed to derive task dependencies — vague prose without paths breaks parallel execution. Every task must have at least one output file path.
   - Observability Impact section **only if the task touches runtime boundaries, async flows, or error paths** — omit it otherwise
7. **Persist planning state through `gsd_plan_slice`.** Call it with `goal`, `successCriteria`, optional `proofLevel`, optional `integrationClosure`, optional `observabilityImpact`, and `tasks`. Keep task description first paragraphs concise. `gsd_plan_slice` handles task persistence transactionally, writes DB state, and renders `{{outputPath}}` plus `{{slicePath}}/tasks/T##-PLAN.md`. Do **not** call `gsd_plan_task` separately. Do **not** rely on direct `PLAN.md` writes as the source of truth; the DB-backed tool is the canonical write path.
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

The slice directory and tasks/ subdirectory already exist. Do NOT mkdir. All work stays in your working directory: `{{workingDirectory}}`.

**Autonomous execution:** Do not call `ask_user_questions` or `secure_env_collect`. No human is available during auto-mode. Make reasonable assumptions, document them, and call `gsd_plan_slice` with the best available plan.

**You MUST call `gsd_plan_slice` to persist the planning state before finishing.**

When done, say: "Slice {{sliceId}} planned."
