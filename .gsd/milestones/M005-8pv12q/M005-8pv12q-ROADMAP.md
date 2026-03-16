# M005-8pv12q: Evidence-Grounded Pipeline

**Vision:** Give the pipeline the vocabulary and structure to distinguish what it knows from what it's guessing. Then add an independent fact-check service layer that verifies claims async and annotates artifacts with evidence.

## Two Parts

**Part 1 (M005-8pv12q): Prompt-level evidence discipline.** Research produces unknowns inventories. Plans consume them. Executors follow verification protocols. This is prompt-only — cheap, no runtime changes, immediately useful. Without the fact-checker, agents self-classify (imperfect but better than nothing).

**Part 2 (M005 — queued): Fact-check service layer.** Coordinator agent watches artifacts, spawns scouts per claim, writes annotation files, notifies orchestrator on REFUTED claims. This makes evidence discipline structural via independent verification. Trades cheap haiku tokens for expensive opus rework.

## Success Criteria

### M005-8pv12q (this milestone)
- Research output template has `## Unknowns Inventory` section
- Research prompts instruct researchers to flag verifiable claims with evidence basis
- Plan prompts instruct planners to read unknowns inventory and build resolution steps into tasks
- Execute-task prompt contains verification protocol (check evidence basis before acting)
- Execute-task prompt contains bug-fix protocol (reproduce → define success → apply → verify)
- Complete-slice prompt checks unknowns resolution status
- A task with many unknowns gets proportionally more resolution steps — same pipeline, longer list

### M005 (queued — fact-check service layer)
- Fact-check coordinator agent exists and watches artifacts for verifiable claims
- Fact-check scout agent exists, runs on haiku, verifies against primary sources
- Per-claim annotation files written with verdicts, evidence, citations
- Coordinator notifies orchestrator on REFUTED claims → triggers plan revision
- Planner reads annotation files alongside research
- Auto-mode integrates coordinator lifecycle

## Key Risks / Unknowns

- **Self-classification without fact-checker** — M005-8pv12q alone relies on agents self-classifying, which is imperfect. Acceptable as interim — strictly better than no classification. M005 adds structural enforcement.
- **Prompt bloat** — evidence discipline instructions add to every phase prompt. Mitigated: concise, structural.
- **Unknowns inventory on light research** — simple tasks don't need a 15-row table. Mitigated: empty inventory is valid ("None identified — implementation path grounded in observed patterns").

## Proof Strategy

- S01: Research template + prompts → unknowns inventory produced
- S02: Plan prompts → planner reads inventory, builds resolution steps
- S03: Execute prompt → verification protocol and bug-fix protocol work
- S04: Complete prompt + integration → unknowns resolution verified, end-to-end flow

## Verification Classes

- Contract: prompts contain evidence-discipline instructions
- Integration: unknowns flow from research → plan → execute → complete
- Operational: agent produces unknowns inventory and follows verification protocol

## Milestone Definition of Done

- Research output template has Unknowns Inventory section (claim, basis, affects, resolution, status)
- Research prompts: researcher flags implementation-affecting claims with evidence basis
- Plan prompts: planner reads unknowns inventory, adds resolution steps for unresolved items
- Execute-task prompt: verification protocol (name claim → check if observed → if not, verify first)
- Execute-task prompt: bug-fix protocol (reproduce → define success → apply → verify)
- Complete-slice prompt: unknowns resolution check
- Empty inventory valid for straightforward work
- No ceremony increase for tasks with no unknowns

## Requirement Coverage

- R060: Evidence classification in research → S01
- R061: Unknowns-driven planning → S02
- R062: Verification protocol in execution → S03
- R063: Resolution verification at completion → S04

## Slices

- [x] **S01: Research Phase — Unknowns Inventory** `risk:medium` `depends:[]`
  > After this: Research output template includes `## Unknowns Inventory` with columns (claim, basis, affects, resolution, status). Research prompts instruct the researcher to flag implementation-affecting claims. Training data recall explicitly classified. Empty table valid for straightforward work.

- [x] **S02: Plan Phase — Unknowns-Aware Planning** `risk:medium` `depends:[S01]`
  > After this: Plan prompts instruct the planner to read unknowns inventory. Unresolved items become resolution steps in task plans. Impact validation: resolved unknowns checked against existing assumptions.

- [x] **S03: Execute Phase — Verification Protocol** `risk:low` `depends:[S02]`
  > After this: Execute-task prompt contains verification protocol (name claim, check if observed, verify if not). Bug-fix protocol embedded (reproduce → define success → apply → verify). Task summaries report verification outcomes.

- [x] **S04: Complete Phase and Integration** `risk:low` `depends:[S03]`
  > After this: Complete-slice prompt checks unknowns resolution. End-to-end: research produces inventory, plan consumes it, executor follows protocol, completer verifies resolution.

## Boundary Map

### S01 → S02

Produces:
- Modified `templates/research.md` with `## Unknowns Inventory` section
- Modified `research-milestone.md` and `research-slice.md` prompts

Contract: Research doc contains Unknowns Inventory table. Planner reads it by section heading.

### S02 → S03

Produces:
- Modified `plan-milestone.md` and `plan-slice.md` prompts
- Task plans with resolution steps for unresolved unknowns

Contract: Unresolved unknowns appear as concrete resolution steps in task plans. Executor finds them as task steps.

### S03 → S04

Produces:
- Modified `execute-task.md` with verification protocol and bug-fix protocol
- Task summaries report verification outcomes

Contract: Executor verifies inferred claims before acting. Bug fixes follow 4-step protocol.

### S04 → (complete)

Produces:
- Modified `complete-slice.md` with unknowns resolution check
- End-to-end integration verification

Contract: Pipeline runs research → plan → execute → complete with unknowns flowing through.
