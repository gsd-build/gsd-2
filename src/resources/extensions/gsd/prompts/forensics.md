Debug GSD itself. Trace the symptom to root cause in current source and produce a filing-ready GitHub issue with file:line references and a concrete fix suggestion.

## User's Problem

{{problemDescription}}

## Forensic Report

{{forensicData}}

## GSD Source Location

GSD extension source: `{{gsdSourceDir}}`

### Source Map by Domain

| Domain | Files |
|--------|-------|
| **Auto-mode engine** | `auto.ts` `auto-loop.ts` `auto-dispatch.ts` `auto-start.ts` `auto-supervisor.ts` `auto-timers.ts` `auto-timeout-recovery.ts` `auto-unit-closeout.ts` `auto-post-unit.ts` `auto-verification.ts` `auto-recovery.ts` `auto-worktree.ts` `auto-model-selection.ts` `auto-budget.ts` `dispatch-guard.ts` |
| **State & persistence** | `state.ts` `types.ts` `files.ts` `paths.ts` `json-persistence.ts` `atomic-write.ts` |
| **Forensics & recovery** | `forensics.ts` `session-forensics.ts` `crash-recovery.ts` `session-lock.ts` |
| **Metrics & telemetry** | `metrics.ts` `skill-telemetry.ts` `token-counter.ts` |
| **Health & diagnostics** | `doctor.ts` `doctor-types.ts` `doctor-checks.ts` `doctor-format.ts` `doctor-environment.ts` |
| **Prompts & context** | `prompt-loader.ts` `prompt-cache-optimizer.ts` `context-budget.ts` |
| **Git & worktrees** | `git-service.ts` `worktree.ts` `worktree-manager.ts` `git-self-heal.ts` |
| **Commands** | `commands.ts` `commands-inspect.ts` `commands-maintenance.ts` |

### Runtime Paths

```
.gsd/
├── PROJECT.md, REQUIREMENTS.md, DECISIONS.md, KNOWLEDGE.md, QUEUE.md, STATE.md, OVERRIDES.md, RUNTIME.md
├── auto.lock, metrics.json, completed-units.json, doctor-history.jsonl
├── activity/{seq}-{unitType}-{unitId}.jsonl
├── journal/YYYY-MM-DD.jsonl
├── runtime/paused-session.json, runtime/headless-context.md
├── debug/, forensics/, worktrees/{milestoneId}/
└── milestones/{ID}/{ID}-ROADMAP.md, {ID}-RESEARCH.md, {ID}-CONTEXT.md, {ID}-SUMMARY.md
    └── slices/{SID}/{SID}-PLAN.md, {SID}-RESEARCH.md, {SID}-UAT.md, {SID}-SUMMARY.md, tasks/{TID}-PLAN.md, tasks/{TID}-SUMMARY.md
```

### Activity Logs

- Filename: `{3-digit-seq}-{unitType}-{unitId}.jsonl`
- JSONL messages include assistant `content[]` text/tool calls and tool results with `toolCallId`, `toolName`, `isError`, `content`
- `usage` has input/output/cache/token/cost fields
- To trace failure: inspect the last activity log, find `isError: true`, and read preceding reasoning

### Journal Format (`.gsd/journal/`)

The journal is a structured event log for auto-mode iterations. Daily files contain JSONL:

```
{ ts: "ISO-8601", flowId: "UUID", seq: 0, eventType: "iteration-start", rule?: "rule-name", causedBy?: { flowId, seq }, data?: { unitId, status, ... } }
```

Key events: `iteration-start/end`, `dispatch-match/stop`, `unit-start/end`, `terminal`, `guard-block`, `stuck-detected`, `milestone-transition`, worktree events. `flowId` groups one loop; `causedBy` links causal events; `seq` orders events. Trace stuck loops with `stuck-detected` -> `flowId`; guard blocks with `guard-block` and `data.reason`.

### Crash Lock Format (`auto.lock`)

JSON with fields: `pid`, `startedAt`, `unitType`, `unitId`, `unitStartedAt`, `completedUnits`, `sessionFile`

A stale lock (dead PID) means the previous auto-mode session crashed mid-unit.

### Metrics Ledger Format (`metrics.json`)

```
{ version: 1, projectStartedAt: <ms>, units: [{ type, id, model, startedAt, finishedAt, tokens: { input, output, cacheRead, cacheWrite, total }, cost, toolCalls, assistantMessages, ... }] }
```

A unit dispatched more than once (`type/id` repeated) indicates a stuck loop: unit completed but artifact verification failed.

{{dedupSection}}

## Investigation Protocol

1. Start with the forensic report; treat anomalies as leads.
2. Check journal timeline if present. Use flow IDs to group dispatches, guards, stuck detection, transitions, and worktree operations.
3. Cross-reference activity logs (LLM actions) with journal events (auto-mode decisions).
4. Form hypotheses about the responsible module/code path using the source map.

5. Read actual source at `{{gsdSourceDir}}` to confirm or deny each hypothesis. Do not guess.

   **DB inspection:** Use `gsd_milestone_status`; never run `sqlite3 .gsd/gsd.db` or `node -e require('better-sqlite3')`. The engine owns the WAL connection; direct access can fail or return stale data.

6. Trace from entry point, usually `auto-loop.ts` or `auto-dispatch.ts`, to failure across files.

7. Identify file and line. Classify the defect: missing edge case, wrong logic/comparison, race/order issue, state corruption, or timeout/recovery failure.

8. Clarify only if needed. Use ask_user_questions (max 2) only when report + source are insufficient.

## Output

Explain findings:
- **What happened** — sequence from activity logs/anomalies
- **Why it happened** — root cause with `file:line`
- **Code snippet** — problematic code and intended behavior
- **Recovery** — immediate unstuck steps

Then **offer GitHub issue creation**: "Would you like me to create a GitHub issue for this on gsd-build/gsd-2?"

**CRITICAL:** The `github_issues` tool targets only the current user's repository and has no `repo` parameter. Use `gh issue create --repo gsd-build/gsd-2` via `bash`. Do NOT use the `github_issues` tool.

If yes, create using the `bash` tool:

```bash
ISSUE_BODY_FILE="${TMPDIR:-${TEMP:-${TMP:-.}}}/gsd-forensic-issue.md"
cat > "$ISSUE_BODY_FILE" << 'GSD_ISSUE_BODY'
## Problem
[1-2 sentence summary]

## Root Cause
[Specific file:line in GSD source, with code snippet showing the bug]

## Expected Behavior
[What the code should do instead — concrete fix suggestion]

## Environment
- GSD version: [from report]
- Model: [from report]
- Unit: [type/id that failed]

## Reproduction Context
[Phase, milestone, slice, what was happening when it failed]

## Forensic Evidence
[Key anomalies, error traces, relevant tool call sequences from the report]

---
*Auto-generated by `/gsd forensics`*
GSD_ISSUE_BODY

ISSUE_URL=$(gh issue create --repo gsd-build/gsd-2 \
  --title "..." \
  --label "auto-generated" \
  --body-file "$ISSUE_BODY_FILE")
rm -f "$ISSUE_BODY_FILE"

ISSUE_NUM=$(echo "$ISSUE_URL" | grep -oE '[0-9]+$')
ISSUE_ID=$(gh api graphql -f query='{ repository(owner:"gsd-build",name:"gsd-2") { issue(number:'"$ISSUE_NUM"') { id } } }' --jq '.data.repository.issue.id')
TYPE_ID=$(gh api graphql -f query='{ repository(owner:"gsd-build",name:"gsd-2") { issueTypes(first:20) { nodes { id name } } } }' --jq '.data.repository.issueTypes.nodes[] | select(.name=="Bug") | .id')
gh api graphql -f query='mutation { updateIssue(input:{id:"'"$ISSUE_ID"'",issueTypeId:"'"$TYPE_ID"'"}) { issue { number } } }'
```

### Redaction Rules (CRITICAL)

Before creating the issue, you MUST:
- Replace all absolute paths with relative paths
- Remove any API keys, tokens, or credentials
- Remove any environment variable values
- Do not include user project code — only GSD structure (tool names, file names, error messages)

## Report Saved

Remind the user that the full forensic report was saved locally; the notification includes the path.
