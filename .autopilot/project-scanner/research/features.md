// [Project Scanner - Feature Gap Research]
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

# Feature Gap Research

## Summary

- Overall rating: strong backend capability, weaker user-facing packaging in review and IDE workflows.
- Important distinction: several “missing” features are partially present in the stack, but not exposed as first-class GSD product surfaces.

## Findings

### [TABLE STAKES] Missing first-class PR/code-review workflow

- Evidence:
  - `src/resources/extensions/gsd/commands.ts:80`
  - `src/resources/extensions/gsd/docs/preferences-reference.md:443`
  - `src/resources/extensions/gsd/docs/preferences-reference.md:452`
  - `src/resources/extensions/gsd/github-client.ts:125`
  - `src/resources/extensions/gsd/github-client.ts:153`
  - `src/resources/extensions/gsd/github-client.ts:185`
- Gap: GSD has GitHub plumbing and a hook-based `REVIEW.md` path, but no explicit `/gsd review`, PR comments workflow, or review-specific command surface.
- External baseline:
  - GitHub Copilot code review: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review
  - Cursor Bugbot: https://docs.cursor.com/bugbot

### [TABLE STAKES] Missing IDE-native changed-files review / accept-reject flow

- Evidence:
  - `vscode-extension/package.json:43`
  - `vscode-extension/package.json:123`
  - `vscode-extension/package.json:141`
  - `vscode-extension/src/chat-participant.ts:134`
  - `vscode-extension/src/sidebar.ts:5`
- Gap: VS Code integration ends at chat + sidebar + file anchors. There is no changed-files review surface, inline diff accept/reject, or dedicated review queue.
- External baseline:
  - VS Code 1.104 changed-files experience: https://code.visualstudio.com/updates/v1_104

### [TABLE STAKES] Headless approvals are weakly surfaced and under-documented

- Evidence:
  - `README.md:257`
  - `docs/commands.md:102`
  - `src/headless.ts:137`
  - `src/headless.ts:142`
  - `src/headless.ts:145`
  - `src/headless.ts:148`
  - `docs/commands.md:130`
- Gap: default headless behavior auto-selects or auto-confirms, but the safer supervised path is not surfaced well in the docs.
- Impact: limits trust for CI/headless usage in higher-risk workflows.

### [COMPETITIVE ADVANTAGE] VS Code extension does not expose the full GSD workflow surface

- Evidence:
  - `docs/visualizer.md:5`
  - `docs/visualizer.md:23`
  - `docs/visualizer.md:43`
  - `vscode-extension/README.md:17`
  - `vscode-extension/README.md:25`
  - `vscode-extension/src/gsd-client.ts:399`
  - `vscode-extension/src/gsd-client.ts:415`
  - `vscode-extension/src/gsd-client.ts:424`
  - `vscode-extension/src/extension.ts:62`
  - `vscode-extension/src/extension.ts:319`
- Gap: the CLI exposes visualize, queue, history, knowledge, and orchestration features that the extension barely surfaces.
- Impact: product feels less complete in-editor than in terminal even though the backend APIs exist.

### [NICE TO HAVE] Browser/app runtime verification is real, but weakly branded as a GSD feature

- Evidence:
  - `README.md:459`
  - `docs/architecture.md:59`
  - `src/resources/extensions/gsd/prompts/system.md:165`
  - `src/resources/extensions/gsd/commands.ts:80`
  - `src/resources/extensions/gsd/verification-gate.ts:360`
  - `src/resources/extensions/gsd/verification-gate.ts:400`
- Gap: browser verification exists under Pi and browser-tools, but there is no obvious GSD review/preview command that teaches users to use it directly.
- Impact: reduces discoverability of a meaningful differentiator.
