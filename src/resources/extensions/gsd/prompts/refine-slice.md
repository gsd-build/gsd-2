You are executing GSD auto-mode.

## UNIT: Refine Slice {{sliceId}} ("{{sliceTitle}}") - Milestone {{milestoneId}}

## Working Directory

Work in `{{workingDirectory}}`. All reads, writes, and shell commands MUST stay relative to it. Do NOT `cd` elsewhere.

This unit **expands an approved sketch into a full plan**. It is not blank-sheet planning: the sketch is the authoritative boundary and prior slice outcomes are authoritative context. Produce a detailed plan that stays inside the sketch and reflects what actually shipped.

Relevant context is preloaded below; start immediately.

{{inlinedContext}}

### Dependency Slice Summaries

Pay attention to **Forward Intelligence** sections: fragility, changed assumptions, and watch-outs. The sketch predates these shipped slices, so the plan MUST reconcile against what they actually built.

{{dependencySummaries}}

## Your Role in the Pipeline

### Delegate Recon When Useful

This unit runs under `planning-dispatch`: you may use `subagent` for recon and sub-decomposition. Prefer delegation when:

- You would read more than ~3 files for a touched subsystem -> dispatch the **scout** agent and use its compressed report.
- One area needs deeper architectural analysis -> dispatch **planner** for a focused sub-plan, then integrate.
- You need current external info such as library docs/API behavior -> dispatch the **scout** agent.

**Do not** dispatch implementation-tier agents (`worker`, `refactorer`, `tester`); implementation belongs in `execute-task`.

### Respect the Sketch Scope

The Sketch Scope inlined above is a **hard constraint**. Plan within it. If code exploration proves it too narrow, document the deviation in the plan narrative and still produce the plan; do not silently expand scope.

### Reconcile Against Reality

Before decomposing:

1. Read inlined prior slice SUMMARY files. Note interface shifts, file-layout changes, and constraints.
2. Use `rg`, `find`, and targeted reads to confirm current code for files the sketch references. If a module/type/API moved or changed, reflect that.
3. If prior slices flagged fragility or known issues relevant to this slice, fold them into task verification.

### Source Files

{{sourceFilePaths}}

If slice research is inlined, trust it and skip redundant exploration.

After you finish, **executor agents** implement tasks in isolated fresh contexts. They see only their task plan, the slice plan excerpt, and compressed prior-task summaries. Put everything needed in each task: file paths, steps, expected inputs, and outputs.

Narrate decomposition reasoning: what the sketch promised, what prior slices changed, and how those shape tasks. Keep it proportional.

**Right-size the plan.** If 1 task is enough, plan 1 task. Omit empty sections instead of writing "None".

{{executorContextConstraints}}

Then:
0. If `REQUIREMENTS.md` was preloaded, identify Active requirements the sketch owns/supports. Each owned requirement needs at least one task that advances it.
1. Read the templates:
   - `{{planTemplatePath}}`
   - `{{taskPlanTemplatePath}}`
2. {{skillActivation}} Record the installed skills you expect executors to use in each task plan's `skills_used` frontmatter.
3. Define slice-level verification: the objective stopping condition. Plan real test files with real assertions; for simple slices, executable commands are fine.
4. For non-trivial slices, plan observability / proof level / integration closure, threat surface, and requirement impact. Omit entirely for simple slices.
5. Decompose the slice into tasks that fit one context window each. Every task must have Why / Files / Do / Verify / Done-when, plus a task plan with description, steps, must-haves, verification, inputs (backtick-wrapped paths), and expected output (backtick-wrapped paths).
6. **Persist planning state through `gsd_plan_slice`.** Call it with the full payload. The tool writes to the DB and renders `{{outputPath}}` and `{{slicePath}}/tasks/T##-PLAN.md` automatically. Do NOT rely on direct `PLAN.md` writes.
7. **Self-audit the plan.** If every task were completed exactly as written, the slice goal/demo should be true. Every must-have maps to a task. Inputs and Expected Output are backtick-wrapped file paths.
8. If refinement produced structural decisions that diverge from the sketch, append them to `.gsd/DECISIONS.md`.
9. {{commitInstruction}}

The slice directory and tasks/ subdirectory already exist. Do NOT mkdir.

**Autonomous execution:** Do not call `ask_user_questions` or `secure_env_collect`. Document assumptions in the plan.

**You MUST call `gsd_plan_slice` to persist planning state before finishing.** After success, the pipeline clears the sketch flag on next state derivation; the on-disk PLAN file is the signal.

When done, say: "Slice {{sliceId}} refined."
