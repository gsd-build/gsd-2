# GSD2 Git Strategy Audit

> Comprehensive analysis of GSD2's git workflow: current implementation, industry best practices, gap analysis, and recommendations for embedding best-practice git into agentic coding workflows.

---

## Table of Contents

1. [Current Implementation](#current-implementation)
2. [Industry Best Practices (2025-2026)](#industry-best-practices-2025-2026)
3. [Gap Analysis](#gap-analysis)
4. [Recommendations](#recommendations)
5. [Implementation Spec](#implementation-spec)
6. [User Experience Design](#user-experience-design)

---

## Current Implementation

### Architecture

GSD2 implements a **branch-per-slice workflow with squash merge** across four source files:

| File | Role |
|------|------|
| `src/resources/extensions/gsd/worktree.ts` | Slice branch lifecycle: create, checkout, merge, delete |
| `src/resources/extensions/gsd/worktree-manager.ts` | Git worktree lifecycle: create, list, diff, merge, remove |
| `src/resources/extensions/gsd/auto.ts` | Orchestrator: ensures branches at dispatch, merges after slice completion |
| `src/resources/extensions/gsd/session-forensics.ts` | Crash recovery: captures git state for session restoration |

### Branch Naming

| Context | Pattern | Example |
|---------|---------|---------|
| Slice branch (main tree) | `gsd/<milestoneId>/<sliceId>` | `gsd/M001/S01` |
| Slice branch (worktree) | `gsd/<worktreeName>/<milestoneId>/<sliceId>` | `gsd/alpha/M001/S01` |
| Worktree base branch | `worktree/<name>` | `worktree/alpha` |
| Regex for parsing | `^gsd\/(?:([a-zA-Z0-9_-]+)\/)?(M\d+)\/(S\d+)$` | — |

### Main Branch Detection

Priority chain in `getMainBranch()`:
1. `git symbolic-ref refs/remotes/origin/HEAD` → extract remote default
2. Check `refs/heads/main` exists → return `main`
3. Check `refs/heads/master` exists → return `master`
4. Fall back to `git branch --show-current`

When inside a worktree, returns `worktree/<name>` instead — prevents checkout conflicts with the real main.

### Commit Flow

#### Per-Task (on slice branch)

The `execute-task.md` prompt instructs the agent to:
```
git add -A && git commit -m 'feat(S01/T01): <what was built>'
```

#### Auto-Commit (safety net)

`autoCommitCurrentBranch()` in `worktree.ts` catches any uncommitted changes left by the agent:
```
chore(<unitId>): auto-commit after <unitType>
```

#### Pre-Checkout (dirty state protection)

`ensureSliceBranch()` auto-commits dirty files before `git checkout` to prevent "would be overwritten" errors:
```
chore: auto-commit before switching to gsd/M001/S02
```

#### Squash Merge to Main

`mergeSliceToMain()` in `worktree.ts`:
```
git checkout main
git merge --squash gsd/M001/S01
git commit -m 'feat(M001/S01): <slice title>'
git branch -D gsd/M001/S01
```

#### Worktree Merge to Main

`mergeWorktreeToMain()` in `worktree-manager.ts` — same squash pattern but LLM-guided via `worktree-merge.md` prompt.

### Merge Guard (Existing)

`auto.ts` lines ~971-1002 implement a **general merge guard**: before dispatching the next unit, it checks if the current branch is a completed slice branch (roadmap checkbox `[x]`), and if so, merges to main first. This handles:
- Normal complete-slice → merge flow
- Agent writing summary during task execution (skipping complete-slice)
- Doctor post-hook marking everything done
- complete-milestone running while on a slice branch

### What Happens on Main

```
feat(M001/S03): milestone and slice discuss commands
feat(M001/S02): extension scaffold and command routing
feat(M001/S01): file I/O foundation
```

One commit per slice. Reads like a changelog. Individually revertable.

### What Happens on the Branch

```
gsd/M001/S01:
  feat(gsd): complete S01
  feat(S01/T03): file writer with round-trip fidelity
  feat(S01/T02): markdown parser for plan files
  feat(S01/T01): core types and interfaces
```

### What Does NOT Exist

| Capability | Status |
|-----------|--------|
| `git push` anywhere in codebase | **None** — zero remote operations |
| Build/test before merge to main | **None** — no pre-merge verification |
| Git preferences/config | **None** — no user-configurable git behavior |
| PR creation | **None** — local-only workflow |
| Branch preservation after merge | **Branches deleted** via `git branch -D` |
| Commit signing | **None** |
| Remote branch cleanup | **N/A** — no remote operations |
| Stash operations | **None** — auto-commit philosophy instead |
| Rebase operations | **None** — squash-only |

---

## Industry Best Practices (2025-2026)

### What Won: Trunk-Based Development

The industry converged. GitFlow is dead for anything shipping continuously. The dominant pattern is **trunk-based development with short-lived feature branches**:

- **Stripe**: trunk-based, branches live < 1 day, deploy hundreds of times daily
- **Linear**: trunk-based with feature branches, squash merge, deploy on merge
- **Vercel**: trunk-based, preview deployments per branch, squash merge
- **Shopify**: trunk-based, merge queues, branches live hours not days
- **Google/Meta**: trunk-based (monorepo), continuous integration at head

**The pattern**: branch from main → work → squash merge back → main is always deployable.

GSD2 already implements this pattern. The slice branch lifecycle maps directly to "short-lived feature branch."

### Agentic Coding Git Patterns

AI coding tools in 2025-2026 handle git in three tiers:

| Tier | Tools | Pattern |
|------|-------|---------|
| No git | Most Cursor/Copilot inline | Agent writes code, user manages git |
| Auto-commit | Aider, some Cursor agents | Agent commits after changes, user manages branches |
| Full lifecycle | Devin, Copilot Workspace, GSD2 | Agent manages branches, commits, merges |

**GSD2 is in the top tier.** The branch-per-slice + squash merge pattern is more sophisticated than what most agentic tools offer.

Emerging patterns in the agentic space:
- **Isolated workspaces**: agents work in branches/worktrees to avoid polluting main (GSD2 does this)
- **Atomic commits per logical unit**: not per file save, but per completed task (GSD2 does this)
- **Squash on merge**: keep main clean, preserve detail in branches (GSD2 does this)
- **Pre-merge verification**: run tests before merging to main (GSD2 does NOT do this)
- **Remote backup**: push branches for safety/visibility (GSD2 does NOT do this)

### Commit Hygiene Best Practices

**Conventional Commits** remain the standard. The `type(scope): description` format enables:
- Automated changelog generation
- Semantic versioning
- Filtering history by type
- Machine-parseable commit logs

GSD2's commit format (`feat(S01/T01): <description>`) follows this convention.

**Squash merge is the consensus winner** for feature branches:
- Clean main history (one commit per logical change)
- Individually revertable features
- Supports `git bisect` at the feature level
- Branch history preserved for drill-down (if branches kept)

**What makes commits useful for debugging:**
- Each commit on main compiles and passes tests (bisectable)
- Commit messages explain "what" at the title, "why" in the body
- Scope tags enable filtering (`git log --grep='M001'`)
- Revert path is clear (one commit = one feature)

### Branch Protection for Solo/Small Teams

Enterprise branch protection (required reviewers, status checks, signed commits) is theater for solo developers. The minimum viable protection:

1. **Never commit directly to main** — always branch first (GSD2 enforces this)
2. **Verify before merge** — run build/tests before merging (GSD2 does NOT do this)
3. **Preserve revert path** — squash merge so each feature is one revert (GSD2 does this)
4. **Backup to remote** — push branches for safety (GSD2 does NOT do this)

---

## Gap Analysis

### Critical Gaps

#### 1. No Pre-Merge Verification

**Risk: main can break silently.**

`mergeSliceToMain()` does a blind squash merge. If the slice introduced a build failure, type error, or test regression, main is now broken. The merge guard in `auto.ts` checks that the roadmap checkbox is `[x]`, but that's a GSD-level check, not a code-level check.

The `complete-slice.md` prompt tells the agent to "run all slice-level verification checks," but:
- The agent might skip or miss checks
- Verification is prompt-level, not code-level
- No programmatic enforcement that the merge is safe

**Impact**: A broken main means every subsequent slice branches from broken code. Cascading failures.

#### 2. No Remote Operations

**Risk: work loss on machine failure.**

Zero `git push` commands exist in the codebase. A milestone of work (hours of agent execution, potentially significant cost) exists only on the local machine. Disk failure, accidental `rm -rf`, or OS crash = total loss.

**Impact**: For vibe coders this is fine (they don't think about it). For senior engineers, this is negligent.

#### 3. Branch Deletion After Merge

**Risk: loss of per-task history.**

`mergeSliceToMain()` calls `git branch -D` after squash merge. This destroys the per-task commit history that the GSD-WORKFLOW.md documentation promises is "preserved for per-task history."

The branch history is the only place to see what happened at task granularity. Once deleted, `git bisect` within a slice is impossible.

**Impact**: Debugging a regression within a slice requires re-reading task summaries instead of using git's built-in tools.

#### 4. No Git Configuration Surface

**Risk: one-size-fits-all doesn't fit all.**

GSD2's preferences system (`preferences.ts`) has zero git-related options. Users cannot configure:
- Whether to push to remote
- Whether to run tests before merge
- Whether to preserve or delete branches
- Whether to create PRs
- Commit message format preferences

### Minor Gaps

#### 5. Squash Commit Messages Lack Body

Current: `feat(M001/S01): <slice title>`

Missing: no commit body with task list, no branch reference for drill-down, no link between the squash commit and the detailed branch history.

#### 6. No Tag/Release Support

Milestone completion doesn't create git tags. Tags are the standard way to mark releases and enable `git describe` for version derivation.

#### 7. Worktree Merge Has No Conflict Resolution Strategy

`mergeWorktreeToMain()` does `git merge --squash` but doesn't handle merge conflicts programmatically. If the LLM-guided merge prompt fails, the user is stuck.

#### 8. No `git stash` as Alternative to Auto-Commit

Auto-commit before checkout creates noise commits (`chore: auto-commit before switching`). `git stash` would be cleaner for temporary state preservation, but auto-commit is more reliable in agentic contexts where the agent might not pop the stash. This is a defensible design choice, not a bug.

---

## Recommendations

### Priority 1: Merge Guards (Pre-Merge Verification)

**What**: Before squash-merging a slice to main, run a configurable verification command. If it fails, abort the merge.

**Why**: This is the single highest-value change. It turns "main is usually clean" into "main is always clean" as a programmatic guarantee.

**How**:
- Add `git.merge_guard` to preferences (default: auto-detect)
- Auto-detect: look for `package.json` scripts (`test`, `build`, `typecheck`), `Makefile`, `Cargo.toml`, etc.
- Before committing the squash merge, run the verification command
- On failure: `git reset --hard HEAD` to undo the staged squash, report the failure, let the agent fix on the slice branch

**Default behavior**: If a project has a test/build command, run it. If not, skip (zero friction for vibe coders with no tests).

### Priority 2: Stop Deleting Branches

**What**: Remove the `git branch -D` call from `mergeSliceToMain()`.

**Why**: One-line change. Preserves per-task history for debugging. Git branches are ~41 bytes of overhead.

**How**: Delete the `runGit(basePath, ["branch", "-D", branch])` line in `mergeSliceToMain()`. Add a cleanup command (`/gsd:cleanup-branches`) for users who want to prune old branches manually.

### Priority 3: Richer Squash Commit Messages

**What**: Include a commit body with task list and branch reference.

**Why**: Makes `git log` on main self-documenting. Anyone can find the detailed history.

**How**: Change the squash commit format to:

```
feat(M001/S01): <slice title>

<slice demo sentence from roadmap>

Tasks:
- T01: <title>
- T02: <title>
- T03: <title>

Branch: gsd/M001/S01
```

### Priority 4: Optional Remote Push

**What**: Add `git.auto_push` preference. When enabled, push to remote after merging to main.

**Why**: Backup and visibility. Senior engineers expect their work to survive machine failure. Team workflows need remote branches for collaboration.

**How**:
- Add to preferences: `git.auto_push: boolean` (default: `false`)
- Add to preferences: `git.push_branches: boolean` (default: `false`) — push slice branches during work
- After `mergeSliceToMain()`, if enabled: `git push origin main`
- If `push_branches` enabled: push slice branch before merge (backup), delete remote branch after merge

**User experience**: Vibe coders never see this. Senior engineers add one line to their preferences file.

### Priority 5: Git Tags on Milestone Completion

**What**: Create a git tag when a milestone completes.

**Why**: Standard release marking. Enables `git describe`, changelog generation, and clear "this is v1.0" markers.

**How**: On milestone completion: `git tag -a M001 -m "Milestone M001: <title>"`. Optionally push tags if `auto_push` is enabled.

### Priority 6: PR Creation on Milestone Complete

**What**: Add `git.create_pr` preference. When enabled, create a GitHub PR on milestone completion.

**Why**: For team workflows where code needs review before shipping. Also useful for solo devs who want a PR as a documentation artifact.

**How**: Use `gh pr create` (GitHub CLI). Only available when `gh` is installed and authenticated. Graceful fallback: skip if `gh` isn't available.

### Not Recommended

| Suggestion | Why Not |
|-----------|---------|
| GPG commit signing | Adds friction, zero value for agentic workflows |
| Rebase workflows | Squash merge is cleaner, simpler, and the industry standard for feature branches |
| Branch protection rules | The agent IS the protection — merge guards are the programmatic equivalent |
| CI/CD integration | Deployment is the user's concern, not GSD's. Merge guards cover the "is it broken?" question. |
| Interactive rebase | Requires human intervention, antithetical to agentic workflow |
| Commit hooks (husky/lint-staged) | The agent runs verification explicitly — hooks add complexity without value in agentic context |
| Monorepo tooling (nx, turborepo) | Out of scope — GSD manages work, not build systems |

---

## Implementation Spec

### Preferences Schema Addition

```typescript
interface GSDGitPreferences {
  /** Run build/test before merging slice to main. Default: "auto" (detect from project). */
  merge_guard?: "auto" | "always" | "never" | string; // string = custom command

  /** Push main to remote after slice merge. Default: false. */
  auto_push?: boolean;

  /** Push slice branches to remote during work (backup). Default: false. */
  push_branches?: boolean;

  /** Remote name. Default: "origin". */
  remote?: string;

  /** Preserve slice branches after merge. Default: true. */
  preserve_branches?: boolean;

  /** Create git tag on milestone completion. Default: true. */
  tag_milestones?: boolean;

  /** Create GitHub PR on milestone completion. Default: false. */
  create_pr?: boolean;
}
```

### Merge Guard Implementation

```typescript
// In worktree.ts, modify mergeSliceToMain():

export function mergeSliceToMain(
  basePath: string, milestoneId: string, sliceId: string,
  sliceTitle: string, options?: { mergeGuard?: string }
): MergeSliceResult {
  const branch = getSliceBranchName(milestoneId, sliceId, detectWorktreeName(basePath));
  const mainBranch = getMainBranch(basePath);

  // ... existing checks ...

  // Squash merge (stages changes, does not commit yet)
  runGit(basePath, ["merge", "--squash", branch]);

  // ── Merge guard: verify before committing ──
  if (options?.mergeGuard) {
    try {
      execSync(options.mergeGuard, { cwd: basePath, stdio: "pipe", timeout: 120_000 });
    } catch (error) {
      // Abort: undo the staged squash
      runGit(basePath, ["reset", "--hard", "HEAD"]);
      throw new MergeGuardError(
        `Merge guard failed for ${branch}. Main is unchanged. ` +
        `Fix the issue on the slice branch and retry.`,
        error
      );
    }
  }

  // Commit the squash merge
  const message = buildSquashMessage(milestoneId, sliceId, sliceTitle, basePath);
  runGit(basePath, ["commit", "-m", message]);

  // Optionally preserve the branch
  if (options?.preserveBranch !== true) {
    runGit(basePath, ["branch", "-D", branch]);
  }

  return { branch, mergedCommitMessage: message, deletedBranch: !options?.preserveBranch };
}
```

### Auto-Detect Merge Guard Command

```typescript
function detectMergeGuardCommand(basePath: string): string | null {
  // Check package.json
  const pkgPath = join(basePath, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const scripts = pkg.scripts ?? {};
    // Prefer typecheck + test, fall back to test only, fall back to build
    if (scripts.typecheck && scripts.test) return "npm run typecheck && npm run test";
    if (scripts.test) return "npm run test";
    if (scripts.build) return "npm run build";
  }

  // Check Cargo.toml
  if (existsSync(join(basePath, "Cargo.toml"))) return "cargo test";

  // Check Makefile
  if (existsSync(join(basePath, "Makefile"))) return "make test";

  // Check pyproject.toml
  if (existsSync(join(basePath, "pyproject.toml"))) return "python -m pytest";

  // No detectable test command
  return null;
}
```

### Richer Squash Commit Message

```typescript
function buildSquashMessage(
  milestoneId: string, sliceId: string, sliceTitle: string, basePath: string
): string {
  const branch = getSliceBranchName(milestoneId, sliceId, detectWorktreeName(basePath));

  // Collect task commit messages from the branch
  const log = runGit(basePath, [
    "log", "--oneline", `${getMainBranch(basePath)}..${branch}`,
  ], { allowFailure: true });

  const taskLines = log
    .split("\n")
    .filter(line => line.includes("feat(") && line.includes("/T"))
    .map(line => {
      const match = line.match(/feat\([^)]*\/(T\d+)\):\s*(.*)/);
      return match ? `- ${match[1]}: ${match[2]}` : null;
    })
    .filter(Boolean);

  let message = `feat(${milestoneId}/${sliceId}): ${sliceTitle}`;

  if (taskLines.length > 0) {
    message += `\n\nTasks:\n${taskLines.join("\n")}`;
  }

  message += `\n\nBranch: ${branch}`;

  return message;
}
```

### Remote Push Integration

```typescript
// After mergeSliceToMain() in auto.ts:
if (gitPrefs.auto_push) {
  const remote = gitPrefs.remote ?? "origin";
  const mainBranch = getMainBranch(basePath);
  runGit(basePath, ["push", remote, mainBranch], { allowFailure: true });
}

// During slice execution (if push_branches enabled):
if (gitPrefs.push_branches) {
  const remote = gitPrefs.remote ?? "origin";
  runGit(basePath, ["push", "-u", remote, branch], { allowFailure: true });
}

// After merge + push (clean up remote branch):
if (gitPrefs.push_branches && !gitPrefs.preserve_branches) {
  const remote = gitPrefs.remote ?? "origin";
  runGit(basePath, ["push", remote, "--delete", branch], { allowFailure: true });
}
```

### Milestone Tags

```typescript
// On milestone completion (in complete-milestone flow):
function tagMilestone(basePath: string, milestoneId: string, title: string) {
  const tagName = milestoneId; // e.g., "M001"
  const message = `Milestone ${milestoneId}: ${title}`;
  runGit(basePath, ["tag", "-a", tagName, "-m", message]);

  if (gitPrefs.auto_push) {
    const remote = gitPrefs.remote ?? "origin";
    runGit(basePath, ["push", remote, tagName], { allowFailure: true });
  }
}
```

---

## User Experience Design

### The Two Personas

#### Vibe Coder (Default — Zero Config)

Experiences:
- Branches created and merged automatically (invisible)
- Main always has clean, readable history
- Per-task commits preserved on branches (they'll never look, but it's there)
- Merge guard auto-detects tests and runs them (if tests exist)
- No remote operations (don't need a GitHub account)
- No configuration files to create or understand

Internal monologue: *"I just tell it what to build and it builds it. The git history looks clean when I do look at it."*

#### Senior Engineer (Opt-In Config)

Adds to `.gsd/preferences.yaml`:
```yaml
git:
  auto_push: true
  preserve_branches: true
  tag_milestones: true
```

Experiences:
- Everything the vibe coder gets, plus:
- Work pushed to remote after each slice merge (backup + visibility)
- Slice branches preserved for `git bisect` within a feature
- Milestone tags for release marking
- Squash commits with task-list bodies for `git log` browsing
- Can enable `create_pr: true` for PR-based workflows

Internal monologue: *"This is exactly what I would have done manually, but I didn't have to think about it."*

#### Team Lead (Full Config)

```yaml
git:
  auto_push: true
  push_branches: true
  preserve_branches: true
  tag_milestones: true
  create_pr: true
  merge_guard: "npm run typecheck && npm run test && npm run lint"
```

Experiences:
- Everything above, plus:
- Slice branches pushed to remote during work (visibility for team)
- PRs created on milestone completion (review gate)
- Custom merge guard command (team's CI requirements)

### Progressive Disclosure

1. **Install GSD2** → git workflow works automatically, no config needed
2. **Read docs** → learn that `git.auto_push` exists if you want remote backup
3. **Scale up** → discover `merge_guard`, `create_pr`, `tag_milestones` as needs grow

No user ever needs to understand the git strategy to benefit from it. The strategy is the default. Configuration is for those who want more.

---

## Appendix: Git Commands Used in GSD2

| Command | File | Purpose |
|---------|------|---------|
| `git worktree add -b` | worktree-manager.ts | Create worktree with branch |
| `git worktree list --porcelain` | worktree-manager.ts | List all worktrees |
| `git worktree remove --force` | worktree-manager.ts | Remove worktree |
| `git worktree prune` | worktree-manager.ts | Clean stale entries |
| `git branch <name> <base>` | worktree.ts | Create branch |
| `git branch -f` | worktree-manager.ts | Force reset branch |
| `git branch -D` | worktree.ts | Delete branch |
| `git branch --show-current` | worktree.ts | Get current branch |
| `git show-ref --verify` | worktree-manager.ts, worktree.ts | Check if ref exists |
| `git symbolic-ref refs/remotes/origin/HEAD` | worktree-manager.ts, worktree.ts | Detect remote default |
| `git checkout <branch>` | worktree.ts | Switch branch |
| `git merge --squash <branch>` | worktree-manager.ts, worktree.ts | Squash merge |
| `git commit -m` | worktree.ts, prompts | Create commit |
| `git add -A` | worktree.ts, execute-task.md | Stage all changes |
| `git diff --name-status` | worktree-manager.ts | List changed files |
| `git diff --numstat` | worktree-manager.ts | Line stats |
| `git diff <a>...<b>` | worktree-manager.ts | Three-way diff |
| `git log --oneline` | worktree-manager.ts | Commit history |
| `git rev-list --count` | worktree.ts | Count commits |
| `git status --short` | worktree.ts | Check dirty status |
| `git status --porcelain` | session-forensics.ts | Machine-readable status |
| `git diff --cached --stat` | worktree.ts | Staged changes summary |
| `git update-index --cacheinfo` | execute-task.md | Workaround for stat-cache bug |
| `git reset --hard` | GSD-WORKFLOW.md (documented) | Rollback to checkpoint |
| `git revert` | GSD-WORKFLOW.md (documented) | Revert squash commit on main |
