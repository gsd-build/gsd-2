# Queued Milestones

<!-- Append-only. Add milestones here via /gsd queue. Auto-mode picks them up in order. -->

## M006: Fact-Check Service Layer

**Queued:** 2026-03-16
**Depends on:** M005-8pv12q

**Brief:** Build the fact-check coordinator and scout infrastructure that makes M005-8pv12q's evidence discipline structural rather than self-assessed. The coordinator watches pipeline artifacts (research docs, plans), identifies verifiable claims, spawns lightweight haiku scouts per claim to verify against primary sources, writes per-claim annotation files, and notifies the orchestrator when claims are REFUTED so the planner can adjust.

**Why:** M005-8pv12q gives the pipeline the vocabulary for unknowns. Without M005, agents self-classify their own claims — which violates [ARL Principle 3](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/autonomous-loop-principles.md#principle-3-ai-cannot-reliably-self-evaluate). M005 adds independent verification. The cost model: cheap haiku scout tokens upfront vs expensive opus rework tokens downstream.

**Components:**

**Fact-Check Coordinator** — background agent that:
- Watches assigned artifacts for verifiable claims (version numbers, API signatures, CLI flags, config schemas, magic numbers, anything temporal or missing official attribution)
- Spawns scouts per claim, async and parallel
- Collects results → writes per-claim annotation files
- Notifies orchestrator on REFUTED claims → triggers planner revision
- Picks up new claims introduced by the planner or executor

**Fact-Check Scouts** — per-claim haiku agents that:
- Receive single claim + source strategies
- Retrieve evidence from: web (WebFetch/WebSearch), code (local or cloned repos), APIs (gh/GitLab GraphQL), MCP servers (Confluence, Jira), external providers (Perplexity, etc.)
- Apply Chain of Verification (cross-check against second source)
- Return: VERIFIED/REFUTED/INCONCLUSIVE + evidence + citations + corrected value if refuted

**Per-Claim Annotation Files:**
- One file per claim in `.gsd/milestones/MXX/factcheck/` or slice-level equivalent
- Any agent checks file existence to see if a claim is verified
- Contains: original claim, verdict, evidence, citations, corrected value

**Runtime Integration:**
- Coordinator wired into auto-mode lifecycle (starts with research, runs through planning)
- Plan prompts read annotation files alongside research
- REFUTED claims with plan impact trigger orchestrator → planner revision
- Bounded revision: max 2 revision cycles per slice to prevent loops

**Reference implementations:**
- [fact-checker agent](https://github.com/Jamie-BitFlight/claude_skills/blob/main/.claude/agents/fact-checker.md) — single-claim verification on haiku
- [fact-check skill](https://github.com/Jamie-BitFlight/claude_skills/blob/main/.claude/skills/fact-check/SKILL.md) — parallel verification orchestration

**Success looks like:** Research produces unknowns → coordinator spawns scouts → annotation files appear → planner reads verified data → REFUTED claims trigger plan adjustment → executor works on verified ground. All async, no blocking gates.

---

## M007: Telemetry, Metrics, and Experiment Fixtures

**Queued:** 2026-03-16
**Depends on:** M006

**Brief:** Add instrumentation to GSD's dispatch loop that captures per-unit metrics, and design reproducible concept fixtures for controlled comparison between baseline and evidence-grounded GSD.

**Why:** Without measurement, M005-8pv12q+M005 are untested theory. This milestone creates the observation surface and test material. Informed by [ARL Layer 3: Observation](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/research/arl/README.md#three-layers-of-arl).

**Telemetry deliverables:**
- Token counter per dispatch unit (input/output)
- Human intervention counter and classifier (blocker / correction / redirect)
- Dispatch unit count per slice with wall-clock duration
- Fact-check metrics: claims checked, VERIFIED/REFUTED/INCONCLUSIVE counts, scout token usage
- Structured metrics JSONL schema, written to `.gsd/activity/`
- Metrics summary script producing comparison tables

**Fixture deliverables:**
- 2-3 concept fixtures with known claim mixes:
  - **Fixture A (few unknowns):** Clear spec, known tech, binary success criteria
  - **Fixture B (many unknowns):** Subjective goal, external references, novel tech
  - **Fixture C (mixed):** Realistic project with both types
- Each fixture includes: project description, requirements, success criteria, human fidelity rubric for subjective outputs
- Fixtures are self-contained, runnable through GSD from scratch

**Baseline approach:** Baseline comparison uses tagged Docker image of pre-evidence-grounded GSD release. Same model, same fixtures, same environment — only GSD version differs.

**Success looks like:** Run a fixture, get metrics showing tokens, interventions, fact-check activity, and time — broken down by unit type.

---

## M008: Controlled Experiment and Iteration

**Queued:** 2026-03-16
**Depends on:** M007

**Brief:** Run concept fixtures through baseline GSD (Docker image) and evidence-grounded GSD (post-M005-8pv12q+M006). Analyze. Revise. Re-run. Bounded iteration.

**Experiment protocol:**
- Each fixture through baseline and treatment — same model, same environment
- Capture M007 telemetry for both runs
- Human fidelity scoring for subjective outputs (1-5, post-run, ~10 min per fixture)
- Side-by-side comparison: interventions, tokens, fact-check metrics, time, fidelity

**Iteration protocol (bounded):**
- Max 3 revision iterations
- One change per iteration, targeted at largest gap
- Convergence: metrics stable within 10% across 2 consecutive runs
- Non-convergence after 3 iterations: documented finding, not failure

**Success looks like:** Measurable reduction in interventions for fixtures with many unknowns. No regression for fixtures with few unknowns. Data, not opinion.

---

## M009: Report, Document, Publish

**Queued:** 2026-03-16
**Depends on:** M008

**Brief:** Write up the full arc. Publish findings and tooling.

**Deliverables:**
- Experiment report: methodology, fixtures, metrics, results, analysis
- [ARL evidence ledger](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/research/arl/README.md#assumptions-and-evidence-ledger) update: hypotheses confirmed/refuted with data
- Updated [PROVENANCE.md](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/research/arl/PROVENANCE.md) with GSD experiment as evidence source
- GSD documentation: how evidence-grounded pipeline works
- Fixture specs published for independent reproduction
- Public writeup

**Success looks like:** Independently reproducible. Tagged Docker images, published fixtures, documented methodology. ARL evidence ledger has empirical entries.
