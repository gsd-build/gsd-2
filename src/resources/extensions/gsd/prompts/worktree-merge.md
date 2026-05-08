You are merging worktree **{{worktreeName}}** (branch `{{worktreeBranch}}`) into target branch `{{mainBranch}}`.

## Working Directory

Your CWD is the **main project tree** at `{{mainTreePath}}` on `{{mainBranch}}`. Run all git and file commands here.

- **Main tree (CWD):** `{{mainTreePath}}` — run `git merge`, read main files, commit.
- **Worktree directory:** `{{worktreePath}}` — inspect worktree versions before merging.
- **Worktree branch:** `{{worktreeBranch}}`

## Context

The worktree may contain code, milestones, roadmaps, plans, research, decisions, requirements, or other artifacts to merge.

### Commit History (worktree)

```
{{commitLog}}
```

### Changed Files

**Added files:**
{{addedFiles}}

**Modified files:**
{{modifiedFiles}}

**Removed files:**
{{removedFiles}}

### Code Diff

```diff
{{codeDiff}}
```

### GSD Artifact Diff

```diff
{{gsdDiff}}
```

## Your Task

Analyze and guide the merge exactly:

### Step 1: Categorize Changes

Classify each changed file.

**Code changes:**
- **New source files** — modules, components, utilities, tests.
- **Modified source files** — existing code changes.
- **Config changes** — package.json, tsconfig, build config, etc.
- **Deleted files** — removed source/config.

**GSD artifact changes:**
- **New milestones** — new M###/ directories with roadmaps.
- **New slices/tasks** — planning artifacts inside existing milestones.
- **Updated roadmaps** — changed M###-ROADMAP.md files.
- **Updated plans** — changed slice/task plans.
- **Research/context** — new or updated RESEARCH.md, CONTEXT.md.
- **Decisions** — changes to DECISIONS.md
- **Requirements** — changes to REQUIREMENTS.md
- **Other** — anything else

### Step 2: Conflict Assessment

For each **modified** file, check whether main also changed since the worktree branched. Flag diverged files for manual reconciliation.

To compare versions:
- **Main version:** read normal path from CWD.
- **Worktree version:** read `{{worktreePath}}/<relative-path>`.
- Use `git merge-base {{mainBranch}} {{worktreeBranch}}` if needed.

Classify each modified file:
- **Clean merges** — main unchanged; apply worktree changes directly.
- **Conflicts** — both changed same file; reconcile.
- **Stale changes** — main replaced/removed a file the worktree modified.

### Step 3: Merge Strategy

Present a merge plan:

1. **Clean merges:** files expected to merge without conflict.
2. **Conflicts:** show both versions side-by-side and propose reconciliation.
3. **New files:** confirm they should be added.
4. **Removed files:** confirm removals are intentional.

Ask the user to confirm the merge plan before proceeding.

**CRITICAL — Non-bypassable gate:** Do NOT execute any merge commands until the user explicitly approves the merge plan. If `ask_user_questions` fails, errors, returns no response, or the user's response is ambiguous, you MUST re-ask — never rationalize past the block. "No response, I'll proceed with the clean merges," "the plan looks safe, merging," or any other self-authorization is **forbidden**. The gate exists to protect the user's branches; treat a block as an instruction to wait, not an obstacle to work around.

### Step 4: Execute Merge

Once the user has explicitly confirmed, run all commands from `{{mainTreePath}}` (your CWD):

1. Ensure you are on the target branch: `git checkout {{mainBranch}}`
2. If conflicts require manual reconciliation, apply reconciled versions first
3. Run `git merge --squash {{worktreeBranch}}` to bring in all changes
4. Review staged changes; adjust reconciled files if needed
5. Commit with message: `merge(worktree/{{worktreeName}}): <summary of what was merged>`
6. Report what was merged

### Step 5: Cleanup Prompt

After a successful merge, ask the user whether to:
- **Remove the worktree** — delete the worktree directory and `{{worktreeBranch}}`.
- **Keep the worktree** — leave it for continued parallel work.

If the user chooses to remove it, run these commands from `{{mainTreePath}}`:
```
git worktree remove {{worktreePath}}
git branch -D {{worktreeBranch}}
```

**Do NOT use `/worktree remove` — the command handler may not have the correct state after the merge.** Use the git commands directly.

## Important

- Never silently discard changes from either branch.
- When in doubt, show both versions and ask.
- Preserve GSD artifact formatting: frontmatter, sections, checkbox states.
- If new milestone IDs conflict with main, flag immediately.
