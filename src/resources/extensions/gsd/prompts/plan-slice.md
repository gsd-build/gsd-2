You are executing GSD auto-mode.

## UNIT: Plan Slice {{sliceId}} ("{{sliceTitle}}") — Milestone {{milestoneId}}

## Working Directory

Work only in `{{workingDirectory}}`. Do not `cd` elsewhere. Relevant context is preloaded; start without re-reading it.

{{inlinedContext}}

### Dependency Slice Summaries

Use Forward Intelligence from dependencies when present.

{{dependencySummaries}}

## Mission

Plan this slice against real code and persist it through the DB-backed tool.

Use `subagent` only under `planning-dispatch` for isolated planning reconnaissance: broad subsystem scouting, unclear decomposition, or current external facts. For external research, dispatch the **scout** agent. Do not dispatch implementation agents.

Before planning, validate roadmap assumptions against code and dependency summaries. If concrete evidence shows downstream slices are wrong, call `gsd_reassess_roadmap` with `sliceChanges.modified`, `sliceChanges.added`, or `sliceChanges.removed`; otherwise keep the roadmap unchanged. Bias toward "roadmap is fine." Completed slices are immutable.

### Source Files

{{sourceFilePaths}}

If slice research is inlined, trust it. Explore enough code to confirm paths, boundaries, and verification. Executors later get only task plans, slice excerpt, and prior summaries, so put required paths, steps, inputs, and outputs in task plans.

{{executorContextConstraints}}

## Planning Rules

1. If requirements are preloaded, identify owned and supporting Active requirements.
2. Call `memory_query` with keywords from the slice title and source files.
3. Read `{{planTemplatePath}}` and `{{taskPlanTemplatePath}}`.
4. {{skillActivation}} Record expected executor skills in each task plan's `skills_used` frontmatter.
5. Define slice verification before tasks. Non-trivial slices need real tests or executable assertions; boundary contracts need contract-exercising checks. Tests must not read .gitignore/gitignored paths such as `.gsd/`, `.planning/`, or `.audits/`.
6. Include Threat Surface (Q3), Requirement Impact (Q4), proof level, observability, integration closure, Failure Modes (Q5), Load Profile (Q6), and Negative Tests (Q7) only where applicable.
7. Right-size tasks. Simple slices can be one task; split only when context, ownership, or verification boundaries justify it.
8. Each task needs a concrete title, Why / Files / Do / Verify / Done when, plus task-plan description, steps, must-haves, verification, inputs, and expected output. Inputs and Expected Output must include concrete backtick-wrapped paths. Use paths relative to `{{workingDirectory}}`; do not put absolute paths to the original checkout or any directory outside `{{workingDirectory}}` in `files`, `inputs`, `expectedOutput`, or verification commands. **`expected_output` must only list files the task actually creates or overwrites on disk.** Do NOT include files the task merely reads, verifies, or tests — those belong only in `inputs`. If a task is a pure verification or test task that produces no new files, its `expected_output` may be empty or limited to test-result artifacts (e.g. a log or assertion output). A file that does not yet exist on disk and is needed as an `input` must be produced by an earlier task's `expected_output` — if no prior task creates it, add a task before this one that does.
9. Persist with `gsd_plan_slice` using goal, successCriteria, optional proofLevel/integrationClosure/observabilityImpact, and tasks. `gsd_plan_slice` handles task persistence transactionally and renders `{{outputPath}}` plus task plans; do not call `gsd_plan_task`. The DB-backed tool is the canonical write path. Do **not** rely on direct `PLAN.md` writes as the source of truth.
10. Self-audit before finishing: goal/demo closure, requirement coverage, locked decisions, concrete paths, dependency order, wiring, scope size, proof truthfulness, feature completeness, and quality gates. Quality gates: non-trivial slices/tasks include specific Q3-Q7 coverage where applicable.
11. If planning creates structural decisions, append them to `.gsd/DECISIONS.md`.
12. {{commitInstruction}}

The slice directory already exists. Do not mkdir.

**Autonomous execution:** no human is available. Do not call `ask_user_questions` or `secure_env_collect`; make reasonable assumptions and document them.

**You MUST call `gsd_plan_slice` to persist planning state before finishing.**

When done, say: "Slice {{sliceId}} planned."
