# GEMINI-GIT-AUDIT: The Future of Agentic Git Workflows (2026)

## Executive Summary
GSD2 currently employs a **Branch-Per-Slice with Squash Merge** strategy, utilizing Git worktrees for isolation. While robust, it remains a "manual-first" architecture where the agent acts as a diligent operator of standard Git commands. To reach "Best Teams on Earth" status in 2026, GSD2 must transition to an **Autonomous Shadow Stack** model—where Git becomes an invisible, high-fidelity ledger of progress that empowers "vibe coders" while providing "senior engineers" with the precision and observability they demand.

---

## 1. Current State Audit (GSD2 vCurrent)

### Strengths
- **Isolation:** The `gsd/M001/S01` branch-per-slice pattern ensures `main` stays stable.
- **Safety:** Manual checkpoints (`checkpoint(S01/T02)`) provide a recovery path for failed tasks.
- **Parallelism:** Basic support for Git worktrees via `/wt` allows switching contexts.
- **Cleanliness:** Squash merges to `main` keep the primary history readable.

### Weaknesses / Gaps
- **Opt-in Worktrees:** Worktrees are a manual command, not the default execution environment. The agent still risks "dirtying" the user's primary working directory.
- **Basic Commits:** Commit messages are repetitive (`feat(S01/T01): built X`). They lack the rich metadata (must-haves, verification logs) captured in GSD summaries.
- **Manual Merging:** The merge process requires a specialized "merge helper" session, adding friction to the "vibe to ship" flow.
- **No Stack Awareness:** Commits are treated as a linear history rather than a "stack" of independent, reviewable changesets.

---

## 2. The "Best Teams on Earth" (2026) Perspective

In 2026, elite engineering teams have moved beyond "managing branches." They use **Agentic Version Control (AVC)** patterns:

1.  **Shadow Worktrees as Default:** The "primary" directory is for the human. The agent works in "shadow" worktrees located in `.gsd/worktrees/`. The human's floor is never filthy.
2.  **Stacked Changesets:** Inspired by `Sapling` and `gh stack`, work is organized into a stack of atomic commits. Each commit is a "shippable unit."
3.  **Semantic Change Bundles:** Commits are not just code; they are "bundles" containing the code, the test results, and the AI's rationale (stored in Git Notes).
4.  **Instant Revert/Undo:** "Undo last task" is an atomic operation that perfectly restores state without manual `git reset` knowledge.
5.  **Invisible Rebase:** As `main` moves, the agent's shadow stacks are automatically rebased using AI-driven conflict resolution.

---

## 3. Proposal: The GSD2 "Autonomous Shadow Stack"

We should bake the following workflow into the core of GSD2:

### A. The "Vibe" Experience (Invisible Git)
For the "vibe coder," Git doesn't exist. They just talk to the agent.
- **Auto-Shadow:** When a slice starts, GSD2 silently spawns a worktree. The user sees no changes in their editor until they "peek" or "land."
- **Ghost Commits:** Every sub-task is committed automatically with high-fidelity, AI-generated `Conventional Commits`.
- **The "Land" Command:** When the user says "This is great, let's ship it," GSD2 performs a multi-step merge:
    1.  Verifies the stack against `main`.
    2.  Generates a rich PR description from the accumulated GSD summaries.
    3.  Squash-merges with a "Release Note" style commit message.

### B. The "Senior" Experience (Observable Git)
For the senior engineer, GSD2 provides a "Super-Git" interface:
- **`gsd stack`:** A visual timeline of the current slice's commits, showing which tasks are "verified," "pending," or "broken."
- **`gsd undo <task_id>`:** Surgical removal of a specific task's changes, even if it's in the middle of the stack.
- **Metadata in Git Notes:** Every GSD commit has a corresponding Git Note containing:
    - The original task `plan.md`.
    - The `verification_result` (CLI output, test logs).
    - Links to the `TNN-summary.md`.

---

## 4. Implementation Roadmap

### Phase 1: Shadow-by-Default
- Modify the `execute-task` flow to check if it's running in the "main tree."
- If so, automatically propose: "I'll handle this in a background worktree to keep your workspace clean. [OK]"
- Automate the `/worktree return` and `/worktree merge` steps into a single `land-slice` lifecycle.

### Phase 2: Semantic Commits (GSD-Git Bundles)
- Update `gsd-executor` to use `git notes` to attach the JSON representation of the task summary to every commit.
- Create a `gsd log` command that renders these notes as a "Mission Log."

### Phase 3: The Stack Manager
- Introduce a "Stack" model where slices are treated as `changesets`.
- Enable "Cross-Slice Rebasing": If Slice A (Types) changes, Slice B (API) which depends on it is automatically updated in its shadow worktree.

### Phase 4: Vibe-to-PR
- Integrate with `gh` CLI.
- Instead of just local merging, `gsd ship` creates a GitHub PR with a generated video/screenshot (if UI) and a rich Markdown description.

---

## 5. Conclusion: Why this Wins
By baking these practices into GSD2, we remove the "Git Tax" from the developer. 
- **Vibe coders** get the safety and structure of an elite Git workflow without knowing what a `rebase -i` is.
- **Senior engineers** get a codebase that is perfectly documented, bisectable, and organized, without having to nag an agent to "write better commit messages."

**Git is the database of software. GSD2 should be its most sophisticated writer.**

---
*Created by Gemini (2026)*
