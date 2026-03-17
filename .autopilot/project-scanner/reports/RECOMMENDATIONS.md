// [Project Scanner - Recommendations]
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

# Recommendations

## Summary Table

| Priority | Count |
|---|---:|
| Critical | 3 |
| High | 6 |
| Medium | 4 |

## Quick Wins

- Skip managed-resource sync when `managed-resources.json` matches the current version.
- Replace shell-string browser openers with argument-based `spawn`/`execFile`.
- Expand CI to include browser-tools, native, and VS Code extension validation.
- Document and promote headless supervised mode instead of silent auto-confirm defaults.

## Critical

### 1. Replace all shell-interpolated URL openers

- Priority: Critical
- Effort: Small (<1 week)
- Impact: closes the clearest code-execution risk in auth flows
- Implementation approach:
  - Replace `exec('open "${url}"')` style calls with argument-array execution.
  - Centralize platform-specific browser open behavior in one safe helper.
  - Add tests for quote-bearing and malformed URLs.
  - Reuse the helper in onboarding, login dialog, and OAuth providers.
- Dependencies: none
- References:
  - `src/onboarding.ts:124`
  - `packages/pi-coding-agent/src/modes/interactive/components/login-dialog.ts:137`

### 2. Harden git fallback command execution

- Priority: Critical
- Effort: Small (<1 week)
- Impact: removes fallback-path shell injection risk
- Implementation approach:
  - Replace string-based `execSync` with `spawnSync("git", [...])`.
  - Validate ref names and remote names defensively.
  - Add regression tests for special-character inputs.
- Dependencies: none
- References:
  - `src/resources/extensions/gsd/native-git-bridge.ts:764`
  - `src/resources/extensions/gsd/auto-worktree.ts:634`

### 3. Fix dependency exposure and audit blind spots

- Priority: Critical
- Effort: Medium (1-4 weeks)
- Impact: reduces immediate known vulns and closes audit gaps
- Implementation approach:
  - Patch or pin the AWS and `file-type` chains flagged by audit.
  - Expand audit coverage to workspaces and `vscode-extension`.
  - Add Rust dependency auditing.
  - Fail CI on actionable high-severity findings.
- Dependencies: CI updates
- References:
  - `package.json:70`
  - `package.json:86`
  - `src/resources/extensions/gsd/verification-gate.ts:426`

## High

### 4. Skip warm-start resource sync when nothing changed

- Priority: High
- Effort: Small (<1 week)
- Impact: improves startup latency on every run
- Implementation approach:
  - Early-return from `initResources()` on version match.
  - Keep explicit override path for forced resync.
  - Update smoke tests to avoid paying full copy cost twice.
- Dependencies: none
- References:
  - `src/resource-loader.ts:172`
  - `src/resource-loader.ts:179`
  - `src/cli.ts:342`

### 5. Lazy-load the heavy GSD extension graph

- Priority: High
- Effort: Medium (1-4 weeks)
- Impact: reduces cold-start parse/eval cost and improves maintainability
- Implementation approach:
  - Move large handler modules behind command-time imports.
  - Keep only minimal registration logic at extension activation.
  - Break `commands.ts` and `auto.ts` into domain modules.
- Dependencies: startup measurements
- References:
  - `src/resources/extensions/gsd/index.ts:29`
  - `src/resources/extensions/gsd/index.ts:129`

### 6. Add first-class PR/review workflow

- Priority: High
- Effort: Medium (1-4 weeks)
- Impact: closes a visible product gap versus current agent tools
- Implementation approach:
  - Surface `/gsd review` and `/gsd pr-review` commands.
  - Reuse existing `github-client.ts` helpers.
  - Emit structured review artifacts and optional PR comments.
  - Support local diff review and remote PR review modes.
- Dependencies: GitHub auth conventions
- References:
  - `src/resources/extensions/gsd/commands.ts:80`
  - `src/resources/extensions/gsd/github-client.ts:125`
  - GitHub Copilot review docs: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review

### 7. Build IDE-native changed-file review UX in VS Code

- Priority: High
- Effort: Medium (1-4 weeks)
- Impact: materially improves trust and editor-first usability
- Implementation approach:
  - Add changed-files panel with accept/reject and diff previews.
  - Reuse existing file anchor and session APIs.
  - Show pending edits while the agent is still running when possible.
- Dependencies: extension RPC and session APIs
- References:
  - `vscode-extension/package.json:43`
  - `vscode-extension/src/chat-participant.ts:134`
  - VS Code 1.104 update: https://code.visualstudio.com/updates/v1_104

### 8. Bring the extension, browser-tools, and native packages under CI

- Priority: High
- Effort: Medium (1-4 weeks)
- Impact: raises release confidence across actual shipped surfaces
- Implementation approach:
  - Add extension build/package job.
  - Run browser-tools tests in CI.
  - Run package-level native test matrix before publish.
  - Make root test scripts reflect the real repo surface.
- Dependencies: CI runtime budget
- References:
  - `.github/workflows/ci.yml:48`
  - `.github/workflows/build-native.yml:65`
  - `vscode-extension/package.json:171`

### 9. Make headless approvals explicit and safer by default

- Priority: High
- Effort: Small (<1 week)
- Impact: safer CI/headless usage, fewer silent wrong-path decisions
- Implementation approach:
  - Document `--supervised` and response-timeout behavior.
  - Add approval modes instead of implicit first-option selection.
  - Emit loud warnings when defaults are being auto-chosen.
- Dependencies: docs updates
- References:
  - `src/headless.ts:137`
  - `src/headless.ts:142`
  - `docs/commands.md:130`

## Medium

### 10. Reduce auto-mode polling and align cache TTLs

- Priority: Medium
- Effort: Medium (1-4 weeks)
- Impact: lowers background overhead during long runs
- Implementation approach:
  - Consolidate the 15-second watchdog loops.
  - Prefer event-driven invalidation where possible.
  - Align dirty-tree cache TTLs with poll cadence.
- Dependencies: telemetry on long runs
- References:
  - `src/resources/extensions/gsd/auto.ts:3085`
  - `src/resources/extensions/gsd/native-git-bridge.ts:256`

### 11. Replace full webview rerenders with incremental sidebar updates

- Priority: Medium
- Effort: Small (<1 week)
- Impact: smoother VS Code extension behavior
- Implementation approach:
  - Keep the webview static after initial load.
  - Use `postMessage` updates for state/stats.
  - Coalesce refreshes while streaming.
- Dependencies: none
- References:
  - `vscode-extension/src/sidebar.ts:91`
  - `vscode-extension/src/sidebar.ts:142`

### 12. Add benchmark and startup-regression automation

- Priority: Medium
- Effort: Medium (1-4 weeks)
- Impact: prevents performance regressions from creeping back in
- Implementation approach:
  - Add CLI startup benchmarks and warm-start benchmarks.
  - Add representative long-run auto-mode overhead measurements.
  - Gate on thresholds or at least publish trend artifacts in CI.
- Dependencies: stable benchmark harness
- References:
  - `.plans/startup-performance.md`
  - `.plans/native-perf-optimizations.md`

### 13. Add contributor-focused source setup docs

- Priority: Medium
- Effort: Small (<1 week)
- Impact: lowers onboarding friction for contributors and CI maintainers
- Implementation approach:
  - Document repo bootstrap, Playwright download behavior, and skip flags.
  - Separate “install as a user” from “develop from source”.
  - Document native and VS Code extension workflows.
- Dependencies: none
- References:
  - `scripts/postinstall.js:9`
  - `docs/getting-started.md:3`

## Roadmap

### Phase 1: Month 1

- Recommendations 1, 2, 3, 4, 9, 13

### Phase 2: Months 2-3

- Recommendations 5, 6, 7, 8

### Phase 3: Months 4-6

- Recommendations 10, 11, 12

## Dependency Graph

- Secure execution fixes unblock safer auth, review, and headless expansion.
- CI/test coverage work should land before large product-surface additions in VS Code.
- Startup-performance work and benchmark automation should be paired so improvements stay durable.
