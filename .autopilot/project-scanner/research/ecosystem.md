// [Project Scanner - Ecosystem Research]
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

# Ecosystem Research

## Repo Profile

- Project type: coding-agent monorepo with a TypeScript CLI/TUI, Rust native engine, bundled extensions, and a VS Code extension.
- Primary stack: Node 20+, TypeScript ESM, Rust/N-API, Playwright, SQL.js, Octokit.
- Maturity: growth-to-mature. The repo has strong product breadth and a non-trivial release pipeline, but several user-facing and CI surfaces are still uneven.

## Relevant Current Market Baseline

- GitHub Copilot now ships first-class code review workflows: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review
- Cursor ships Bugbot and background agents as first-class surfaces: https://docs.cursor.com/bugbot and https://docs.cursor.com/en/background-agents
- VS Code 1.104 added changed-files review and follow-up agent workflows inside the editor: https://code.visualstudio.com/updates/v1_104
- Claude Code exposes slash-command-driven workflows and review-style entry points: https://docs.anthropic.com/en/docs/claude-code/slash-commands

## Observed Positioning

- GSD is stronger than most competitors on disk-backed orchestration, worktree isolation, crash recovery, milestone planning, and local autonomy.
- GSD is weaker than the current market on first-class review ergonomics, IDE-native changed-file review, and polished human-in-the-loop approval surfaces.
- GSD has substantial hidden capability through Pi and bundled extensions, but some of that capability is weakly surfaced in the product.

## External Trend Implications

### 1. Review workflows are now table stakes

- Competitors do not treat review as a hidden hook or generic prompt. They expose explicit review actions, PR flows, and changed-file review surfaces.
- Implication for GSD: `github-client.ts` plumbing exists, but there is no surfaced `/gsd review` or PR review workflow in `src/resources/extensions/gsd/commands.ts`.

### 2. Background execution needs paired observability

- Cursor and VS Code both pair background/agent execution with follow-up or changed-file review UX.
- Implication for GSD: the CLI visualizer is strong, but the VS Code extension only exposes connection, model, token, and quick-action status.

### 3. Approval modes are increasingly explicit

- Competing tools make permission posture legible to the user through approval/review modes instead of burying behavior in defaults.
- Implication for GSD: headless mode has a useful supervised path in code, but the default auto-responder silently selects the first option or confirms actions.

## Strategic Read

- GSD should continue differentiating on end-to-end autonomous project execution.
- The biggest ecosystem-alignment gap is not raw capability. It is packaging that capability into review-friendly, IDE-friendly, and safer-by-default workflows.
