import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

export default function githubWorkflowsCommand(pi: ExtensionAPI) {
	pi.registerCommand("github-workflows", {
		description: "Create, audit, or modernize GitHub Actions workflows using current documentation (not training data)",
		async handler(args: string, ctx: ExtensionCommandContext) {
			// ── Step 1: Determine the task type ───────────────────────────────────

			let task = (typeof args === "string" ? args : "").trim();

			if (!task) {
				const choice = await ctx.ui.select(
					"What would you like to do?",
					[
						"Analyze recent workflow runs",
						"Create a new workflow",
						"Audit existing workflows",
						"Modernize outdated workflows",
						"Check action versions",
						"Set up Dependabot for actions",
					],
				);
				if (!choice) {
					ctx.ui.notify("github-workflows: No task selected — cancelled.", "error");
					return;
				}
				task = choice;
			}

			// ── Step 2: Build the prompt based on task ────────────────────────────

			const skillPath = "src/resources/skills/github-workflows/SKILL.md";

			let prompt: string;

			if (task.toLowerCase().includes("analyze") || task.toLowerCase().includes("runs")) {
				prompt = `Use the github-workflows skill to analyze recent workflow runs and identify issues.

**Skill location**: ${skillPath}

## Your Task

1. **Read the skill** at \`${skillPath}\` to understand the analysis process
2. **List recent runs** using \`gh run list --limit 20\`
3. **Identify failures** using \`gh run list --status failure --limit 10\`
4. **View logs for failures** using \`gh run view <id> --log\`
5. **Look for patterns**:
   - Repeated failures in same workflow/job
   - Error messages in logs
   - Timing issues (timeouts, race conditions)
   - Missing annotations (errors that should use \`::error::\` syntax)
6. **Suggest improvements** for:
   - Better error annotations using workflow commands
   - Warning visibility in Actions UI
   - Log grouping for readability
   - Masking sensitive output
7. **Output a report** with findings and recommendations

**Critical**: Use \`gh\` CLI for all GitHub interactions. Fetch workflow-commands.md documentation for annotation syntax.`;
			} else if (task.toLowerCase().includes("audit")) {
				prompt = `Use the github-workflows skill to audit existing GitHub Actions workflows in this repository.

**Skill location**: ${skillPath}

## Your Task

1. **Read the skill** at \`${skillPath}\` to understand the verification process
2. **Discover workflows** — find all files in \`.github/workflows/\`
3. **For each action used** — fetch current version from GitHub API and compare
4. **Verify syntax** — fetch current documentation from the URLs in the skill
5. **Check Node.js version** — fetch current LTS from nodejs.org
6. **Check security** — permissions, secrets handling, etc.
7. **Output a verification report** using the template from the skill

**Critical**: Do NOT use training data for action versions, syntax, or best practices. Fetch everything from the sources specified in the skill.`;
			} else if (task.toLowerCase().includes("create") || task.toLowerCase().includes("new")) {
				prompt = `Use the github-workflows skill to create a new GitHub Actions workflow for this repository.

**Skill location**: ${skillPath}

## Your Task

1. **Read the skill** at \`${skillPath}\` to understand the verification process
2. **Understand the repo** — check package.json for build/test scripts, Node version requirements
3. **Fetch current documentation** — use the URLs in the skill for syntax, triggers, contexts
4. **For each action needed** — fetch current version from GitHub API, read the README
5. **Write the workflow** to \`.github/workflows/\` using verified versions and syntax only
6. **Verify** — check against the validation checklist in the skill

**Critical**: Do NOT use training data for action versions, syntax, or best practices. Fetch everything from the sources specified in the skill.`;
			} else if (task.toLowerCase().includes("modernize") || task.toLowerCase().includes("update")) {
				prompt = `Use the github-workflows skill to modernize outdated GitHub Actions workflows.

**Skill location**: ${skillPath}

## Your Task

1. **Read the skill** at \`${skillPath}\` to understand the verification process
2. **Discover workflows** — find all files in \`.github/workflows/\`
3. **For each action** — fetch current version from GitHub API, check changelog for breaking changes
4. **Check Node.js** — fetch current LTS from nodejs.org, compare to workflow versions
5. **Update workflows** — apply modern versions and patterns
6. **Add missing features** — caching, permissions, concurrency, Dependabot config

**Critical**: Do NOT use training data for action versions, syntax, or best practices. Fetch everything from the sources specified in the skill.`;
			} else if (task.toLowerCase().includes("version") || task.toLowerCase().includes("check")) {
				prompt = `Use the github-workflows skill to check current action versions used in this repository.

**Skill location**: ${skillPath}

## Your Task

1. **Read the skill** at \`${skillPath}\` to understand the verification process
2. **Extract all actions** from \`.github/workflows/*.yml\` files
3. **For each action** — fetch current version using \`gh api repos/{owner}/{repo}/releases/latest --jq '.tag_name'\`
4. **Compare** — list current vs latest for each action
5. **Check changelogs** — note any breaking changes for outdated actions
6. **Output a report** showing what needs updating

**Critical**: Do NOT use training data for action versions. Use \`gh\` CLI to fetch from GitHub API.`;
			} else if (task.toLowerCase().includes("dependabot")) {
				prompt = `Use the github-workflows skill to set up Dependabot for GitHub Actions.

**Skill location**: ${skillPath}

## Your Task

1. **Read the skill** at \`${skillPath}\` to understand Dependabot configuration
2. **Check for existing** \`.github/dependabot.yml\`
3. **Fetch current Dependabot docs** if needed for syntax
4. **Create or update** \`.github/dependabot.yml\` with github-actions ecosystem
5. **Configure** — weekly updates, appropriate labels

**Critical**: Do NOT use training data for Dependabot syntax. Fetch current documentation.`;
			} else {
				// Generic task - pass through to skill
				prompt = `Use the github-workflows skill to help with: ${task}

**Skill location**: ${skillPath}

## Your Task

1. **Read the skill** at \`${skillPath}\` to understand the verification process
2. **Apply the appropriate process** from the skill for the task
3. **Always fetch current documentation** from the URLs in the skill — never use training data

**Critical**: Do NOT use training data for action versions, syntax, or best practices. Fetch everything from the sources specified in the skill.`;
			}

			// ── Step 3: Send the prompt to the agent ──────────────────────────────

			ctx.ui.notify(`Starting: ${task}`, "info");
			pi.sendUserMessage(prompt);
		},
	});
}
