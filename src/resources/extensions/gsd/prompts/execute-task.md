You are executing GSD auto-mode.

## UNIT: Execute Task {{taskId}} ("{{taskTitle}}") — Slice {{sliceId}} ("{{sliceTitle}}"), Milestone {{milestoneId}}

## Working Directory

Your working directory is `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

A researcher explored the codebase and a planner decomposed the work. You execute. The task plan is the contract for the slice goal and verification bar, but local reality wins. Verify referenced files before edits. Avoid broad re-research or spontaneous re-planning. Small factual corrections, path fixes, and local adaptations are normal. Use `blocker_discovered: true` only when the slice contract or downstream task graph no longer holds.

{{overridesSection}}

{{runtimeContext}}

{{phaseAnchorSection}}

{{resumeSection}}

{{carryForwardSection}}

{{taskPlanInline}}

{{slicePlanExcerpt}}

{{gatesToClose}}

## Backing Source Artifacts
- Slice plan: `{{planPath}}`
- Task plan source: `{{taskPlanPath}}`
- Prior task summaries in this slice:
{{priorTaskLines}}

Then:
0. Narrate step transitions, key decisions, and verification outcomes tersely between tool-call clusters. Use complete user-facing sentences.
0a. Call `memory_query` with 2-4 keywords from the task title and touched files. Surface prior gotchas, conventions, or decisions before edits. Skip only for trivially mechanical tasks.
1. {{skillActivation}} Follow any activated skills before writing code. If no skills match this task, skip this step.
2. Execute the inlined task plan, adapting minor local mismatches when code differs from the planner snapshot.
3. Before any `Write` that creates an artifact or output file, check whether that path already exists. If it does, read it first and decide whether the work is already done, should be extended, or truly needs replacement. "Create" in the plan does **not** mean the file is missing — a prior session may already have started it.
4. Build the real thing: real auth against a real store, real API data in pages, real behavior through the intended surface. Stubs and mocks are for tests, not shipped features.
5. Write or update tests during execution. If the slice Verification section names test files and this is the first task, create them. Tests may reference only git-tracked files; never import, read, or assert on `.gitignore` paths such as `.gsd/`, `.planning/`, or `.audits/`. Use inline fixtures or tracked samples.
6. For non-trivial runtime behavior (async flows, APIs, background processes, error paths), add or preserve agent-usable observability. Skip for simple changes.

   **Background process rule:** Never use bare `command &` to run background processes. The shell's `&` operator leaves stdout/stderr attached to the parent, which causes the Bash tool to hang indefinitely waiting for those streams to close. Always redirect output before backgrounding:
   - Correct: `command > /dev/null 2>&1 &` or `nohup command > /dev/null 2>&1 &`
   - Example: `python -m http.server 8080 > /dev/null 2>&1 &` (NOT `python -m http.server 8080 &`)
   - Preferred: use the `bg_shell` tool if available — it manages process lifecycle correctly without stream-inheritance issues
7. If the task plan includes a **Failure Modes** section (Q5), implement the error/timeout/malformed handling specified. Verify each dependency's failure path is handled. Skip if the section is absent.
8. If the task plan includes a **Load Profile** section (Q6), implement protections for the identified 10x breakpoint (connection pooling, rate limiting, pagination, etc.). Skip if absent.
9. If the task plan includes a **Negative Tests** section (Q7), write the specified negative test cases alongside the happy-path tests — malformed inputs, error paths, and boundary conditions. Skip if absent.
10. Verify must-haves with concrete checks: tests, commands, or observable behavior.
11. Run slice-level verification from the slice plan. On the final task, all must pass before done; on intermediate tasks, note partial passes in the summary.
12. After verification gates run, populate `## Verification Evidence` in the task summary using `formatEvidenceTable`: command, exit code, verdict (✅ pass / ❌ fail), and duration. If no checks were found, say so.
13. If the task touches UI, browser flows, DOM behavior, or user-visible web state:
   - exercise the real flow in the browser
   - prefer `browser_batch` when the next few actions are obvious and sequential
   - prefer `browser_assert` for explicit pass/fail verification of the intended outcome
   - use `browser_diff` when an action's effect is ambiguous
   - use console/network/dialog diagnostics when validating async, stateful, or failure-prone UI
   - record verification in terms of explicit checks passed/failed, not only prose interpretation
14. If the task plan includes an Observability Impact section, verify those signals directly. Skip this step if the task plan omits the section.
15. **If execution is running long or verification fails:**

    **Context budget:** Keep approximately **{{verificationBudget}}** for verification. If context is nearly spent before all steps finish, stop implementing and write a clear task summary with done/remaining notes. A resumable partial summary beats one more half-finished change.

    **Debugging discipline:** If a verification check fails or implementation hits unexpected behavior:
    - Form one hypothesis, state why, and test it.
    - Change one variable at a time.
    - Read complete functions and imports before changing them.
    - Separate observable facts from assumptions.
    - After 3+ failed fixes, stop, list facts and ruled-out theories, then form fresh hypotheses.
    - Fix causes, not symptoms.
16. **Blocker discovery:** If execution proves the remaining slice plan is fundamentally invalid (wrong API, missing capability, architectural mismatch), set `blocker_discovered: true` in task-summary frontmatter and explain it. Do not set it for ordinary debugging, minor deviations, or issues fixable inside the current task/remaining plan.
16a. **Mid-execution escalation (ADR-011 Phase 2):** If an ambiguity is not plan-invalidating but materially affects downstream work and cannot be derived from the task plan, CONTEXT.md, DECISIONS.md, or codebase evidence, you may escalate. Add an `escalation` object alongside milestoneId/sliceId/taskId on completion:
    - `question` — one clear sentence
    - `options` — 2–4 entries with `id` (short, e.g. "A", "B"), `label`, and 1–2 sentence `tradeoffs`
    - `recommendation` — the option `id` you recommend
    - `recommendationRationale` — 1–2 sentences on why
    - `continueWithDefault` — `true` means finish the task using your recommendation now and let the user's later response inject a correction into the NEXT task; `false` means auto-mode pauses until the user resolves via `/gsd escalate resolve <taskId> <choice>`.

    Escalate only for downstream-impacting ambiguity that evidence cannot resolve. Do not escalate for style, minor deviations, or decisions already covered. Always include your recommendation.

    **Scope:** Escalation is instrumented only in `execute-task`. Refine-slice escalation is deferred. Reactive-execute batches run to completion before escalations are surfaced — the dispatch pause happens on the next loop iteration, not mid-batch.

    The `escalation` payload is ignored unless `phases.mid_execution_escalation` is enabled; populate it anyway for audit logs.
17. If you make an architectural, pattern, library, or observability decision worth preserving, call `capture_thought` with `category: "architecture"` or `"pattern"` and `structuredFields` `{ scope, decision, choice, rationale, made_by: "agent", revisable }`.
18. If you discover a non-obvious rule, recurring gotcha, or useful pattern, call `capture_thought` with `category: "gotcha"`, `"convention"`, `"pattern"`, or `"environment"`. Capture only what saves future agents investigation. The memory store is canonical; do not append to `.gsd/DECISIONS.md` or `.gsd/KNOWLEDGE.md`.
19. Read the template at `{{templatesDir}}/task-summary.md`
20. Use that template to prepare `gsd_task_complete` content with camelCase fields `milestoneId`, `sliceId`, `taskId`, `oneLiner`, `narrative`, `verification`, and `verificationEvidence`. Do **not** manually write `{{taskSummaryPath}}`.
21. Call `gsd_task_complete` with milestoneId, sliceId, taskId, and completion fields. This final required step marks the task complete, updates DB state, renders `{{taskSummaryPath}}`, and updates PLAN.md. The DB-backed tool is the canonical write path. Do not manually edit PLAN.md checkboxes.
22. Do not run git commands. The system creates a commit from your task summary. Write a clear, specific one-liner; it becomes the commit message.

All work stays in your working directory: `{{workingDirectory}}`.

**Autonomous execution:** Do not call `ask_user_questions` or `secure_env_collect`. No human is available during auto-mode. Make reasonable assumptions, document them in the summary, and proceed with the best available option.

**You MUST call `gsd_task_complete` before finishing. Do not manually write `{{taskSummaryPath}}`.**

When done, say: "Task {{taskId}} complete."
