# GitHub Workflows Skill

> ⚠️ **WARNING**: GitHub Actions documentation changes frequently. Always fetch current docs rather than relying on training data for syntax, parameters, or version numbers.

---

## Primary Tool: ci_monitor.cjs

Use the CI monitor script for all workflow interactions:

```bash
node src/resources/skills/github-workflows/references/gh/scripts/ci_monitor.cjs <command>
```

### Run Monitoring Commands

| Command | Purpose |
|---------|---------|
| `fail-fast <run-id>` | Watch run, exit 1 on first job failure |
| `watch <run-id>` | Watch run with live status updates |
| `list-jobs <run-id>` | List all jobs in a run |
| `tail <run-id> <job-name> --lines 100` | Get last N lines of job log |
| `wait-for <run-id> <job> --keyword "..." --timeout 300` | Block until keyword appears |
| `analyze <run-id> <job-name>` | Pattern analysis for failures |
| `compare <run1> <run2>` | Compare job statuses between runs |
| `branch-runs <branch>` | List recent runs for branch |

### Workflow Analysis Commands (GraphQL)

| Command | Purpose |
|---------|---------|
| `list-workflows` | List all workflow files in .github/workflows |
| `check-actions [file]` | Check action versions against latest releases via GraphQL |

**Example: Check if actions are up-to-date**
```bash
node ci_monitor.cjs check-actions .github/workflows/ci.yml
```

This uses a single GraphQL query to fetch all action versions at once, comparing current versions in your workflow against latest releases.

---

## Task-Based Documentation Reference

**Fetch only what you need.** Each task requires specific documentation.

### Workflow Structure Tasks

| Task | What You Need | URL | Key Sections |
|------|--------------|-----|--------------|
| Create workflow file | Valid top-level keys (name, on, jobs, permissions) | workflow-syntax.md | "About YAML syntax", `name`, `on`, `jobs` |
| Set up triggers | Event types, filters (branches, paths, types) | workflow-syntax.md | `on` (single/multiple events, activity types, filters) |
| Add path/branch filtering | Glob patterns for branches, tags, paths | workflow-syntax.md | `on.<push/pull_request>.<branches/tags/paths>` |
| Schedule workflows | Cron syntax, timing | workflow-syntax.md | `on.schedule` |
| Create reusable workflow | Inputs, outputs, secrets for workflow_call | workflow-syntax.md | `on.workflow_call`, `on.workflow_call.inputs/outputs/secrets` |
| Manual trigger inputs | Input types (boolean, choice, string, number, environment) | workflow-syntax.md | `on.workflow_dispatch.inputs` |
| Set permissions | GITHUB_TOKEN scopes (actions, contents, issues, etc.) | workflow-syntax.md | `permissions` |
| Configure concurrency | Cancel-in-progress, concurrency groups | workflow-syntax.md | `concurrency` |
| Set defaults | Shell, working-directory for all run steps | workflow-syntax.md | `defaults.run` |

### Job and Step Tasks

| Task | What You Need | URL | Key Sections |
|------|--------------|-----|--------------|
| Define jobs | runs-on, needs, if, outputs, environment | workflow-syntax.md | `jobs.<job_id>` |
| Matrix strategy | include, exclude, fail-fast | workflow-syntax.md | `jobs.<job_id>.strategy` |
| Container/services | Docker containers, service containers | workflow-syntax.md | `jobs.<job_id>.container`, `jobs.<job_id>.services` |
| Step types | run, uses, with, env, if | workflow-syntax.md | `jobs.<job_id>.steps` |
| Job outputs | How to set and reference outputs | workflow-syntax.md | `jobs.<job_id>.outputs` |
| Timeout/continue-on-error | timeout-minutes, continue-on-error | workflow-syntax.md | `jobs.<job_id>.timeout-minutes` |

### Annotations and Output Tasks

| Task | What You Need | URL | Key Sections |
|------|--------------|-----|--------------|
| Add error/warning/notice | `::error::`, `::warning::`, `::notice::` syntax | workflow-commands.md | "Setting an error/warning/notice message" |
| Mask secrets in logs | `::add-mask::` command | workflow-commands.md | "Masking a value in a log" |
| Group log lines | `::group::` / `::endgroup::` | workflow-commands.md | "Grouping log lines" |
| Set output variables | GITHUB_OUTPUT file syntax | workflow-commands.md | "Environment files" → GITHUB_OUTPUT |
| Set env variables | GITHUB_ENV file syntax | workflow-commands.md | "Environment files" → GITHUB_ENV |
| Add to PATH | GITHUB_PATH file syntax | workflow-commands.md | "Environment files" → GITHUB_PATH |
| Step summary | GITHUB_STEP_SUMMARY for markdown | workflow-commands.md | "Environment files" → GITHUB_STEP_SUMMARY |

**Annotation parameters** (for error/warning/notice):
- `file` - filename
- `line`, `endLine` - line range
- `col`, `endColumn` - column range
- `title` - custom title

Example: `echo "::error file=app.js,line=1,col=5,endColumn=7,title=Syntax Error::Missing semicolon"`

### Expression and Context Tasks

| Task | What You Need | URL | Key Sections |
|------|--------------|-----|--------------|
| Write conditionals | Operators (==, &&, \|\|, !), comparison | expressions.md | "Operators" |
| String matching | contains(), startsWith(), endsWith() | expressions.md | "Functions" → contains, startsWith, endsWith |
| Type conversion | fromJSON(), toJSON() | expressions.md | "Functions" → fromJSON, toJSON |
| File hashing | hashFiles() for cache keys | expressions.md | "Functions" → hashFiles |
| Conditional logic | case() function (like switch) | expressions.md | "Functions" → case |
| Status checks | success(), failure(), always(), cancelled() | expressions.md | "Status check functions" |

| Task | What You Need | URL | Key Sections |
|------|--------------|-----|--------------|
| Access workflow info | github.ref, github.sha, github.event, github.actor | contexts.md | "github context" |
| Access job info | job.status, job.container | contexts.md | "job context" |
| Access step outputs | steps.<id>.outputs.<name> | contexts.md | "steps context" |
| Access runner info | runner.os, runner.arch, runner.temp | contexts.md | "runner context" |
| Access matrix values | matrix.<property> | contexts.md | "matrix context" |
| Access dependent job outputs | needs.<job_id>.outputs.<name> | contexts.md | "needs context" |
| Check context availability | Which contexts work where | contexts.md | "Context availability" table |

### Trigger Event Tasks

| Task | What You Need | URL | Key Sections |
|------|--------------|-----|--------------|
| Know available events | Full list of webhook events | events-that-trigger-workflows.md | Event tables (push, pull_request, workflow_dispatch, etc.) |
| Filter by activity type | Which events support `types:` filter | events-that-trigger-workflows.md | Activity types column in each event table |
| Know branch restrictions | Which events only run on default branch | events-that-trigger-workflows.md | "This event will only trigger..." notes |

---

## Action Version Verification

**Primary method: Use ci_monitor.cjs** (GraphQL-powered, fetches all at once)

```bash
node ci_monitor.cjs check-actions .github/workflows/ci.yml
```

Output shows: action name, latest release tag, current tag in file, and update status.

### Manual GraphQL Query (if needed)

For a single action:
```bash
gh api graphql -f query='
query {
  repository(owner: "actions", name: "checkout") {
    latestRelease { tagName }
  }
}'
```

For multiple actions in one query:
```bash
gh api graphql -f query='
query {
  checkout: repository(owner: "actions", name: "checkout") {
    latestRelease { tagName }
  }
  setupNode: repository(owner: "actions", name: "setup-node") {
    latestRelease { tagName }
  }
}'
```

### Query Action README for Usage

```bash
gh api graphql -f query='
query {
  repository(owner: "actions", name: "setup-node") {
    object(expression: "HEAD:README.md") {
      ... on Blob { text }
    }
  }
}' --jq '.data.repository.object.text' | head -100
```

---

## Node.js Version Verification

Fetch current LTS versions from nodejs.org API:

```bash
curl -s https://nodejs.org/dist/index.json | jq '[.[] | select(.lts != false) | {version: .version, lts: .lts}] | .[0:2]'
```

Returns current and active LTS versions.

---

## Process: Create New Workflow

### Step 1: Identify What Information You Need

Ask: What am I building? (CI pipeline, deployment, scheduled task, reusable workflow?)

### Step 2: Fetch Only Required Documentation

```bash
# Example: Creating a CI workflow with triggers and job structure
fetch_page https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax.md
# Read sections: `on` (for push/pull_request), `jobs`, `steps`, `runs-on`
```

### Step 3: Verify Action Versions with GraphQL

```bash
gh api graphql -f query='...'
```

### Step 4: Write Workflow

Use verified versions and fetched syntax only.

### Step 5: Validate

- [ ] Action versions from GraphQL query
- [ ] Syntax from fetched documentation (not training data)
- [ ] Permissions are minimum required
- [ ] Secrets properly referenced

---

## Process: Debug Failed Workflow

### Step 1: List Recent Runs

```bash
node ci_monitor.cjs branch-runs main --limit 5
```

### Step 2: Analyze Failed Run

```bash
node ci_monitor.cjs analyze <run-id> <failed-job-name>
```

This extracts error patterns:
- Errors (`error:`)
- NPM errors (`npm ERR!`)
- TypeScript errors (`error TS`)
- Timeout issues
- Out of memory
- Network failures

### Step 3: Get Full Logs

```bash
node ci_monitor.cjs tail <run-id> <job-name> --lines 500
```

### Step 4: Compare with Successful Run

```bash
node ci_monitor.cjs compare <failed-run-id> <successful-run-id>
```

Shows which jobs changed status between runs.

---

## Process: Watch Running Workflow

### Step 1: Get Run ID

```bash
gh run list --limit 3
```

### Step 2: Watch with Fail-Fast

```bash
node ci_monitor.cjs fail-fast <run-id> --interval 5
```

Exits with code 1 on first failure - useful in scripts.

### Step 3: Or Watch Continuously

```bash
node ci_monitor.cjs watch <run-id> --interval 10
```

---

## Process: Wait for Specific Output

Block until a keyword appears in job logs:

```bash
# Wait for "Build succeeded" with 5 minute timeout
node ci_monitor.cjs wait-for <run-id> build --keyword "Build succeeded" --timeout 300
```

---

## Definition of Done

### For Workflow Creation/Modification

1. **Install actionlint if needed**
   ```bash
   which actionlint || bash <(curl -s https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash) latest ~/.local/bin
   export PATH="$HOME/.local/bin:$PATH"
   ```

2. **Validate syntax**
   ```bash
   actionlint .github/workflows/<workflow-name>.yml
   # No output = no errors
   ```

3. **Check actions are current**
   ```bash
   node ci_monitor.cjs check-actions .github/workflows/<workflow-name>.yml
   ```

4. **Demonstrate workflow runs**
   ```bash
   # Trigger if workflow_dispatch
   gh workflow run <workflow-name>
   
   # Watch the run
   node ci_monitor.cjs watch <run-id>
   ```

5. **Show all jobs pass**
   ```bash
   node ci_monitor.cjs list-jobs <run-id>
   # Expected: All jobs show ✅ success
   ```

### For Workflow Debugging

1. **List workflows**
   ```bash
   node ci_monitor.cjs list-workflows
   ```

2. **Analyze failures**
   ```bash
   node ci_monitor.cjs analyze <run-id> <job-name>
   ```

3. **Compare with successful run**
   ```bash
   node ci_monitor.cjs compare <failed-run-id> <successful-run-id>
   ```

### Checklist: Definition of Done

- [ ] Documentation fetched has `.md` suffix
- [ ] Only relevant documentation sections read (not entire pages)
- [ ] Action versions from GraphQL query (not training data)
- [ ] Workflow syntax validated
- [ ] Actions checked with `ci_monitor.cjs check-actions`
- [ ] Workflow runs successfully (or analysis demonstrated)
- [ ] Output report includes sources

---

## Output Template

```markdown
## Verification Report

### Task
{task description}

### Documentation Fetched
| What I Needed | URL | Section Read |
|--------------|-----|--------------|
| {e.g., trigger syntax} | {url.md} | {section name} |

### Actions Verified (GraphQL)
| Action | Latest Version |
|--------|----------------|
| actions/checkout | v4 |
| actions/setup-node | v4 |

### Node.js
| Item | Version | Source |
|------|---------|--------|
| Current LTS | {version} | nodejs.org API |
| Repo Requires | {version} | package.json |
```

---

## Reference: gh CLI Skill

See `references/gh/SKILL.md` for gh CLI commands and setup instructions.
