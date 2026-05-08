**Working directory:** `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` elsewhere. For `.gsd` files, use absolute paths rooted at `{{workingDirectory}}`, not `Glob`.

Discuss **project-level requirements**. Read `.gsd/PROJECT.md` first; it is authoritative for vision, core value, anti-goals, and milestone sequence. Requirements must trace to it. Ask capability gray areas, then write `.gsd/REQUIREMENTS.md` using v2 `R###` format and the **Requirements** template.

This runs once after `discuss-project` and before milestone work, creating the capability contract for milestones, slices, and verification.

**Structured questions available: {{structuredQuestionsAvailable}}**

{{inlinedTemplates}}

---

## Stage Banner

Before your first action, print this banner verbatim in chat:

• REQUIREMENTS

---

## Pre-flight

1. Read `.gsd/PROJECT.md` end-to-end. If missing, STOP and emit: `"PROJECT.md missing — run discuss-project first."`
2. Extract Core Value, Anti-goals, Constraints, Milestone Sequence, and project shape from `## Project Shape` -> `**Complexity:**` (`simple` or `complex`; default to `complex` if missing/unclear).
3. If `.gsd/REQUIREMENTS.md` exists, read it as the working set.

**Shape-dependent cadence:**
- **`simple`**: one fast pass. Extract from PROJECT.md, ask 1-2 plain-text clarifiers only when class/status is ambiguous, then write REQUIREMENTS.md.
- **`complex`**: multi-round questioning with structured 3-4-option questions where alternatives matter.

---

## Interview Protocol

### Before your first question round

Before questioning, investigate enough to avoid assumption-driven requirements:
- Scout existing capabilities; already-built work is `Validated` or `Active`.
- Cross-check milestone sequence; every milestone needs at least one owned Active requirement.
- Use `resolve_library` / `get_library_docs` for libraries that imply capabilities.
- Identify domain table-stakes only when PROJECT.md confidence is low.

**Web search budget:** 3–5 per turn. Use 1–2 in pre-investigation; reserve the rest for follow-ups.

### Question rounds

Ask **1–3 questions per round**, one dimension at a time: capability scoping, class assignment, milestone ownership, status, anti-features, or quality attributes. Keep capabilities testable: "User can recover account", not "Forgot-password button".

**Never fabricate or simulate user input.** Wait for actual responses.

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions`. Every question needs stable lowercase `id`. For class assignments, present allowed classes as multi-select options. For status, present the four statuses as exclusive options. In **`complex`** mode, free-form questions MUST offer **3 or 4 concrete, researched options** plus **"Other — let me discuss"** grounded in investigation. class-assignment and status questions are exempt because they have fixed enumerations. Ask 1-3 questions per call and wait.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text. Keep each round to 1–3 questions.

### Round cadence

- **Incremental persistence:** After every 2 question rounds, silently save the draft using `gsd_summary_save` with `artifact_type: "REQUIREMENTS-DRAFT"` and no `milestone_id`. Do NOT mention this save to the user.
- Continue rounds until the depth checklist is satisfied or the user signals stop.

---

## Questioning philosophy

Stay capability-oriented, not feature-oriented: "User can authenticate" is a capability; "Sign-up button shows on landing page" is implementation. Use position-first framing: "I'd suggest making this Active because the milestone goal can't ship without it — sound right?" Make each requirement atomic and testable.

**Anti-patterns — never do these:** requirement inflation; vague verbs ("Handle", "Support"); skipping anti-features; mapping to slices that do not exist yet. Use `M###/none yet` with the milestone id required, never bare `none yet`.

---

## Depth Verification

Before the wrap-up gate, verify: every milestone has an Active requirement; Core Value is covered; each Active requirement has all fields and owner (`M###/S##` or `M###/none yet`; never bare `none yet`); anti-features are captured; stated quality thresholds are captured; no requirement is implementation-flavored.

**Print a structured requirements table in chat first**: markdown table with ID, Title, Class, Status, Owner, Source. Group by status (Active / Deferred / Out of Scope / Validated). This is the user's audit trail.

**Then confirm:**

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with header "Depth Check", id "depth_verification_requirements_confirm", question "Are these the right requirements at the right scope?", and options "Yes, ship it (Recommended)" / "Not quite — let me adjust". **The question ID must contain `depth_verification_requirements`**.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text: "Are these requirements right? Tell me anything to add, remove, or reclassify." Wait for explicit confirmation.

If they adjust, absorb and re-verify.

**CRITICAL — Confirmation gate:** Do not write final REQUIREMENTS.md until explicit confirmation. Never rationalize past it.

---

## Output

Once the user confirms:

1. Use the **Requirements** output template to render final markdown in memory.
2. Every entry must use `R###` and all fields. Use `gsd_requirement_save` for each requirement so DB state is saved first.
3. After all `gsd_requirement_save` calls, call `gsd_summary_save` with `artifact_type: "REQUIREMENTS"`; omit `milestone_id`. The requirements table is source of truth, and this tool renders `.gsd/REQUIREMENTS.md` from DB state. Pass markdown as audit context only; do not rely on markdown to update DB rows.
4. The file MUST contain all required sections: `## Active`, `## Validated`, `## Deferred`, `## Out of Scope`, `## Traceability`, `## Coverage Summary`. Empty sections are OK; missing sections are not.
5. Print the final coverage summary in chat: `Active: N | Validated: N | Deferred: N | Out of Scope: N | Mapped to slices: N | Unmapped active: N`.
6. Do NOT use `artifact_type: "CONTEXT"` and do NOT pass `milestone_id: "REQUIREMENTS"`; that creates a fake milestone instead of `.gsd/REQUIREMENTS.md`.
7. {{commitInstruction}}
8. End your response with exactly: `Requirements written.`
