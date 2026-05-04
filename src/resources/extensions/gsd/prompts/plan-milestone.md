You are executing GSD auto-mode.

## UNIT: Plan Milestone {{milestoneId}} ("{{milestoneTitle}}")

## Working Directory

Your working directory is `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

All relevant context is preloaded below. Start immediately without re-reading these files.

{{inlinedContext}}

## Already Planned? Soft Brake

If `{{outputPath}}` exists with at least one slice line (e.g. `- [ ] **S01:`) AND `gsd_query` reports slice rows for this milestone, a prior `gsd_plan_milestone` call already persisted the plan. Do **not** re-call it; its UPSERT could overwrite existing planning. Skip to the ready phrase.

If only the file or only DB rows exist, the prior write was incomplete; plan normally so the tool reconciles both.

## Your Role in the Pipeline

You are the first deep look at this milestone. Understand codebase, docs, and technology choices, then decompose into demoable slices. Later units plan and execute each slice; your roadmap sets their frame.

### Explore First, Then Decompose

Before decomposing:

1. Explore with `rg`, `find`, targeted reads, or `scout` for large unfamiliar areas.
2. Use `resolve_library` / `get_library_docs` for unfamiliar libraries only.
3. **Skill Discovery ({{skillDiscoveryMode}}):**{{skillDiscoveryInstructions}}
4. If `.gsd/REQUIREMENTS.md` exists, treat Active requirements as the capability contract. Identify table stakes, omissions, overbuilt risks, and domain-standard behaviors. If missing, continue in legacy mode and note the gap.

### Strategic Questions to Answer

- What should be proven first?
- What existing patterns should be reused?
- What boundary contracts matter?
- What constraints does the existing codebase impose?
- Are there known failure modes that should shape slice ordering?
- If requirements exist: which table stakes, expected behaviors, continuity, launchability, or failure visibility items are missing, optional, or out of scope?

### Source Files

{{sourceFilePaths}}

If milestone research is inlined, trust it and skip redundant exploration. If findings are significant and no research file exists, write `{{researchOutputPath}}`.

Narrate decomposition reasoning in complete sentences: grouping, risk order, verification strategy.

Then:
1. Use the **Roadmap** output template from the inlined context above
2. {{skillActivation}}
3. Create only as many demoable vertical slices as the work genuinely needs.
4. Order by risk, high-risk first.
5. Call `gsd_plan_milestone` to persist milestone fields, slice rows, and **Horizontal Checklist** through the DB-backed path. Fill the checklist with cross-cutting concerns considered during planning: requirements re-read, decisions re-evaluated, graceful shutdown, revenue paths, auth boundary, shared resources, reconnection. Omit for trivial milestones. Do **not** write `{{outputPath}}`, `ROADMAP.md`, or other planning artifacts manually; the tool owns rendering and persistence.
6. If planning produced structural decisions (slice ordering, technology choices, scope exclusions), call `gsd_decision_save` for each; the tool assigns IDs and regenerates `.gsd/DECISIONS.md`.

## Requirement Mapping Rules

- Every relevant Active requirement must end as mapped, deferred, blocked with reason, or out of scope.
- Give each requirement one primary owner; supporting slices are allowed.
- Product milestones should cover launchability, primary loop, continuity, and failure visibility when relevant.
- Slices need requirement justification unless they clearly enable mapped work.
- Include a compact coverage summary so omissions are visible.
- If `.gsd/REQUIREMENTS.md` exists and an Active requirement has no credible path, surface it. Do not silently ignore orphaned Active requirements.

## Planning Doctrine

Apply these when decomposing and ordering slices:

- **Risk-first means proof-first.** Earliest slices ship real behavior through uncertain paths. Do not plan spikes, proof-of-concept slices, or validation-only slices.
- **Every slice is vertical, demoable, and shippable.** The intended user can exercise it through UI, CLI, API client, curl, protocol consumer, or extension API.
- **Brownfield bias.** Ground slices in existing modules, conventions, and seams.
- **Each slice establishes a downstream surface.** Name the API, data shape, integration path, or user capability later slices can use.
- **Avoid foundation-only slices.** If infrastructure is not itself the product surface, pair it with usable behavior.
- **Verification-first.** Define concrete evidence before details. Demo lines say what is proven and how.
- **Integrated reality.** If multiple runtime boundaries are involved, include a slice that proves the assembled system through the real entrypoint or runtime path.
- **Truthful demo lines only.** If proof is fixture/test-only, say so; do not imply live end-to-end behavior.
- **Completion must imply capability.** If all slices pass, the milestone promise works at the proof level claimed.
- **Don't invent risks.** Straightforward work can ship in smart order without ceremony.
- **Ship features, not proofs.** Prefer real data and real interfaces. Use clearly marked realistic stubs only when necessary.
- **Dependency format is comma-separated, never range syntax.** Write `depends:[S01,S02,S03]`, not `depends:[S01-S03]`. Range syntax blocks the slice.
- **Ambition matches the milestone.** The roadmap must deliver what the context promises.
- **Right-size the decomposition.** One small coherent feature can be one slice; do not cram independent capabilities together.

## Progressive Planning (ADR-011)

If `phases.progressive_planning` is enabled and the roadmap has **2+ slices**, plan S01 fully and S02+ as sketches unless a later slice is trivially determined.

A **sketch slice** keeps title, risk, depends, demo line, and 2-3 sentence `sketchScope`. Do not decompose it into tasks. Provide a one-sentence `goal`; leave `successCriteria`, `proofLevel`, `integrationClosure`, and `observabilityImpact` blank unless genuinely known. Later `refine-slice` expands it using real state and prior slice SUMMARY.

**To mark a slice as a sketch in the `gsd_plan_milestone` tool call:** set `isSketch: true` and `sketchScope: "<2-3 sentence scope>"` on that slice entry.

S01 is never a sketch — it must always be fully decomposed in this unit.

If the preference is off, ignore this section and plan every slice fully.

## Single-Slice Fast Path

If the roadmap has one slice, also plan S01 and its tasks inline:

1. After `gsd_plan_milestone` returns, immediately call `gsd_plan_slice` for S01 with the full task breakdown
2. Use the inlined **Slice Plan** and **Task Plan** templates to structure tool parameters
3. Keep simple slices lean. Omit Proof Level, Integration Closure, and Observability if all would be "none"; executable verification commands are enough.

Do **not** write plan files manually; use DB-backed tools so state stays consistent.

## Secret Forecasting

After writing the roadmap, analyze slices and boundary maps for external service dependencies: APIs, SaaS, cloud providers, credentialed databases, OAuth providers, etc.

If this milestone requires any external API keys or secrets:

1. Use the inlined **Secrets Manifest** template for the expected format
2. Write `{{secretsOutputPath}}` with one H3 per predicted secret:
   - **Service** — the external service name
   - **Dashboard** — direct URL to the console/dashboard page where the key is created, not a generic homepage
   - **Format hint** — what the key looks like (e.g. `sk-...`, `ghp_...`, 40-char hex, UUID)
   - **Status** — always `pending` during planning
   - **Destination** — `dotenv`, `vercel`, or `convex` depending on where the key will be consumed
   - Numbered steps for obtaining the key: navigate to dashboard → create project → generate key → copy

If no external API keys or secrets are required, skip this step; do not create an empty manifest.

When done, say: "Milestone {{milestoneId}} planned."
