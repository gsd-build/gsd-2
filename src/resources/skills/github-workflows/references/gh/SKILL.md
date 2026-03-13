---
name: gh
description: "Install and configure the GitHub CLI (gh) for AI agent environments where gh may not be pre-installed and git remotes use local proxies instead of github.com. Provides auto-install script with SHA256 verification and GITHUB_TOKEN auth with anonymous fallback. Use when gh command not found, shutil.which(\"gh\") returns None, need GitHub API access (issues, PRs, releases, workflow runs), or repository operations fail with \"failed to determine base repo\" error. Documents required -R flag for all gh commands in proxy environments. Includes project management: GitHub Projects V2 (gh project), milestones (REST API), issue stories (lifecycle and templates), and label taxonomy management."
---
# GitHub CLI (gh) — Setup and Usage

## Purpose

Ensures the GitHub CLI (`gh`) is available and provides correct usage patterns for AI agents operating in environments where `gh` may not be pre-installed and where git remotes point to local proxies instead of `github.com`.

## When to Use

- `gh` command not found or `shutil.which("gh")` returns None
- Need to interact with GitHub API (issues, PRs, releases, workflows)
- Repository remote does not point to `github.com` (proxy environments)
- Need authenticated GitHub operations with `GITHUB_TOKEN`
- Managing GitHub Issues, Projects V2, Milestones, or Labels

---

## Installation

If `gh` is not installed, run the setup script:

```bash
# Python version
uv run src/resources/skills/github-workflows/references/gh/scripts/setup_gh.py

# Node.js version
node src/resources/skills/github-workflows/references/gh/scripts/setup_gh.cjs
```

The script:

1. Checks if `gh` is already installed via `shutil.which`
2. Detects platform (Linux, macOS, Windows) and architecture
3. Fetches the latest release from `https://github.com/cli/cli/releases/latest`
4. Downloads the correct archive with SHA256 verification from checksums file
5. Extracts and installs the binary to a writable PATH directory
6. Uses `GITHUB_TOKEN` for authenticated requests; falls back to anonymous if auth fails (401/403)

**CLI options:**

```text
--force     Reinstall even if already at latest version
--dry-run   Show what would happen without installing
--bin-dir   Override install directory (default: auto-detect from PATH)
```

---

## Authentication

`GITHUB_TOKEN` environment variable provides automatic authentication. No manual `gh auth login` needed.

```bash
# Verify authentication
gh auth status
```

If `GITHUB_TOKEN` is set, `gh` authenticates automatically for all API calls.

---

## Repository Detection

<repo_detection>

Git remote points to a local proxy (`127.0.0.1`), NOT `github.com`. Every `gh` command fails without explicit repo specification:

```text
failed to determine base repo: none of the git remotes configured for this
repository point to a known GitHub host.
```

**RULE: Pass `-R` (or `--repo`) on EVERY `gh` command:**

```bash
gh <command> -R gsd-build/gsd-2
```

This applies to ALL `gh` subcommands: `pr`, `issue`, `run`, `api`, `release`, `project`, etc.

</repo_detection>

---

## Common Commands (v2.87.0)

<gh_commands>

### Pull Requests

```bash
# List open PRs
gh pr list -R gsd-build/gsd-2

# View PR details
gh pr view <number> -R gsd-build/gsd-2

# Check PR CI status
gh pr checks <number> -R gsd-build/gsd-2

# Create PR
gh pr create -R gsd-build/gsd-2 --title "title" --body "body"

# View PR comments
gh api repos/gsd-build/gsd-2/pulls/<number>/comments
```

### Issues

```bash
# List issues
gh issue list -R gsd-build/gsd-2

# List by label
gh issue list -R gsd-build/gsd-2 --label "priority:p1" --state open

# Create issue with labels and milestone
gh issue create -R gsd-build/gsd-2 \
  --title "feat: add feature X" \
  --label "priority:p1" --label "type:feature" \
  --milestone "v1.0"

# View issue
gh issue view <number> -R gsd-build/gsd-2

# Close issue with comment
gh issue close <number> -R gsd-build/gsd-2 --comment "Implemented in PR #N"

# Edit labels on issue
gh issue edit <number> -R gsd-build/gsd-2 \
  --add-label "status:in-progress" \
  --remove-label "status:needs-grooming"
```

### Labels

```bash
# List all labels
gh label list -R gsd-build/gsd-2

# Create label
gh label create "priority:p1" --color "E99695" \
  --description "High priority" -R gsd-build/gsd-2
```

See [labels.md](./references/labels.md) for the full taxonomy and color codes.

### Projects V2

```bash
# List projects
gh project list --owner gsd-build

# Create project
gh project create --owner gsd-build --title "gsd-2 Backlog"

# Add issue to project
gh project item-add 1 --owner gsd-build \
  --url https://github.com/gsd-build/gsd-2/issues/42
```

See [projects-v2.md](./references/projects-v2.md) for field creation and item editing commands.

### Milestones

`gh` has no native `milestone` subcommand — use `gh api` with the REST endpoint:

```bash
# List milestones
gh api repos/gsd-build/gsd-2/milestones

# Create milestone
gh api repos/gsd-build/gsd-2/milestones \
  -X POST -f title="v1.0" -f due_on="2026-03-31T00:00:00Z"

# Assign milestone to issue
gh api repos/gsd-build/gsd-2/issues/42 \
  -X PATCH -F milestone=1
```

See [milestones.md](./references/milestones.md) for full CRUD reference.

### Workflow Runs

```bash
# List recent runs
gh run list -R gsd-build/gsd-2 --limit 5

# View specific run
gh run view <run-id> -R gsd-build/gsd-2

# View failed job logs
gh run view <run-id> -R gsd-build/gsd-2 --log-failed
```

### Releases

```bash
# List releases
gh release list -R gsd-build/gsd-2

# View latest release
gh release view --repo gsd-build/gsd-2
```

### API (Direct)

```bash
# GET request
gh api repos/gsd-build/gsd-2

# POST with fields
gh api repos/gsd-build/gsd-2/issues -f title="Bug" -f body="Details"

# GraphQL
gh api graphql -f query='{ viewer { login } }'

# Paginated results
gh api repos/gsd-build/gsd-2/contributors --paginate
```

### Repository

```bash
# Clone
gh repo clone gsd-build/gsd-2

# View repo info
gh repo view -R gsd-build/gsd-2
```

</gh_commands>

---

## Output Formatting

```bash
# JSON output
gh pr list -R gsd-build/gsd-2 --json number,title,state

# JQ filtering
gh pr list -R gsd-build/gsd-2 --json number,title --jq '.[].title'

# Template formatting
gh pr list -R gsd-build/gsd-2 --json number,title \
  --template '{{range .}}#{{.number}} {{.title}}{{"\n"}}{{end}}'
```

---

## Reference Files

- [labels.md](./references/labels.md) — Label taxonomy (priority, type, status), color codes, bulk setup
- [milestones.md](./references/milestones.md) — Milestone CRUD via REST API, naming conventions
- [projects-v2.md](./references/projects-v2.md) — GitHub Projects V2 commands, custom fields, GraphQL queries
- [issue-stories.md](./references/issue-stories.md) — Issue as story format, body template, lifecycle, backlog item field mapping

---

## Sources

- [GitHub CLI Manual](https://cli.github.com/manual) — official reference
- [GitHub CLI Releases](https://github.com/cli/cli/releases) — binary downloads
- [GitHub REST API — Issues](https://docs.github.com/en/rest/issues) — milestones, labels, issues
- [GitHub Projects V2 API](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects) — GraphQL API
- `gh version 2.87.2 (2026-02-20)` — version verified by installation test