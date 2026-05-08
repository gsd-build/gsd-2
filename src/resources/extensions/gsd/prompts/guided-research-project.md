**Working directory:** `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

Run one-time **project-level domain research** after `discuss-requirements` and the `research-decision` gate, before milestone work. Read `.gsd/PROJECT.md` and `.gsd/REQUIREMENTS.md`, then spawn 4 parallel `Task` calls with agent class `scout`, one per research dimension, each writing exactly one file under `.gsd/research/`.

**Structured questions available: {{structuredQuestionsAvailable}}**

---

## Stage Banner

Print this banner verbatim in chat as your first action:

• RESEARCHING (project)

Then say: "Spawning 4 research agents in parallel: stack, features, architecture, pitfalls."

---

## Pre-flight

1. Read `.gsd/PROJECT.md` end-to-end. Extract domain, vision, current state, milestone sequence, scale, project type, and tech constraints.
2. Read `.gsd/REQUIREMENTS.md` end-to-end. Extract Active requirement classes; focus research on required deliverables.
3. `mkdir -p .gsd/research/`

If either file is missing, STOP and emit: `"PROJECT.md or REQUIREMENTS.md missing — research-project cannot run."`

---

## Fan-out

Issue **4 `Task` tool calls in one assistant response** (one block with four calls). Use `agent: "scout"` for every task. Do not use `agent: "researcher"`. Runtime parallelizes them, so do not chain calls across turns. Wait for ALL results before "After fan-out completes."

Each task gets its own focused prompt. Each task writes one file.

### Task 1 — Stack research → `.gsd/research/STACK.md`

Prompt:

> Research the standard stack for [domain] as of today: dominant libraries, frameworks, runtimes, and infrastructure tools. For each: stable version, alternatives, selection rationale, and avoid-when guidance.
>
> Constraints from PROJECT.md: [list any tech constraints / required frameworks the user specified].
>
> Deliver `.gsd/research/STACK.md` with: **Recommended Stack** (versions/rationale), **Alternatives Considered**, **What NOT to use**, **Open questions**.
>
> Use `resolve_library` / `get_library_docs` for library docs. Use web search sparingly (2–3 queries). Cite sources where versions matter. Mark confidence per recommendation: high / medium / low.

### Task 2 — Features research → `.gsd/research/FEATURES.md`

Prompt:

> Research typical [domain] product features. Categorize as **table stakes** (expected; missing breaks the product) vs **differentiators** (compelling but optional).
>
> Active requirements from REQUIREMENTS.md to cross-check: [list R### IDs and titles].
>
> Deliver `.gsd/research/FEATURES.md` with sections per category (Authentication, Content, Notifications, etc.): **Table stakes** with one-sentence justifications, **Differentiators**, **Anti-features**, and **Cross-check vs REQUIREMENTS.md** (covered, missing, excessive).
>
> Use web search to surface 3–5 representative competitors / examples. Don't go deep; aim for breadth.

### Task 3 — Architecture research → `.gsd/research/ARCHITECTURE.md`

Prompt:

> Research typical architecture for [domain] products at this project's scale: patterns, data models, integrations, and scaling considerations.
>
> Vision/scale signals from PROJECT.md: [extract scale-relevant phrases: solo / small team / enterprise / planned user count].
>
> Deliver `.gsd/research/ARCHITECTURE.md` with: **Recommended Architecture** (diagram-friendly data flow, services, boundaries), **Data Model Sketch**, **Integration Points**, **Scaling Tier**, **Reversibility risk**.
>
> Use `resolve_library` for library-specific architecture docs. Mark confidence per recommendation.

### Task 4 — Pitfalls research → `.gsd/research/PITFALLS.md`

Prompt:

> Research common failure modes, gotchas, and footguns for [domain] products: things experienced builders wish they had known earlier.
>
> Project type from PROJECT.md: [greenfield / brownfield / migration].
>
> Deliver `.gsd/research/PITFALLS.md` with: **Domain Pitfalls**, **Stack Pitfalls** from the recommended/domain-norm stack, **Scope Traps**, **Compliance / Security gotchas**, and **Migration pitfalls** only if brownfield.
>
> Web search for postmortems, incident reports, and "lessons learned" content. Sources matter; prefer specific writeups over generic listicles.

---

## After fan-out completes

Once all 4 tasks return:

1. Verify `.gsd/research/STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, and `PITFALLS.md` exist. If any are missing, retry that task once.
2. Print a concise summary in chat: one sentence per dimension, what each found or why blocked. The runtime clears the dispatch marker after this unit exits.
3. Say exactly: `"Project research complete."` — nothing else.

---

## Critical rules

- **Issue all 4 `Task` calls in one assistant response** (one block of four tool calls). The runtime parallelizes them; do NOT chain calls or await them individually.
- **Each task writes exactly one file** to `.gsd/research/`. No cross-writes.
- **Research is informational, not prescriptive** — it surfaces options; the user / requirements stage already chose what to build.
- **Stay within scope** — don't research milestones or slices. That's a different stage.
- **Budget:** ~3–5 web searches per dimension. Prefer `resolve_library` / `get_library_docs` for library questions.
- If any task fails twice, write `.gsd/research/{DIMENSION}-BLOCKER.md` with the failure reason and continue. If all four dimensions are blockers, runtime stops before milestone planning because no usable research exists.
