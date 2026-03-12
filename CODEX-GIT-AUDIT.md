# CODEX Git Audit

Date: 2026-03-12
Repo: `/Users/lexchristopherson/Developer/gsd-2`
Scope: current GSD2 Git behavior, 2026 best practices, and a proposal for baking the right workflow into GSD2 without enterprise theater

## Executive Summary

GSD2 is already opinionated about Git. It is not a blank slate.

The current shape is:

- Branch-per-slice is real and enforced.
- Worktrees are supported for parallel work.
- Completed slice branches are squash-merged automatically.
- Dirty state is often auto-committed to keep the machine moving.
- Remote-host workflow is mostly not encoded yet.

That means GSD2 is already pointed in the right direction, but it stops halfway. It has a strong **local Git orchestration** story and a weak **collaboration / protected-trunk / CI-host** story.

My recommendation is:

1. Keep **trunk-based development** as the default philosophy.
2. Keep **branch-per-slice** as the main abstraction.
3. Treat **worktrees as an internal power tool**, not the default mental model.
4. Make **Git actions deterministic code**, not prompt text.
5. Replace visible checkpoint commits with **hidden snapshot refs**.
6. For repos with a remote and CI, move from “local squash to main” to **PR + merge queue** by default.
7. Add **stacked branches/PRs only as an advanced mode** for multi-agent or large-slice work.

The short version:

- For vibe coders: “just build stuff, keep `main` clean, never think about branch choreography.”
- For senior engineers: “this behaves like trunk-based development with clean isolation, good auditability, and optional stacks/worktrees when they are actually useful.”

## What GSD2 Does Today

### 1. Slice branches are a first-class mechanism

GSD documents and implements a branch-per-slice model:

- README says each slice gets its own branch and is squash-merged back to main: [`README.md`](./README.md) lines 113-113 and 250-264
- Workflow doc says the user should never need to run Git by hand: [`src/resources/GSD-WORKFLOW.md`](./src/resources/GSD-WORKFLOW.md) lines 544-583
- Auto mode ensures a slice branch exists before slice-level work runs: [`src/resources/extensions/gsd/auto.ts`](./src/resources/extensions/gsd/auto.ts) lines 2222-2224
- Branch creation / checkout logic lives in [`src/resources/extensions/gsd/worktree.ts`](./src/resources/extensions/gsd/worktree.ts) lines 152-195

This is directionally correct. It matches a modern “small isolated unit of work” mindset.

### 2. Slice completion is auto-merged

When a slice is marked done in the roadmap, auto mode will switch away from the slice branch and squash-merge it:

- Merge guard in auto mode: [`src/resources/extensions/gsd/auto.ts`](./src/resources/extensions/gsd/auto.ts) lines 980-1000
- Squash merge implementation: [`src/resources/extensions/gsd/worktree.ts`](./src/resources/extensions/gsd/worktree.ts) lines 237-267

This is good for keeping `main` readable.

### 3. Worktrees are supported and namespaced correctly

GSD has real worktree support:

- Worktree creation uses `git worktree add` with a dedicated branch: [`src/resources/extensions/gsd/worktree-manager.ts`](./src/resources/extensions/gsd/worktree-manager.ts) lines 90-136
- Slice branches inside worktrees are namespaced to avoid branch checkout conflicts: [`src/resources/extensions/gsd/worktree.ts`](./src/resources/extensions/gsd/worktree.ts) lines 52-66
- Inside a worktree, “main” for slice operations becomes `worktree/<name>` rather than the repo’s actual default branch: [`src/resources/extensions/gsd/worktree.ts`](./src/resources/extensions/gsd/worktree.ts) lines 89-128

This is a strong implementation detail. It shows the system already understands that local concurrency needs actual Git isolation.

### 4. Dirty state is handled by auto-commit

GSD frequently uses `git add -A` plus an automatic commit to unblock switching or finishing:

- Before branch switches in slice flow: [`src/resources/extensions/gsd/worktree.ts`](./src/resources/extensions/gsd/worktree.ts) lines 183-191
- Generic auto-commit helper: [`src/resources/extensions/gsd/worktree.ts`](./src/resources/extensions/gsd/worktree.ts) lines 202-215
- Post-unit cleanup in auto mode: [`src/resources/extensions/gsd/auto.ts`](./src/resources/extensions/gsd/auto.ts) lines 480-509
- Worktree create/switch/return also auto-commit before moving: [`src/resources/extensions/gsd/worktree-command.ts`](./src/resources/extensions/gsd/worktree-command.ts) lines 356-357, 431-432, and 468-469

This is understandable pragmatically, but it is also the biggest Git quality risk in the current implementation.

### 5. Prompts still tell the model to run raw Git commands

Even though GSD2 is supposed to be more deterministic than GSD1, several prompts still rely on the model to execute Git directly:

- Task execution prompt: [`src/resources/extensions/gsd/prompts/execute-task.md`](./src/resources/extensions/gsd/prompts/execute-task.md) line 57
- Slice completion prompt: [`src/resources/extensions/gsd/prompts/complete-slice.md`](./src/resources/extensions/gsd/prompts/complete-slice.md) line 21
- Replan prompt: [`src/resources/extensions/gsd/prompts/replan-slice.md`](./src/resources/extensions/gsd/prompts/replan-slice.md) line 34

This is the wrong boundary. Branching, committing, staging, merging, pushing, and cleanup are deterministic operations. They should live in program code, not in LLM prose instructions.

### 6. Remote / PR / protected-branch workflow is mostly not encoded

I did not find first-class orchestration for:

- `git fetch` / branch freshness before branching
- pushing to remotes
- opening PRs
- enabling auto-merge
- interacting with merge queues
- reading branch protection / required checks

GSD also explicitly avoids outward-facing GitHub actions without user confirmation:

- [`src/resources/extensions/gsd/prompts/system.md`](./src/resources/extensions/gsd/prompts/system.md) line 29

That is a reasonable current safety posture, but it means GSD2 has not yet encoded “best possible Git workflow” end-to-end. It currently encodes a local-only subset.

### 7. GSD bootstraps Git and commits its own scaffolding on the current branch

When a repo is missing Git or missing `.gsd/`, GSD will initialize Git if needed and commit the initial `.gsd` scaffold:

- Auto mode bootstrap: [`src/resources/extensions/gsd/auto.ts`](./src/resources/extensions/gsd/auto.ts) lines 358-373
- Guided flow bootstrap: [`src/resources/extensions/gsd/guided-flow.ts`](./src/resources/extensions/gsd/guided-flow.ts) lines 443-462

This is fine in spirit, but it is another example of “not actually one commit per slice on main.” The product currently has additional GSD-infrastructure commits too.

## Current Gaps And Mismatches

### 1. Docs say branches are preserved; code deletes them

The docs say slice branches are kept:

- README says `gsd/M001/S01 (preserved)`: [`README.md`](./README.md) lines 258-264
- Workflow doc says “Branch kept”: [`src/resources/GSD-WORKFLOW.md`](./src/resources/GSD-WORKFLOW.md) lines 548-551

The implementation deletes the slice branch after squash merge:

- [`src/resources/extensions/gsd/worktree.ts`](./src/resources/extensions/gsd/worktree.ts) line 261

This should be resolved. My recommendation is: **delete merged slice branches by default**. Preserving every merged slice branch is not a good default for most users.

### 2. Docs promise checkpoint commits; implementation does not enforce them

The workflow doc describes explicit checkpoint commits before each task:

- [`src/resources/GSD-WORKFLOW.md`](./src/resources/GSD-WORKFLOW.md) lines 565-580

I did not find enforcement of that model in auto mode or prompts. Instead, the system mostly relies on:

- normal task commits when the model remembers
- broad fallback auto-commits when it does not

This means the documented rollback model is better than the actual one.

### 3. `git add -A` is too broad for autonomous Git

Today, the fallback behavior stages everything:

- [`src/resources/extensions/gsd/worktree.ts`](./src/resources/extensions/gsd/worktree.ts) lines 187-190 and 208-214

That can accidentally commit:

- unrelated user edits
- generated files not intended for the unit
- partial experiments
- dirt from a previous failed attempt

For an agentic system, broad staging is convenient but not high-trust.

### 4. Final slice merge commit is always `feat(...)`

The squash-merge commit message on main is always:

- `feat(M###/S##): <slice title>`

Implementation:

- [`src/resources/extensions/gsd/worktree.ts`](./src/resources/extensions/gsd/worktree.ts) lines 258-260

That means bugfix slices, docs slices, refactor slices, and chore slices all land as `feat`. That weakens history quality and mislabels work.

### 5. Branch base can drift from trunk-first discipline

When creating a slice branch, GSD may branch from the current non-slice branch instead of the repo default branch:

- [`src/resources/extensions/gsd/worktree.ts`](./src/resources/extensions/gsd/worktree.ts) lines 161-170

This was added for a practical reason: preserving planning artifacts that may exist only on the working branch.

That fix is reasonable for the current architecture, but it also means new slice branches are not always cut from canonical trunk. For a pure trunk-based model, that is a compromise.

### 6. Worktree merge is still partially LLM-mediated

`/worktree merge` previews changes, but then dispatches a prompt-driven merge helper:

- Preview and dispatch: [`src/resources/extensions/gsd/worktree-command.ts`](./src/resources/extensions/gsd/worktree-command.ts) lines 591-699
- Prompt content: [`src/resources/extensions/gsd/prompts/worktree-merge.md`](./src/resources/extensions/gsd/prompts/worktree-merge.md)

That is acceptable as an interim approach for complex planning artifact reconciliation, but it should not be the final shape for production Git workflow.

### 7. `/worktree create` currently creates first and commits second

The current ordering is:

1. create the new worktree
2. auto-commit dirty state in the current workspace
3. switch into the new worktree

Implementation:

- [`src/resources/extensions/gsd/worktree-command.ts`](./src/resources/extensions/gsd/worktree-command.ts) lines 352-357

That means the new worktree can fork from pre-commit `HEAD` rather than from the user’s just-saved state. If GSD keeps auto-commit-at-switch behavior, it should commit first and create second.

## What The Best Teams Tend To Do In 2026

This is the part that matters most: what should GSD encode by default?

### 1. They optimize for a green trunk

The best teams do not optimize for elaborate branch taxonomies. They optimize for:

- a healthy default branch
- small mergeable changes
- automated policy enforcement
- fast rollback
- low human coordination overhead

That is why **trunk-based development** remains the right baseline for an agentic coding system.

Good summary resources:

- GitHub protected branches: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches>
- GitHub merge queue: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue>
- Trunk-based development on short-lived branches: <https://trunkbaseddevelopment.com/short-lived-feature-branches/>
- Feature flags in trunk-based development: <https://trunkbaseddevelopment.com/feature-flags/>

### 2. They use short-lived branches, not GitFlow

For this product, the wrong answer is:

- `develop`
- long-lived release branches for normal product work
- permanent integration branches
- manual cherry-pick rituals
- giant branch chains that drift for days or weeks

That is exactly the kind of enterprise ceremony GSD should avoid.

The right default is:

- branch from trunk
- keep the branch short-lived
- merge quickly
- delete the merged branch

### 3. They use protected-branch rules and CI gates

Modern best practice on hosted repos is not just “have branches.” It is “enforce policy on the integration branch.”

Typical protected-trunk controls:

- required status checks
- required conversation resolution
- linear history
- blocked force pushes and deletions
- merge queue when concurrency rises

For GSD, this means the best workflow is not just local branch orchestration. It is local branch orchestration plus host policy orchestration when a remote exists.

### 4. They use feature flags to keep trunk releasable

If a slice cannot land cleanly as a complete user-visible feature, high-functioning teams do not leave trunk broken. They:

- land behind a flag
- use additive migrations
- separate “ship code” from “enable behavior”

For GSD, feature flags should become a first-class strategy for large or multi-slice initiatives.

### 5. They use worktrees as a local tool, not as a team process

`git worktree` is great. The official Git docs exist for a reason:

- <https://git-scm.com/docs/git-worktree>

But worktrees are best understood as **local parallelism ergonomics**:

- multiple working directories
- multiple branches checked out at once
- cleaner parallel experiments

They are not a substitute for trunk-based collaboration. For GSD, that means:

- use worktrees internally when they help
- do not make “worktree management” the default user mental model

### 6. Senior engineers increasingly like stacked changes, but only when needed

The strongest teams often use stacked changes for:

- large refactors
- multi-agent parallel execution
- keeping review units small without blocking a bigger stream of work

That pattern is visible in modern tooling such as Graphite:

- <https://graphite.dev/docs/getting-started-with-graphite>

But this should be an **advanced path**, not the default for everyone.

## The Right GSD2 Git Philosophy

If I had to compress the recommendation to one sentence:

**GSD2 should be trunk-based by default, branch-per-slice by default, worktree-backed when parallelism is needed, merge-queue-aware when a remote exists, and deterministic for every mechanical Git operation.**

That yields five design rules.

### Rule 1: Trunk is the source of truth

- Use the actual default branch as the integration branch.
- Do not invent `develop`.
- Do not let arbitrary long-lived branches become shadow trunks.

### Rule 2: Slice branches are the user-facing unit of work

Current GSD slice branches are the right abstraction. Keep them.

Default branch name can stay close to current shape:

- `gsd/M001/S01`
- inside worktrees or stacks, namespace further if needed

The branch exists to isolate a slice, not to become permanent history.

### Rule 3: Worktrees are automatic infrastructure

Worktrees should be used automatically for:

- parallel agents
- experiments / spikes
- a branch waiting on CI / merge queue while other work continues
- stacked work that needs simultaneous checked-out branches

They should not be the first thing a casual user has to think about.

### Rule 4: Snapshots are for recovery; commits are for meaning

This is important.

Visible commit history should be meaningful.

Recovery points should be hidden.

So:

- do not clutter branch history with checkpoint commits by default
- create hidden refs like `refs/gsd/snapshots/...` before risky steps
- let GSD roll back to those automatically

That gives senior-engineer-grade recovery without novice-facing Git noise.

### Rule 5: Remote workflow should be policy-aware

If there is no remote or no hosted policy, local squash-to-main is fine.

If there is a remote with protected trunk and CI, GSD should graduate to:

- push branch
- open/update PR
- enable auto-merge if allowed
- join merge queue if configured
- treat “merged to trunk” as the real completion boundary

That is what “best possible Git workflow” looks like in 2026.

## Recommended GSD2 Git Model

## A. Default mode: Solo Trunk

Best for:

- vibe coders
- solo makers
- local-only repos
- repos without hosted protections yet

Behavior:

1. Create `gsd/M###/S##` from the true default branch head.
2. Before each unit, create a hidden snapshot ref.
3. Let the agent make one or more logical commits on the slice branch.
4. When the slice is done and verified, squash-merge to trunk.
5. Delete the slice branch.
6. Keep audit metadata in commit trailers and GSD artifacts.

What the user sees:

- “Working on isolated slice”
- “Verified”
- “Merged to main”

What the user does not see:

- manual checkout
- stash juggling
- rebasing
- branch cleanup

## B. Default mode when remote protections exist: Collaborative Trunk

Best for:

- shared repos
- teams with CI
- GitHub-based projects

Behavior:

1. Create the same short-lived slice branch.
2. Run local verification.
3. Push the branch.
4. Open or update the PR automatically after confirmation or based on stored repo policy.
5. Enable auto-merge or merge queue participation.
6. Mark the slice as complete only after merge to trunk succeeds.
7. Delete the merged branch.

This preserves the clean GSD abstraction while matching how strong teams protect shared branches.

## C. Advanced mode: Stacked Slice Execution

Best for:

- senior engineers
- multi-agent work on the same large slice
- larger refactors where one PR would be too broad

Behavior:

1. Create a root slice branch.
2. Create stacked child branches for logical chunks.
3. Use separate worktrees when parallel local execution is helpful.
4. Merge the stack through small PRs or child merges.
5. Land a clean final slice result on trunk.

Important:

- this should be opt-in or auto-triggered only when GSD detects real benefit
- this should not replace the default slice model

## What Vibe Coders Should Experience

The product should feel like this:

- open repo
- say what to build
- GSD isolates work automatically
- `main` stays clean
- verification happens automatically
- if there is GitHub/CI, GSD handles the safe path
- if something goes wrong, GSD can roll back without Git trivia

The user should not have to learn:

- merge vs rebase
- worktree semantics
- stacked branch management
- branch protection configuration details

They should still get the benefit of all of it.

## What Senior Engineers Should Experience

Senior engineers should get:

- a trunk-based default they already trust
- clear branch names
- deterministic Git mechanics
- optional stacks
- optional worktrees
- auditable metadata
- no hidden magical state they cannot inspect

The right balance is:

- simple defaults
- strong visibility
- optional control

Not:

- mandatory ceremony
- permanent branch sprawl
- chatty checkpoint commits
- LLM-improvised Git

## Specific Changes I Would Make In GSD2

## P0: Fix the model and the trust boundary

### 1. Move Git mechanics out of prompts and into code

Add a deterministic Git service, for example:

- `beginSliceBranch(...)`
- `createUnitSnapshot(...)`
- `commitOwnedChanges(...)`
- `parkUnrelatedDirtyState(...)`
- `completeSliceMerge(...)`
- `pushAndOpenPullRequest(...)`
- `waitForMergeQueue(...)`

Primary file targets:

- [`src/resources/extensions/gsd/worktree.ts`](./src/resources/extensions/gsd/worktree.ts)
- [`src/resources/extensions/gsd/auto.ts`](./src/resources/extensions/gsd/auto.ts)
- prompt files that currently instruct raw `git add` / `git commit`

### 2. Replace broad auto-commit with scoped ownership

Instead of `git add -A`, GSD should track owned files per unit:

- files modified by the unit
- expected artifact files
- allowed GSD bookkeeping files

Then:

- commit only owned files
- if unrelated dirty files exist, park them safely instead of sweeping them in

### 3. Replace checkpoint commits with hidden snapshot refs

Implement:

- `refs/gsd/snapshots/<branch>/<unit>/<timestamp>`

Use these for:

- pre-task rollback
- pre-merge rollback
- recovery after failed autonomous edits

Delete or age them out automatically.

### 4. Infer commit type instead of hardcoding `feat`

Use:

- slice metadata
- changed file categories
- explicit prompt output from the model

Final main commit type should be one of:

- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`

### 5. Align docs with behavior

Fix the mismatch around:

- preserving vs deleting slice branches
- promised checkpoint commits
- exact merge behavior

The docs need to describe the system users actually have.

## P1: Encode real trunk protection

### 6. Detect remote-host capability and default branch freshness

On supported repos:

- detect origin host
- fetch and prune before cutting a new slice branch
- base from the true latest default branch head

This removes a major class of “branched from stale main” problems.

### 7. Add host-aware PR / merge queue orchestration

For GitHub-first support:

- detect protected default branch
- detect required checks
- detect merge queue availability
- push branch
- create/update PR
- enable auto-merge or queue entry

This should be configurable per repo, but automatic once enabled.

### 8. Add Git observability to the dashboard

GSD should surface:

- default branch
- current slice branch
- current worktree
- ahead/behind status
- dirty file ownership: owned vs foreign
- last snapshot ref
- PR number and status
- merge queue state
- last successful verification set

This makes the workflow explainable without forcing Git expertise.

## P2: Make worktrees and stacks invisible until they are useful

### 9. Auto-create worktrees for parallel execution

If GSD wants to:

- run multiple agents in parallel
- keep working while a branch waits for CI
- spin up a risky spike

it should create and manage the worktree automatically.

Keep `/worktree` as an advanced manual escape hatch.

### 10. Add stacked mode for advanced users and multi-agent execution

Suggested trigger conditions:

- slice estimated across many tasks / files
- multiple independent sub-problems
- high review surface area
- explicit user preference for stacked review

Do not make this the default.

### 11. Use the existing deterministic worktree merge helper instead of the prompt path

There is already a typed helper for squashing a worktree branch into the main branch:

- [`src/resources/extensions/gsd/worktree-manager.ts`](./src/resources/extensions/gsd/worktree-manager.ts) lines 375-391

But `/worktree merge` still dispatches an LLM-driven flow instead:

- [`src/resources/extensions/gsd/worktree-command.ts`](./src/resources/extensions/gsd/worktree-command.ts) lines 672-696

That seam is ready-made for a safer default implementation.

## Concrete Policy Recommendations

If you want one opinionated GSD2 Git policy, I would make it this:

### Default local policy

- Development model: trunk-based
- Default integration branch: repo default branch
- Work unit: slice branch
- Merge method: squash
- Merged branch cleanup: delete branch
- Recovery model: hidden snapshot refs
- Dirty-state handling: scoped commit or parked WIP, never blind sweep
- Incomplete large features: feature flags

### Default hosted policy

- Protected default branch: on
- Required status checks: on
- Conversation resolution: on
- Linear history: on
- Force push: off
- Deletion: off
- Merge queue: on when available
- Auto-merge: on when queue is not available but policy allows it

### Advanced policy

- Stacked branches: opt-in / auto when beneficial
- Worktrees: automatic under the hood, optional manual use
- Signed commits: opt-in, not default

I would explicitly reject as defaults:

- GitFlow
- permanent `develop`
- long-lived feature branches
- preserving every merged slice branch forever
- visible checkpoint commits for every task
- LLM-generated raw Git choreography as the primary path

## A Better Lifecycle For GSD2

Here is the lifecycle I would want the product to implement.

### Slice lifecycle

1. Fetch remote state if configured.
2. Cut `gsd/M001/S03` from fresh trunk.
3. Create hidden snapshot.
4. Execute task work.
5. Commit only owned files with a typed commit message.
6. Repeat as needed.
7. Run slice verification.
8. If local-only: squash to trunk and delete branch.
9. If hosted: push, PR, queue, merge, delete branch.
10. Record final metadata in commit trailers and GSD artifacts.

### Parallel lifecycle

1. Detect that work can proceed in parallel.
2. Create a managed worktree automatically.
3. Execute the parallel stream there.
4. Merge back deterministically.
5. Remove the worktree unless policy says keep it.

### Failure lifecycle

1. Use snapshot ref to recover.
2. Preserve human-readable failure summary in GSD artifacts.
3. Retry with clean context.
4. If still failing, stop and surface exact conflict / ownership / verification issue.

## The Most Important Product Decision

If you only make one architectural Git change, make this one:

**stop telling the model to run raw Git as the primary mechanism.**

Git is:

- deterministic
- mechanically verifiable
- easy to test
- high-risk when done loosely

That makes it perfect for the extension layer and a poor fit for prompt-layer improvisation.

The LLM should decide:

- what changed
- why it changed
- what the commit should be called
- whether the work is complete

The program should decide:

- what gets staged
- what gets committed
- what branch gets created
- what gets merged
- what gets pushed
- what gets cleaned up

That is the cleanest “best practice baked in” boundary for GSD2.

## Bottom Line

GSD2 is already closer to the right answer than most coding-agent systems.

It already has:

- slice branches
- squash merges
- worktrees
- automated cleanup
- state-aware orchestration

What it needs next is not more Git complexity. It needs a sharper opinion:

- trunk-based by default
- deterministic Git operations
- hidden recovery snapshots
- protected-trunk / merge-queue awareness when a remote exists
- optional stacks/worktrees for advanced and parallel cases

That gives vibe coders the safest workflow they would never assemble themselves, while giving senior engineers a system that behaves like the good habits they already converge on.

## Reference Links

- GitHub protected branches:
  <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches>
- GitHub merge queue:
  <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue>
- Git worktree:
  <https://git-scm.com/docs/git-worktree>
- Trunk-based development, short-lived feature branches:
  <https://trunkbaseddevelopment.com/short-lived-feature-branches/>
- Trunk-based development, feature flags:
  <https://trunkbaseddevelopment.com/feature-flags/>
- Graphite getting started:
  <https://graphite.dev/docs/getting-started-with-graphite>
