You are executing GSD auto-mode.

## UNIT: Complete Milestone {{milestoneId}} ("{{milestoneTitle}}")

## Working Directory

Your working directory is `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

If any inlined plan, summary, verification command, or prior artifact names an absolute path outside `{{workingDirectory}}`, treat that path as stale context. Convert it to the equivalent relative path under `{{workingDirectory}}` before reading, writing, or executing. If no equivalent path exists under `{{workingDirectory}}`, record a verification failure and stop; do not edit or run commands in another checkout.

## Mission

All slices are complete. Verify the integrated work, persist milestone completion, refresh project state, and write the final record future milestones will rely on.

Preloaded context includes roadmap, requirements, decisions, project context, and compact slice-summary excerpts. Slice summaries are excerpts, not full files: use them first, then selectively read full SUMMARY.md files listed under "On-demand Slice Summaries" only when section headings indicate needed evidence for LEARNINGS, Decision Re-evaluation, deviations, limitations, or cross-slice narrative.

Start with what the excerpts give you. Read full files when the section heads signal richer context you need.

**On-demand Read ordering:** Complete all slice SUMMARY Reads you need for cross-slice synthesis, the Decision Re-evaluation table, and LEARNINGS **before** calling `gsd_complete_milestone` (step 12). Once that tool runs, the milestone is marked complete in the DB, so it must be the final persistent milestone-closeout write.

### Closeout Review Mode

The inlined context includes a validation status block.

- If it says a passing validation artifact is present, treat that artifact as authoritative for success criteria, requirement coverage, verification classes, and cross-slice integration. Do not delegate fresh reviewer/security/tester audits unless the validation artifact is internally inconsistent with the inlined summaries.
- If validation is missing, stale, non-pass, or internally inconsistent, use `subagent` for review work needing fresh context before drafting LEARNINGS: cross-slice integrations or new public APIs -> **reviewer**; auth, network, parsing, file IO, shell exec, or crypto -> **security**; significant tests added or changed -> **tester**.

Subagents report only; they do not write user source. Fold any findings into Decision Re-evaluation and LEARNINGS before completion.

{{inlinedContext}}

## Steps

1. **Duplicate completion guard:** Call `gsd_milestone_status` for `{{milestoneId}}` before any durable writes. If the returned milestone **status is `complete`**, this is a stale or duplicate closeout turn: do NOT mutate requirements, do NOT refresh the project document, do NOT write LEARNINGS, and do NOT persist milestone completion again. Say: "Milestone {{milestoneId}} is already complete." and stop.
2. Use the **Milestone Summary** output template from the inlined context above
3. {{skillActivation}}
4. **Verify code changes exist.** Compare milestone work against the integration branch (`main`, `master`, or recorded branch), using merge-base as older revision and `HEAD` as newer. If the diff lists non-`.gsd/` files, pass. If `HEAD` equals the integration branch/merge-base, treat it as a self-diff retry: inspect milestone-scoped commit evidence (`GSD-Unit: {{milestoneId}}` or production `GSD-Task: Sxx/Tyy` trailers touching `.gsd/milestones/{{milestoneId}}/`) and verify those commits touched non-`.gsd/` files. Record **verification failure** only when neither source shows implementation files.
5. Verify every **success criterion** from `{{roadmapPath}}`. If passing validation is present, summarize the validation evidence instead of re-auditing it; otherwise verify with evidence from summaries, tests, or observable behavior. Record unmet criteria as **verification failure**.
6. Verify **definition of done**: all slices `[x]`, summaries exist, and integrations work. If passing validation is present, trust its integration/verification verdict unless inconsistent with current artifacts. Record unmet items as **verification failure**.
7. If the roadmap includes a **Horizontal Checklist**, verify each item and note unchecked items in the summary.
8. Fill the **Decision Re-evaluation** table: compare each key `.gsd/DECISIONS.md` decision from this milestone with what shipped, and flag decisions to revisit.
9. Validate **requirement status transitions**. For each changed requirement, confirm evidence supports the new status. Requirements may move between Active, Validated, Deferred, Blocked, or Out of Scope only with proof.

**DB access safety:** Do NOT query `.gsd/gsd.db` directly via `sqlite3` or `node -e require('better-sqlite3')`; the engine owns the WAL connection. Use `gsd_milestone_status`, inlined context, or `gsd_*` tools; never direct SQL.

### Verification Gate — STOP if verification failed

**If ANY verification failure was recorded in steps 3, 4, or 5, you MUST follow the failure path below. Do NOT proceed with steps 9–13.**

**Failure path** (verification failed):
- Do NOT call `gsd_complete_milestone`.
- Do NOT update `.gsd/PROJECT.md` to reflect completion.
- Do NOT update `.gsd/REQUIREMENTS.md` to mark requirements validated.
- Write a clear failed-verification summary for the next attempt.
- Say: "Milestone {{milestoneId}} verification FAILED — not complete." and stop.

**Success path** (all verifications passed):

10. For each requirement whose status changed in step 9, call `gsd_requirement_update` with the requirement ID and updated `status` and `validation` fields — the tool regenerates `.gsd/REQUIREMENTS.md` automatically. Do this BEFORE completing the milestone so requirement updates are persisted.
11. Update `.gsd/PROJECT.md`: use the `write` tool with `path: ".gsd/PROJECT.md"` and `content` containing the full updated document reflecting milestone completion and current project state. Do NOT use the `edit` tool for this — PROJECT.md is a full-document refresh.
12. Extract structured learnings from this milestone and persist them to the GSD memory store. Follow the procedure block immediately below — it writes `{{milestoneId}}-LEARNINGS.md` as the audit trail and persists Patterns, Lessons, and Decisions via `capture_thought` (categories: pattern, gotcha/convention, architecture). The memory store is the single source of truth for cross-session durable knowledge (ADR-013).

{{extractLearningsSteps}}

13. **Persist completion through `gsd_complete_milestone`.** Call it with the parameters below. This must be the final persistent write in the unit. The tool updates the milestone status in the DB, renders `{{milestoneSummaryPath}}`, and validates all slices are complete.

   **Required parameters:**
   - `milestoneId` (string) — Milestone ID (e.g. M001)
   - `title` (string) — Milestone title
   - `oneLiner` (string) — One-sentence summary of what the milestone achieved
   - `narrative` (string) — Detailed narrative of what happened during the milestone
   - `successCriteriaResults` (string) — Markdown detailing how each success criterion was met or not met
   - `definitionOfDoneResults` (string) — Markdown detailing how each definition-of-done item was met
   - `requirementOutcomes` (string) — Markdown detailing requirement status transitions with evidence
   - `keyDecisions` (array of strings) — Key architectural/pattern decisions made during the milestone
   - `keyFiles` (array of strings) — Key files created or modified during the milestone
   - `lessonsLearned` (array of strings) — Lessons learned during the milestone
   - `verificationPassed` (boolean) — Must be `true`; confirms code-change verification, success criteria, and definition-of-done checks all passed

   **Optional parameters:**
   - `followUps` (string) — Follow-up items for future milestones
   - `deviations` (string) — Deviations from the original plan

14. Do not commit manually — the system auto-commits your changes after this unit completes.
- Say: "Milestone {{milestoneId}} complete."

**Important:** Do NOT skip code-change, success-criteria, or definition-of-done verification (steps 3-5). The summary must reflect verified outcomes. Verification failures block completion; there is no override. If a verification tool fails, errors, or returns unexpected output, treat it as failure.

**File system safety:** When scanning milestone directories for evidence, use `ls` or `find` first. Never pass a directory path (e.g. `tasks/`, `slices/`) to `read`; it only accepts file paths.
