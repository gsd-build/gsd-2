# Reactive Task Execution — Parallel Dispatch

**Working directory:** `{{workingDirectory}}`
**Milestone:** {{milestoneId}} — {{milestoneTitle}}
**Slice:** {{sliceId}} — {{sliceTitle}}

## Mission

You are executing **multiple tasks in parallel** for this slice. The task graph below shows which tasks are ready for simultaneous execution based on their input/output dependencies.

**Critical rule:** Use the `subagent` tool in **parallel mode** to dispatch all ready tasks simultaneously. Each subagent gets a self-contained execute-task prompt. After all subagents return, verify each task's outputs and write summaries.

## Task Dependency Graph

{{graphContext}}

## Ready Tasks for Parallel Dispatch

{{readyTaskCount}} tasks are ready for parallel execution:

{{readyTaskList}}

## Execution Protocol

1. **Dispatch all ready tasks** using `subagent` in parallel mode. Each subagent prompt is provided below.
2. **Wait for all subagents** to complete.
3. **Verify each task's outputs** — check that expected files were created/modified and that verification commands pass.
4. **Write task summaries** for each completed task using the task-summary template.
5. **Mark completed tasks** as done in the slice plan (checkbox `[x]`).
6. **Commit** all changes with a clear message covering the parallel batch.

If any subagent fails:
- Write a summary for the failed task with `blocker_discovered: true`
- Continue marking the successful tasks as done
- The orchestrator will handle re-dispatch on the next iteration

## Subagent Prompts

{{subagentPrompts}}

{{inlinedTemplates}}
