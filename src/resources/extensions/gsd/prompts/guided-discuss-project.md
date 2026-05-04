**Working directory:** `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory. For `.gsd` files in this prompt, use absolute paths rooted at `{{workingDirectory}}` instead of discovering them with `Glob`.

Discuss the **project** as a whole: vision, users, anti-goals, constraints, and rough milestone sequence. Ask only about real gray areas, then write `.gsd/PROJECT.md` with the decisions using the **Project** template below. If a `GSD Skill Preferences` block is present in system context, use it to decide which skills to load and follow; do not relax artifact rules.

This runs once before milestone discussion. Later milestones, requirements, and roadmaps depend on it.

**Structured questions available: {{structuredQuestionsAvailable}}**

{{inlinedTemplates}}

---

## Stage Banner

Before your first action, print this banner verbatim in chat:

• QUESTIONING (project)

---

## Interview Protocol

### Open the conversation

Ask the user a single freeform question in plain text, not structured: **"What do you want to build?"**

Wait for the response so follow-ups use their terminology.

### Classify project shape

After the opening answer, classify project shape as **`simple`** or **`complex`**. Print exactly one verdict line: `Project shape: simple` or `Project shape: complex`, plus a one-line rationale.

**`simple`** — most apply: single primary user/team, no integrations beyond common SDKs/libs, greenfield or self-contained, scope fits 1-2 clear sentences, no compliance/regulatory needs, <=5 distinct capabilities.

**`complex`** — any apply: roles/permissions, non-trivial brownfield codebase, auth/data integrations, compliance/security/regulated domain such as PII/payments/healthcare, >5 capabilities or unclear scope, cross-team/org work, novel domain needing validation.

**Default to `complex` when uncertain.** The user can override the verdict in plain text; if they do, accept it and proceed.

Persist the verdict to PROJECT.md -> `## Project Shape`; downstream `discuss-requirements`, `discuss-milestone`, and `discuss-slice` read it from there.

### Before deeper rounds

Do a lightweight investigation before deeper rounds:
- Scout the codebase with `rg`, `find`, or `scout`: greenfield/brownfield, language/framework signals.
- Check prior `.planning/` or `.gsd/` artifacts for history.
- Use `resolve_library` / `get_library_docs` for unfamiliar libraries the user mentions.

**Web search budget:** typically 3–5 per turn. Prefer `resolve_library` / `get_library_docs` for library docs. Target 2–3 web searches in the investigation pass; distribute remaining searches across follow-up rounds.

Do not go deep; investigate just enough to avoid assumption-driven questions.

### Question rounds

Ask **1–3 questions per round**. Target one focus at a time:
- **What**: concrete enough to describe to a stranger.
- **Who**: primary/secondary users, internal/external.
- **Core value**: the ONE thing that must work if everything else is cut.
- **Anti-goals**: explicit non-wants and disappointments.
- **Constraints**: budget, timeline, tech, irreversible architecture.
- **Existing context**: prior work, brownfield state, decisions already made.
- **Milestone shape**: rough v1/v1.1 sequence and differentiators.

**Never fabricate or simulate user input.** Never generate fake transcript markers like `[User]`, `[Human]`, or `User:`. Ask one question round, then wait for the user's actual response before continuing.

**Shape-dependent cadence:**
- **`simple`**: favor 1-2 plain-text rounds. Use `ask_user_questions` only for concrete alternatives. Reach the depth checklist quickly.
- **`complex`**: do full investigation, multiple rounds, and structured questions when meaningful alternatives exist.

**If `{{structuredQuestionsAvailable}}` is `true` and you use `ask_user_questions`:** ask 1-3 questions per call. Every question object MUST include a stable lowercase `id`. Keep option labels short (3-5 words). In **`complex`** mode, each multi-choice question MUST present **3 or 4 concrete, researched options** plus final **"Other — let me discuss"**; options must be grounded in investigation (codebase signals, library docs, prior `.gsd/` artifacts), not generic placeholders. In **`simple`** mode, 2 options is fine. Binary depth-check/wrap-up gates are exempt from the 3-or-4 rule. Wait for each tool result before the next round.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask questions in plain text. Keep each round to 1–3 focused questions.

After each round, investigate only new unknowns, then ask the next round.

### Round cadence

After each round, decide whether PROJECT.md would be strong enough.

- **Incremental persistence:** After every 2 question rounds, silently save `.gsd/PROJECT-DRAFT.md` using `gsd_summary_save` with `artifact_type: "PROJECT-DRAFT"` and no `milestone_id`. Crash protection. Do NOT mention this save to the user.
- If not ready, continue to the next round.
- Use a wrap-up prompt only when the depth checklist is satisfied or the user wants to stop.

---

## Questioning philosophy

**Start open, follow energy.** Dig where the user shows momentum.

**Challenge vagueness.** When the user says "it should be smart" or "good UX", push for specifics.

**Position-first framing.** Have opinions: "I'd lean toward X because Y — does that match your thinking?" beats neutral polling.

**Negative constraints.** Ask what would disappoint them and what they explicitly don't want; these are sharper than positive wishes.

**Anti-patterns — never do these:**
- Checklist walking through predetermined topics regardless of what the user said
- Canned generic questions ("What are your key success metrics?")
- Rapid-fire questions without acknowledging answers
- Asking about technical skill level
- Asking about specific milestone implementations — that's the next stage

---

## Depth Verification

Before the wrap-up gate, verify coverage:

- [ ] What they're building — concrete enough to describe to a stranger
- [ ] Who it's for
- [ ] Core value (the ONE thing that must work)
- [ ] Anti-goals / explicit non-wants
- [ ] Constraints (budget, time, tech, architecture)
- [ ] Greenfield vs brownfield state
- [ ] Rough milestone sequence (at least M001's intent)

**Print a structured depth summary in chat first** using the user's terminology. Cover what you understood, what shaped it, and remaining uncertainty.

**Then confirm:**

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with:
- header: "Depth Check"
- id: "depth_verification_project_confirm"
- question: "Did I capture the depth right?"
- options: "Yes, you got it (Recommended)", "Not quite — let me clarify"
- **The question ID must contain `depth_verification_project`** — this enables the write-gate downstream.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text: "Did I capture that correctly? If not, tell me what I missed." Wait for explicit confirmation. **The same non-bypassable gate applies to the plain-text path**: if the user does not respond, gives an ambiguous answer, or does not explicitly confirm, re-ask.

If they clarify, absorb the correction and re-verify.

The depth verification is the only required confirmation gate. Do not add a second "ready to proceed?" gate after it.

**CRITICAL — Confirmation gate:** Do not write final PROJECT.md until the user selects the "(Recommended)" option (structured path) or explicitly confirms (plain-text path). If the user declines, cancels, does not respond, or the tool fails, re-ask; never rationalize past the block.

---

## Output

Once the user confirms depth:

1. Use the **Project** output template (inlined above).
2. Call `gsd_summary_save` with `artifact_type: "PROJECT"` and full project markdown as `content`; omit `milestone_id`. The tool writes `.gsd/PROJECT.md` and persists to DB. Preserve the user's terminology, emphasis, and framing.
3. The `## Project Shape` section MUST contain `**Complexity:** simple` or `**Complexity:** complex` (matching the verdict you announced) plus a one-line `**Why:**` rationale. Downstream stages read this line.
4. The `## Capability Contract` section MUST reference `.gsd/REQUIREMENTS.md` — that file does not yet exist; the next stage (`discuss-requirements`) will produce it.
5. The `## Milestone Sequence` MUST list at least M001 with title and one-liner. Subsequent milestones may be listed as known intents; they will be elaborated in their own discuss-milestone stages.
6. Do NOT use `artifact_type: "CONTEXT"` and do NOT pass `milestone_id: "PROJECT"`; that creates a fake milestone named PROJECT.
7. {{commitInstruction}}
8. Say exactly: `"Project context written."` — nothing else.
