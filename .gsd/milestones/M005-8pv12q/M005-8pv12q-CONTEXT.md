# M005-8pv12q: Evidence-Grounded Pipeline

**Gathered:** 2026-03-15
**Revised:** 2026-03-16
**Status:** Ready for planning

## Project Description

Two-part change to GSD's pipeline:

1. **Evidence discipline in prompts** — Research produces unknowns inventories. Plans expose speculation as structured data. Executors follow verification protocols. This is cheap, prompt-only, and gives the pipeline the vocabulary to talk about what it knows vs what it's guessing.

2. **Fact-check service layer** — A coordinator agent watches pipeline artifacts, identifies claims needing verification, spawns lightweight scouts to verify against primary sources, writes per-claim annotation files, and notifies the orchestrator when claims are refuted so the planner can adjust. This is the structural enforcement that makes evidence discipline reliable.

Part 1 without Part 2: the system is as good or bad as it currently is, but with better-structured speculation. Agents self-classify, which violates [ARL Principle 3](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/autonomous-loop-principles.md#principle-3-ai-cannot-reliably-self-evaluate).

Part 2 without Part 1: the fact-checker has nothing to work with — no structured unknowns to verify.

Together: structured unknowns get independently verified async. Planning runs on opus with verified data instead of wasting expensive tokens reasoning about false assumptions. Cheaper than reworking after the fact.

## Theoretical Basis

### The Cost Model

| Without fact-checking | With fact-checking |
|---|---|
| Researcher recalls `actions/checkout@v4` | Researcher flags it as training-data |
| Planner builds CI workflow around v4 (opus tokens) | Scout checks: it's v6 (haiku tokens) |
| Executor implements v4 workflow | Annotation file: REFUTED, use v6 |
| Tests fail or reviewer catches it | Planner reads annotation, plans v6 |
| Rework: re-plan + re-execute (opus + sonnet tokens) | No rework |
| **Total: 2-3x the work** | **Total: 1x + scout cost** |

The fact-check layer trades cheap haiku scout tokens for expensive opus rework tokens. The more claims verified upfront, the less rework downstream.

### ARL Foundation

- [Process gap failure mode](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/research/arl/README.md#the-hallucination-pivot-point) — agents fill gaps from training priors rather than signaling uncertainty
- [Principle 1: Structure Over Instruction](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/autonomous-loop-principles.md#principle-1-structure-over-instruction) — pipeline must force verification, not hope for it
- [Principle 3: AI Cannot Reliably Self-Evaluate](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/autonomous-loop-principles.md#principle-3-ai-cannot-reliably-self-evaluate) — independent verification agent required
- [R1: Information Completeness gate](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/research/arl/README.md#the-10-gates) — sufficient context before proceeding

### Reference Implementations

- [hallucination-detector](https://github.com/bitflight-devops/hallucination-detector) — evidence classification model, structural enforcement via stop hooks
- [fact-checker agent](https://github.com/Jamie-BitFlight/claude_skills/blob/main/.claude/agents/fact-checker.md) — single-claim verification on haiku, WebFetch/WebSearch/gh/CLI mandatory, Chain of Verification
- [fact-check skill](https://github.com/Jamie-BitFlight/claude_skills/blob/main/.claude/skills/fact-check/SKILL.md) — parallel claim verification orchestration, wave spawning, report generation

## Architecture

### Components

**Fact-Check Coordinator** — background agent that:
- Watches assigned artifacts (research docs, plans, task plans)
- Identifies claims needing verification: temporal facts, version numbers, magic numbers, config values, API signatures, schema structures — anything missing official attribution
- Spawns fact-check scouts per claim (async, parallel)
- Collects scout results → writes per-claim annotation files
- Notifies orchestrator when claims are REFUTED or corrected → orchestrator triggers planner revision

**Fact-Check Scouts** — lightweight per-claim agents (haiku) that:
- Receive a single claim + suggested source strategies
- Retrieve evidence from available sources:
  - Web: WebFetch, WebSearch
  - Code: local source, clone remote repo to scratch location
  - APIs: GitHub/GitLab GraphQL endpoints, gh CLI
  - Internal: MCP servers (Confluence, Jira, etc.)
  - External: Perplexity or other research providers
- Apply Chain of Verification (cross-check against second source)
- Return: verdict (VERIFIED/REFUTED/INCONCLUSIVE), evidence, citations, corrected value if refuted

**Per-Claim Annotation Files** — evidence trail:
- One file per claim in a known location (e.g., `.gsd/milestones/MXX/factcheck/claim-NNN.md`)
- Any agent can check file existence to see if a claim has been verified
- Contains: original claim, verdict, evidence, citations, source references, corrected value
- Plans and research docs reference claims by ID; agents look up annotation files by ID

### Flow

```
Researcher writes research doc with claims
  → Coordinator reads doc, extracts verifiable claims
  → Spawns scouts per claim (async, parallel)
  → Scouts return → annotation files written

Planner reads research + existing annotation files
  → Plans with verified data where annotations exist
  → Planner introduces new claims in plan
  → Coordinator picks up new claims
  → Spawns more scouts → more annotation files

Coordinator detects REFUTED claim that plan depends on
  → Notifies orchestrator
  → Orchestrator triggers planner revision with corrected data

Executor reads task plan + annotation files
  → Verifies any remaining unverified claims inline
  → Acts on verified ground
```

### What Gets Fact-Checked

Claims needing verification are those where being wrong costs rework:

- Version numbers (library versions, action versions, runtime versions)
- API signatures (function names, parameter names, return types)
- CLI flags and options
- Config formats and schema
- Magic numbers and arbitrary constants without attribution
- External tool behavior ("ruff supports X", "gh can do Y")
- Statements about external systems the agent hasn't read in this session

Claims NOT needing verification:
- Things the researcher directly observed this session (read a file, ran a command)
- Stable general knowledge ("Python uses indentation for scoping")
- Internal project patterns already verified by reading source code

### Research Depth

Research stays shallow. The researcher answers: "Given the goals of efficiency, modularity, avoidance of duplication, lower future maintenance, and working within current best practices per official documentation — is this the optimal fit? If not, what alternative or mutation achieves this better?"

The researcher identifies claims and flags what needs verification. The scouts do the targeted verification work. Research stays cheap; verification happens in parallel on haiku.

## User-Visible Outcome

The user sees no change in ceremony. Auto-mode may take slightly longer upfront (fact-check scouts running) but produces fewer rework cycles downstream. The trade: upfront verification cost vs downstream rework cost.

## Completion Class

- Contract complete means: prompts produce structured unknowns, fact-checker infrastructure exists
- Integration complete means: research → fact-check → plan flow works in auto-mode
- Operational complete means: claims are verified before planning, REFUTED claims trigger plan revision

## Final Integrated Acceptance

- Research docs produce unknowns inventories with evidence basis per claim
- Fact-check coordinator reads artifacts and spawns scouts per verifiable claim
- Per-claim annotation files written with verdicts and evidence
- Planner reads annotations and adjusts for REFUTED claims
- REFUTED claims trigger orchestrator → planner revision
- Execute-task prompt contains verification protocol for remaining unverified claims
- Complete-slice prompt checks unknowns resolution
- Auto-mode runs end-to-end with fact-checking integrated

## Risks and Unknowns

- **Coordinator complexity** — Background agent watching multiple artifacts. New pattern for GSD. Risk: dispatch/lifecycle management.
- **Scout reliability** — haiku may misinterpret docs or fail to retrieve. Mitigation: CoVe cross-checking, INCONCLUSIVE is valid.
- **Annotation file proliferation** — many claims = many files. Mitigation: structured directory, cleanup at milestone completion.
- **Plan revision loop** — REFUTED claims triggering replans that produce new claims that need fact-checking. Mitigation: bounded iteration (max 2 revision cycles per slice).
- **Latency** — scouts are async but still take time. Mitigation: scouts start immediately when research is written, planner starts with whatever annotations exist so far.
- **Source availability** — MCP servers, external providers may not be configured. Mitigation: scouts use whatever sources are available, INCONCLUSIVE if insufficient.

## Scope

### In Scope

- Unknowns inventory section in research output template
- Evidence classification instructions in research prompts
- Fact-check coordinator agent
- Fact-check scout agent (adapted from claude_skills fact-checker)
- Per-claim annotation file format and directory structure
- Coordinator → orchestrator notification mechanism for REFUTED claims
- Plan prompts: read annotation files, adjust for REFUTED claims
- Execute-task prompt: verification protocol for remaining unverified claims
- Bug-fix protocol in execute-task prompt
- Complete-slice prompt: unknowns resolution verification
- Runtime: wiring coordinator into auto-mode lifecycle

### Out of Scope / Non-Goals

- Full hallucination-detector 7-label claim structure (simplified for GSD)
- Stop hook enforcement (hallucination-detector's domain)
- Async feedback queue for user queries (HOOTL Layer 2 — future)
- Real-time observation layer beyond fact-checking (ARL Layer 3 — future)
- MCP server integrations for scouts (scouts use available tools; adding new MCP servers is separate)

## Open Questions

- Where do annotation files live? `.gsd/milestones/MXX/factcheck/` or `.gsd/milestones/MXX/slices/SXX/factcheck/`?
- How does the coordinator identify claims in plans? Structured markers in plan text, or heuristic extraction?
- Should the coordinator run continuously during auto-mode or be triggered at phase transitions?
- How does the planner reference annotation files — by claim ID in the unknowns table, or by file path?
- What's the scout's timeout? Some source lookups (cloning repos) may be slow.
