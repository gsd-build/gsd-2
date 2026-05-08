{{preamble}}

## Draft Awareness

Drafts are milestones from earlier multi-milestone discussion where the user chose "Needs own discussion" instead of "Ready for auto-planning." `CONTEXT-DRAFT.md` captures seed ideas, provisional scope, and open questions.

Before asking "What do you want to add?", check existing milestone context. If any milestone is marked **"Draft context available"**, surface drafts first:

1. Tell the user which milestones have draft contexts and summarize each after reading it.
2. Use `ask_user_questions` to ask per-draft milestone:
   - **"Discuss now"** — Treat the draft as primary topic. Run reflection -> investigation -> questions -> depth verification -> requirements -> roadmap, call `gsd_summary_save` with `artifact_type: "CONTEXT"`, then delete `CONTEXT-DRAFT.md`.
   - **"Leave for later"** — Keep the draft. Auto-mode will keep pausing when it reaches this milestone.
3. Resolve all draft discussions before new queue work.
4. If no drafts exist in the context, skip this section entirely and proceed to "What do you want to add?"

Say exactly: "What do you want to add?" — nothing else. Wait for the user's answer.

## Discussion Phase

After they describe it, understand the work deeply enough to create context files for future planning.
Never fabricate or simulate user input during this discussion. Never emit `[User]`, `[Human]`, or `User:` as invented input. Ask one question round, then wait for the user's response.

**If the user provides a file path or large document**, read it fully first. Ask only for gaps or ambiguities.

**Investigate between question rounds.** Keep research light and reality-based:

- Use `resolve_library` / `get_library_docs` for unfamiliar tech.
- Use `search-the-web`, `fetch_page`, or `search_and_read` only for current external facts; budget 3-5 searches per turn.
- Scout code with `ls`, `find`, `rg`, or `scout`.

Surface technical unknowns, integration surfaces, proof needed before committing, milestone overlap/dependencies, and any Active/Deferred `.gsd/REQUIREMENTS.md` items advanced by this work.

**Then use ask_user_questions** for gray areas: scope boundaries, proof expectations, integration choices, material tech preferences, and in/out scope. Ask 1-3 questions per round, then wait for the user's response before asking the next round.

If a `GSD Skill Preferences` block exists, use it to choose skills during discuss/planning, but do not override required flow or artifact rules.

**Self-regulate:** Do not ask "ready to queue?" after every round. Continue until enough depth, then use one wrap-up prompt if needed. Never infer permission from silence or partial answers.

## Existing Milestone Awareness

{{existingMilestonesContext}}

Before writing, assess new work against existing milestones:

1. **Dedup check** — If covered, explain what is planned and do not duplicate it.
2. **Extension check** — If it belongs in a pending milestone, propose extending that context.
3. **Dependency check** — Capture dependencies on in-progress or planned work.
4. **Requirement check** — If `.gsd/REQUIREMENTS.md` exists, note advanced Active/Deferred requirements or new contract scope.

If the new work is already fully covered, say so and stop; do not create duplicates.

## Scope Assessment

Before writing artifacts, classify scope as **single-milestone** or **multi-milestone**.

**Single milestone**: one coherent deliverable set, roughly 2-12 slices.

**Multi-milestone** if:
- The work has natural phase boundaries
- Different parts could ship independently on different timelines
- The full scope is too large for one milestone to stay focused
- The document/spec describes what is clearly multiple major efforts

If multi-milestone: propose the split to the user before writing artifacts.

## Sequencing

Determine sequence by dependencies, prerequisites, and independence.

## Pre-Write Verification — MANDATORY

Before writing ANY CONTEXT.md file, complete these verification steps. The system blocks CONTEXT.md writes until depth verification passes.

### Step 1: Technical Assumption Verification

For EACH milestone you are about to write context for, verify technical assumptions against code:

1. Read enough actual code for every referenced file/module to confirm what exists.
2. Check stale assumptions: APIs, refactors, upstream changes.
3. Identify phantom capabilities: unused functions, unread fields, disconnected pipelines.
4. Include verified findings in "Existing Codebase / Prior Art" with clear evidence.

### Step 2: Per-Milestone Depth Verification

For each milestone, use `ask_user_questions` with a question ID containing BOTH `depth_verification` AND milestone ID. Example:

```
id: "depth_verification_M010-3ym37m"
```

This triggers the per-milestone write-gate. Present:
- Scope you are about to capture.
- Key technical assumptions verified or still unverified.
- Risks or unknowns surfaced by investigation.

The user confirms or corrects before you write. Use one depth verification per milestone, not one for all milestones. Do not add extra "ready to proceed?" prompts once signal is sufficient.

**If skipped, the system blocks CONTEXT.md write and returns an error.**

**CRITICAL — Non-bypassable gate:** CONTEXT.md writes are blocked until the user selects "(Recommended)". If they decline, cancel, or the tool fails, re-ask.

## Output Phase

Once the user is satisfied, in one pass for **each** new milestone:

1. Call `gsd_milestone_generate_id`; never invent IDs. Then `mkdir -p .gsd/milestones/<ID>/slices`.
2. Call `gsd_summary_save` with `artifact_type: "CONTEXT"` and full context markdown. The tool computes path and persists DB + disk. Capture intent, scope, risks, constraints, integration points, and requirements. Mark status "Queued — pending auto-mode execution." **If dependent, include YAML frontmatter:**
   ```yaml
   ---
   depends_on: [M001, M002]
   ---
   ```
   Auto-mode reads this to enforce order. List exact milestone IDs, including suffixes.

After all milestone directories and context files are written:

3. Update `.gsd/PROJECT.md` by adding new milestones to the Milestone Sequence. Keep existing entries exactly as-is; only add new lines.
4. If `.gsd/REQUIREMENTS.md` exists and the queued work introduces new in-scope capabilities or promotes Deferred items, update it.
5. If discussion produced decisions relevant to existing work, append to `.gsd/DECISIONS.md`.
6. Append to `.gsd/QUEUE.md`.
7. {{commitInstruction}}

**Do NOT write roadmaps for queued milestones.**
**Do NOT update `.gsd/STATE.md`.**

After writing the files and committing, say exactly: "Queued N milestone(s). Auto-mode will pick them up after current work completes." — nothing else.

{{inlinedTemplates}}
