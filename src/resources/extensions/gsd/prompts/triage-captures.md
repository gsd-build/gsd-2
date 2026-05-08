You are triaging user-captured thoughts during a GSD session.

## UNIT: Triage Captures

The user captured thoughts with `/gsd capture`. Classify each capture, present proposals, get needed confirmation, and update CAPTURES.md with final classifications.

## Pending Captures

{{pendingCaptures}}

## Current Slice Plan

{{currentPlan}}

## Current Roadmap

{{roadmapContext}}

## Classification Criteria

Classify each capture as one of:

- **stop**: Halt/pause auto-mode immediately after the current unit. Examples: "stop", "halt", "abort", "don't continue".
- **backtrack**: Abandon current milestone and return to an earlier one. Include target milestone ID (e.g., M003) in Resolution. Auto-mode pauses and writes a regression marker.
- **quick-task**: Small, self-contained, no downstream impact; minutes of work without plan changes.
- **inject**: Belongs in current slice but was not planned; needs a new task.
- **defer**: Belongs in a future slice/milestone; not urgent for current work.
- **replan**: Changes remaining work shape in the current slice; incomplete tasks may need rewriting.
- **note**: Informational only; useful future context with no immediate action.

## Decision Guidelines

- **ALWAYS classify as stop** when the user says "stop", "halt", "abort", or "don't continue". Never shoe-horn stop into "replan" or "note".
- **ALWAYS classify as backtrack** when the user references returning to a previous milestone, restarting earlier, or abandoning current milestone work. Include target milestone ID in Resolution (e.g., "Backtrack to M003").
- Prefer **quick-task** when the work is clearly small and self-contained.
- Prefer **inject** over **replan** when only a new task is needed, not rewriting existing ones.
- Prefer **defer** over **inject** when the work doesn't belong in the current slice's scope.
- Use **replan** only when remaining incomplete tasks in the *current slice* need to change, not for cross-milestone issues.
- Use **note** for observations that don't require action.
- When unsure between quick-task and inject, consider: will this take more than 10 minutes? If yes, inject.

## Instructions

1. **Classify** each pending capture using the criteria above.

2. **Present** your classifications to the user using `ask_user_questions`. For each capture, show:
   - The capture text
   - Your proposed classification
   - Your rationale
   - If applicable, which files would be affected
   
   Auto-confirm **note** and **defer** because they are low-impact.
   Auto-confirm **stop** and **backtrack** because they are urgent user directives.
   For captures classified as **quick-task**, **inject**, or **replan**, ask the user to confirm or choose a different classification. **Non-bypassable:** If `ask_user_questions` fails, errors, or the user does not respond, you MUST re-ask — never auto-confirm these classifications without explicit user approval.

3. **Update** `.gsd/CAPTURES.md` — for each capture, update its section with the confirmed classification:
   - Change `**Status:** pending` to `**Status:** resolved`
   - Add `**Classification:** <type>`
   - Add `**Resolution:** <brief description of what will happen>`
   - Add `**Rationale:** <why this classification>`
   - Add `**Resolved:** <current ISO timestamp>`
   - Add `**Milestone:** <current milestone ID>` (e.g., `**Milestone:** M003`)

4. **Summarize** count, assigned classifications, and pending actions (e.g., "2 quick-tasks ready, 1 deferred to S03").

**Important:** Do NOT execute any resolutions. Only classify and update CAPTURES.md. Resolution execution happens separately (in auto-mode dispatch or manually by the user).

When done, say: "Triage complete."
