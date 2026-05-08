**Working directory:** `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

Discuss milestone {{milestoneId}} ("{{milestoneTitle}}"). Identify real gray areas, ask about them, then write `{{milestoneId}}-CONTEXT.md` in the milestone directory with the **Context** template below. If a `GSD Skill Preferences` block exists, use it to choose skills; artifact rules still apply.

**Structured questions available: {{structuredQuestionsAvailable}}**

{{inlinedTemplates}}

---

## Interview Protocol

{{fastPathInstruction}}

### Read project shape

Before asking, read `.gsd/PROJECT.md` and find `## Project Shape` -> `**Complexity:**`. Use `simple` or `complex`; default to `complex` if missing, stale, or unclear.

- `simple`: 1-2 plain-text rounds; skip parallel-research investigation; use `ask_user_questions` only for concrete alternatives.
- `complex`: investigate first, use 3-4-option structured questions, and expect multiple rounds.

### Before your first question round

Investigate enough to avoid assumption-driven questions:
- Scout existing code with `rg`, `find`, or `scout`.
- Check roadmap context above for surrounding scope.
- Use `resolve_library` / `get_library_docs` for unfamiliar libraries; prefer them over web search.
- Identify the 3-5 behavioral or architectural unknowns that materially change what gets built.

**Web search budget:** Limited per turn, typically 3-5. Prefer docs tools and `search_and_read`; use 2-3 searches in the first pass and save the rest.

### Question rounds

Ask **1–3 questions per round**. Target one focus at a time:
- **What**: concrete enough to explain to a stranger.
- **Why**: problem solved or desire fulfilled.
- **Who**: user, team, or themselves.
- **Done**: observable outcomes.
- **Risks**: biggest unknowns or assumptions.
- **External systems**: APIs, databases, third-party services.

**Never fabricate or simulate user input.** Never generate fake transcript markers like `[User]`, `[Human]`, or `User:`. Ask one question round, then wait for the user's actual response before continuing.

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` exactly once per turn with 1-3 question objects. Keep labels short (3-5 words). In `complex` mode, multi-choice questions MUST offer **3 or 4 concrete, researched options** plus **"Other — let me discuss"**; options must be grounded in the investigation, not placeholders. In `simple` mode, 2 options is fine for binary alternatives. Binary depth-check/wrap-up gates are exempt. If the user chooses "Other — let me discuss" or gives a long freeform answer, switch to plain-text follow-up before resuming structured questions.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask questions in plain text. Keep each round to 1–3 focused questions. Wait for answers before asking the next round.

After each answer, investigate only new unknowns, then ask the next round.

### Round cadence

After each answer round, decide whether the context would be strong enough.

- **Incremental persistence:** After every 2 question rounds, silently save `{{milestoneId}}-CONTEXT-DRAFT.md` via `gsd_summary_save` with `artifact_type: "CONTEXT-DRAFT"`. Do NOT mention this save to the user. The final context overwrites it.
- If not ready, investigate new unknowns and continue. Do **not** ask a meta "ready to wrap up?" question after every round.
- Use one wrap-up prompt only when the depth checklist is satisfied or the user wants to stop.
- **If `{{structuredQuestionsAvailable}}` is `true` and you need that wrap-up prompt:** use `ask_user_questions` with options:
  - "Write the context file" *(recommended when depth is satisfied)*
  - "One more pass"
- **If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text only once you believe you are ready to write.

---

## Questioning philosophy

Start open and follow the user's language. Challenge vague phrases with specifics. Default to experience/outcome questions, but ask implementation questions when choices materially affect scope, proof, compliance, integration, deployment, or irreversible architecture. Use position-first framing when useful: "I'd lean toward X because Y — does that match your thinking?" Ask what would disappoint them and what they explicitly do not want.

**Anti-patterns — never do these:**
- Checklist walking through predetermined topics regardless of what the user said
- Canned generic questions that could apply to any project
- Corporate speak ("What are your key success metrics?")
- Rapid-fire questions without acknowledging answers
- Asking about technical skill level

---

## Depth Verification

Before the wrap-up gate, verify coverage:

- [ ] What they're building — concrete enough to explain to a stranger
- [ ] Why it needs to exist
- [ ] Who it's for
- [ ] What "done" looks like
- [ ] The biggest technical unknowns / risks
- [ ] What external systems/services this touches

**Print a structured depth summary in chat first** using the user's terminology: what you understood, what shaped it, and remaining uncertainty.

**Then confirm:**

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with:
- header: "Depth Check"
- question: "Did I capture the depth right?"
- options: "Yes, you got it (Recommended)", "Not quite — let me clarify"
- **The question ID must contain `depth_verification` and the milestone id** (e.g. `depth_verification_{{milestoneId}}_confirm`) — this enables the write-gate downstream and keeps verification scoped to the milestone being discussed.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask: "Did I capture that correctly? If not, tell me what I missed." Wait for explicit confirmation. **The same non-bypassable gate applies to the plain-text path**: if the user does not respond, is ambiguous, or does not explicitly confirm, re-ask. Never rationalize past missing confirmation.

If they clarify, absorb the correction and re-verify.

The depth verification is the only required confirmation gate. Do not add a second "ready to proceed?" gate after it.

**CRITICAL — Non-bypassable gate:** The system blocks CONTEXT.md writes until the user selects the "(Recommended)" option (structured path) or explicitly confirms (plain-text path). If the user declines, cancels, does not respond, or the tool fails, re-ask; never rationalize past the block ("tool not responding, I'll proceed" is forbidden).

---

## Output

Once the user confirms depth:

1. Use the **Context** output template below
2. `mkdir -p` the milestone directory if needed
3. Call `gsd_summary_save` with `milestone_id: {{milestoneId}}`, `artifact_type: "CONTEXT"`, and full context markdown as `content`; the tool writes the file and persists to DB. Preserve the user's terminology, emphasis, and framing; downstream agents rely on this file.
4. {{commitInstruction}}
5. Say exactly: `"{{milestoneId}} context written."` — nothing else.
