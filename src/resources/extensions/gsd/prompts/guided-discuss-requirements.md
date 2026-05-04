**Working directory:** `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory. For `.gsd` files, use absolute paths rooted at `{{workingDirectory}}` instead of `Glob`.

Discuss **project-level requirements**. Read `.gsd/PROJECT.md` first; it is authoritative for vision, core value, anti-goals, and milestone sequence. Requirements must trace back to it. Ask about capability gray areas, then write `.gsd/REQUIREMENTS.md` with the v2 structured `R###` format and **Requirements** template below.

This runs once after `discuss-project` and before milestone work, creating the capability contract for milestones, slices, and verification.

**Structured questions available: {{structuredQuestionsAvailable}}**

{{inlinedTemplates}}

---

## Stage Banner

Before your first action, print this banner verbatim in chat:

• REQUIREMENTS

---

## Pre-flight

1. Read `.gsd/PROJECT.md` end-to-end. If it does not exist, STOP and emit: `"PROJECT.md missing — run discuss-project first."`
2. Extract Core Value, Anti-goals, Constraints, Milestone Sequence, and the project shape verdict from `## Project Shape` -> `**Complexity:**` (`simple` or `complex`; default to `complex` if missing/unclear).
3. Check for existing `.gsd/REQUIREMENTS.md`; if present, this is refinement. Read existing requirements and treat them as the working set.

**Shape-dependent cadence:**
- **`simple`**: favor one fast pass. Extract from PROJECT.md, ask 1-2 plain-text clarifiers only when class/status is ambiguous, then write REQUIREMENTS.md.
- **`complex`**: multi-round questioning with structured 3-4-option questions where alternatives matter.

---

## Interview Protocol

### Before your first question round

Investigate lightly before questioning:
- Scout existing capabilities; anything already built is `Validated` or `Active`.
- Cross-check milestone sequence; every milestone needs at least one owned Active requirement.
- Use `resolve_library` / `get_library_docs` for libraries that imply capabilities, e.g. auth library -> auth requirements.
- Identify domain table-stakes only when PROJECT.md confidence is low.

**Web search budget:** 3–5 per turn. Target 1–2 in pre-investigation; reserve the rest for follow-ups.

### Question rounds

Ask **1–3 questions per round**. Target one dimension:

- **Capability scoping**: what must the project do? Capabilities, not features: "User can recover account", not "Forgot-password button".
- **Class assignment**: choose `core-capability`, `primary-user-loop`, `launchability`, `continuity`, `failure-visibility`, `integration`, `quality-attribute`, `operability`, `admin/support`, `compliance/security`, `differentiator`, `constraint`, or `anti-feature`.
- **Milestone ownership**: which milestone owns it? Provisional later ownership is fine.
- **Status**: Active (must build), Deferred (later), Out of Scope (explicit no), Validated (already proven).
- **Anti-features**: explicitly excluded capabilities, captured as `out-of-scope` with rationale.
- **Quality attributes**: performance, reliability, observability, security thresholds. These are requirements too.

**Never fabricate or simulate user input.** Wait for actual responses.

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions`. Every question object MUST include a stable lowercase `id`. For class assignments, present allowed classes as multi-select options. For status, present the four statuses as exclusive options. In **`complex`** mode, any free-form question MUST present **3 or 4 concrete, researched options** plus final **"Other — let me discuss"** grounded in investigation. The class-assignment and status questions are exempt because they have fixed enumerations. Ask 1-3 questions per call and wait for each result before the next round.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text. Keep each round to 1–3 questions.

### Round cadence

- **Incremental persistence:** After every 2 question rounds, silently save the draft using `gsd_summary_save` with `artifact_type: "REQUIREMENTS-DRAFT"` and no `milestone_id`. Do NOT mention this crash-protection save.
- Continue rounds until the depth checklist is satisfied or the user signals stop.

---

## Questioning philosophy

**Capability-oriented, not feature-oriented.** "User can authenticate" is a capability; "Sign-up button shows on landing page" is implementation. Extract the capability.

**Position-first framing.** Have opinions. "I'd suggest making this Active because the milestone goal can't ship without it — sound right?"

**Atomic and testable.** Each requirement should be one verifiable thing. Split bundled items like "user can sign up and manage profile."

**Anti-patterns — never do these:**
- Listing every conceivable feature ("requirement inflation")
- Vague verbs ("Handle", "Support") — push for "User can X" or "System emits Y when Z"
- Skipping anti-features — explicit out-of-scope is part of the contract
- Mapping requirements to slices that don't exist yet — use `M###/none yet` with the milestone id required

---

## Depth Verification

Before the wrap-up gate, verify:

- [ ] Every milestone in PROJECT.md has at least one Active requirement
- [ ] Core Value (from PROJECT.md) is covered by at least one Active requirement
- [ ] Each Active requirement has: ID, title, class, status, description, why-it-matters, source, primary owner (`M###/S##` or `M###/none yet`; never bare `none yet`), validation, notes
- [ ] At least one explicit Out of Scope entry per major capability area (anti-features captured)
- [ ] Quality attributes (performance, reliability, etc.) captured where the user has stated thresholds
- [ ] No requirement is implementation-flavored ("button", "endpoint", "table") — all are capability-flavored

**Print a structured requirements table in chat first**: markdown table with ID, Title, Class, Status, Owner, Source. Group by status (Active / Deferred / Out of Scope / Validated). This is the user's audit trail.

**Then confirm:**

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with:
- header: "Depth Check"
- id: "depth_verification_requirements_confirm"
- question: "Are these the right requirements at the right scope?"
- options: "Yes, ship it (Recommended)", "Not quite — let me adjust"
- **The question ID must contain `depth_verification_requirements`** — enables the write-gate.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text: "Are these requirements right? Tell me anything to add, remove, or reclassify." Wait for explicit confirmation.

If they adjust, absorb and re-verify.

**CRITICAL — Confirmation gate:** Do not write final REQUIREMENTS.md until explicit confirmation. Never rationalize past it.

---

## Output

Once the user confirms:

1. Use the **Requirements** output template (inlined above) to render final markdown in memory.
2. Every entry must conform to the `R###` format with all listed fields. Use `gsd_requirement_save` (NOT plain file edit) for each requirement so DB state is saved first.
3. After all `gsd_requirement_save` calls complete, call `gsd_summary_save` with `artifact_type: "REQUIREMENTS"`; omit `milestone_id`. The requirements table is source of truth, and this tool renders `.gsd/REQUIREMENTS.md` from DB state. Pass rendered markdown as `content` for audit context only; do not rely on markdown to update DB rows.
4. The file MUST contain all required sections: `## Active`, `## Validated`, `## Deferred`, `## Out of Scope`, `## Traceability`, `## Coverage Summary`. Empty sections are OK; missing sections are not.
5. Print the final coverage summary in chat: `Active: N | Validated: N | Deferred: N | Out of Scope: N | Mapped to slices: N | Unmapped active: N`.
6. Do NOT use `artifact_type: "CONTEXT"` and do NOT pass `milestone_id: "REQUIREMENTS"`; that creates a fake milestone instead of `.gsd/REQUIREMENTS.md`.
7. {{commitInstruction}}
8. End your response with exactly: `Requirements written.`
