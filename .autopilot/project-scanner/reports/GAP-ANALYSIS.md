// [Project Scanner - Gap Analysis]
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

# Gap Analysis

## Executive Summary

GSD-2 is a serious coding-agent platform with better orchestration fundamentals than most competitors: disk-backed state, worktree isolation, crash recovery, parallel milestone execution, and a large extension surface. The architecture shows deliberate investment in autonomy and operator controls rather than thin prompt wrappers.

The largest gaps are no longer about raw capability. They are about packaging, safety, and consistency. Startup paths still do more synchronous work than necessary, the VS Code extension exposes only a fraction of the core product, review workflows are hidden or absent, and the repo’s test/audit coverage does not match the release risk of a polyglot agent platform.

## Project Profile

- Type: monorepo for a coding-agent CLI/TUI, VS Code extension, and Rust native engine
- Stack: TypeScript ESM, Node.js, Rust/N-API, Playwright, SQL.js
- Maturity: growth-to-mature
- Team size estimate: multi-contributor project with productization and release automation, but still retaining some founder-style sharp edges

## Security Gaps

| Severity | Gap | Evidence |
|---|---|---|
| Critical | Shell interpolation in browser/OAuth openers | `src/onboarding.ts:124`, `packages/pi-coding-agent/src/modes/interactive/components/login-dialog.ts:137`, `packages/pi-ai/src/utils/oauth/github-copilot.ts:335` |
| High | Shell-interpolated git fallback commands | `src/resources/extensions/gsd/native-git-bridge.ts:764`, `src/resources/extensions/gsd/auto-worktree.ts:634` |
| High | Dependency audit only covers top-level JS manifests | `src/resources/extensions/gsd/verification-gate.ts:426`, `src/resources/extensions/gsd/verification-gate.ts:467`, `src/resources/extensions/gsd/verification-gate.ts:501` |
| High | Production dependencies currently include 17 audit findings | `package.json:70`, `package.json:86`; local `npm audit --omit=dev --json` on 2026-03-17 |
| High | Standalone OAuth helper writes tokens without hardened file perms | `packages/pi-ai/src/cli.ts:8`, `packages/pi-ai/src/cli.ts:24`, contrast `packages/pi-coding-agent/src/core/auth-storage.ts:63` |

## Performance Gaps

| Severity | Gap | Evidence |
|---|---|---|
| High | Full managed-resource sync still runs on each startup path | `src/cli.ts:342`, `src/cli.ts:440`, `src/resource-loader.ts:179` |
| High | GSD extension activation is monolithic | `src/resources/extensions/gsd/index.ts:29`, `src/resources/extensions/gsd/index.ts:129`, `src/resources/extensions/gsd/auto.ts:1` |
| High | Startup duplicates extension discovery and package metadata reads | `src/loader.ts:122`, `src/resource-loader.ts:234`, `src/loader.ts:17`, `src/resource-loader.ts:98` |
| Medium | Verification commands run strictly sequentially | `src/resources/extensions/gsd/verification-gate.ts:169`, `src/resources/extensions/gsd/verification-gate.ts:196` |
| Medium | VS Code sidebar fully rerenders every refresh | `vscode-extension/src/sidebar.ts:91`, `vscode-extension/src/sidebar.ts:142` |

## Feature Gaps

| Severity | Gap | Evidence |
|---|---|---|
| High | No first-class PR/review command surface | `src/resources/extensions/gsd/commands.ts:80`, `src/resources/extensions/gsd/github-client.ts:125` |
| High | No IDE-native changed-files review/apply-reject UI | `vscode-extension/package.json:43`, `vscode-extension/src/chat-participant.ts:134`, `vscode-extension/src/sidebar.ts:5` |
| Medium | Headless supervised approvals exist in code but are under-documented | `src/headless.ts:137`, `src/headless.ts:142`, `docs/commands.md:130` |
| Medium | VS Code exposes health chrome, not full workflow state | `docs/visualizer.md:5`, `vscode-extension/README.md:17`, `vscode-extension/src/gsd-client.ts:399` |
| Medium | Browser/runtime verification is weakly surfaced as a GSD workflow | `README.md:459`, `src/resources/extensions/gsd/commands.ts:80`, `src/resources/extensions/gsd/verification-gate.ts:360` |

## Architecture Gaps

| Severity | Gap | Evidence |
|---|---|---|
| Medium | Large monolithic command and auto modules are central bottlenecks for contributor velocity | `src/resources/extensions/gsd/commands.ts:1`, `src/resources/extensions/gsd/auto.ts:1` |
| Medium | Hidden capability mismatch between CLI and VS Code extension increases product fragmentation | `docs/commands.md:7`, `vscode-extension/package.json:43` |
| Medium | Polling-based orchestration still leans on sync file/git checks during long runs | `src/resources/extensions/gsd/auto.ts:3085`, `src/resources/extensions/gsd/unit-runtime.ts:91` |

## Developer Experience Gaps

| Severity | Gap | Evidence |
|---|---|---|
| High | CI omits package tests, browser-tools tests, and most native tests | `package.json:50`, `package.json:55`, `.github/workflows/ci.yml:48` |
| High | VS Code extension is not built/tested in CI | `tsconfig.extensions.json:10`, `.github/workflows/ci.yml:42`, `vscode-extension/package.json:171` |
| High | Native release flow builds/publishes without a strong native test gate | `.github/workflows/build-native.yml:65`, `.github/workflows/build-native.yml:141` |
| Medium | Postinstall silently downloads Chromium unless env is set | `scripts/postinstall.js:9`, `scripts/postinstall.js:21` |
| Medium | Verification contract is overstated relative to actual enforced gates | `README.md:154`, `package.json:51`, `.github/workflows/ci.yml:36` |

## Cross-Cutting Concerns

- Several problems share the same root cause: capability exists but is inconsistently surfaced, tested, or guarded.
- The repo optimizes for power users in the terminal more than editor-first workflows.
- Safety posture is strongest in the main runtime and weaker in helper paths and fallbacks.

## Risk Assessment

- Near-term shipping risk: medium-high
- Biggest operational risks:
  - exploitable shell interpolation in auth/browser helpers
  - incomplete dependency/test coverage before release
  - warm-start latency that undermines perceived quality
- Biggest product risks:
  - weaker review UX than current competitors
  - IDE parity gap despite a dedicated VS Code extension
