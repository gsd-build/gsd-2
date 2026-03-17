// [Project Scanner - Security Research]
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

# Security Research

## Summary

- Overall rating: Needs Improvement
- Highest-risk areas: shell command construction around auth/browser launch, incomplete dependency auditing, and secret handling breadth.

## Findings

### [CRITICAL] Shell interpolation when opening OAuth/browser URLs

- Evidence:
  - `src/onboarding.ts:124`
  - `src/onboarding.ts:365`
  - `packages/pi-coding-agent/src/modes/interactive/components/login-dialog.ts:137`
  - `packages/pi-ai/src/utils/oauth/github-copilot.ts:318`
  - `packages/pi-ai/src/utils/oauth/github-copilot.ts:335`
- Pattern: `exec()` is used with interpolated URLs such as `open "${url}"` / `xdg-open "${url}"`.
- Risk: a malformed or hostile URL containing quotes or shell metacharacters can turn a browser-open step into command execution.
- Recommendation: replace shell strings with `spawn`/`execFile` argument arrays per platform.

### [HIGH] Git fallback paths use shell commands with interpolated refs/remotes

- Evidence:
  - `src/resources/extensions/gsd/native-git-bridge.ts:764`
  - `src/resources/extensions/gsd/native-git-bridge.ts:799`
  - `src/resources/extensions/gsd/auto-worktree.ts:634`
- Pattern: fallback `execSync("git ... ${branch}")` / `execSync("git push ${remote} ${mainBranch}")`.
- Risk: branch or remote strings can become shell-injection inputs if validation fails upstream.
- Recommendation: move all fallbacks to argument-based `spawnSync("git", [...])`.

### [HIGH] Dependency audit coverage is narrower than the repo surface

- Evidence:
  - `src/resources/extensions/gsd/verification-gate.ts:426`
  - `src/resources/extensions/gsd/verification-gate.ts:467`
  - `src/resources/extensions/gsd/verification-gate.ts:501`
  - `package.json:15`
  - `packages/pi-ai/package.json:25`
  - `native/Cargo.toml:1`
- Pattern: audit triggers only on top-level JS dependency files and only runs `npm audit`.
- Risk: `packages/*`, `vscode-extension`, and the Rust workspace are outside the built-in audit path.
- Recommendation: add workspace-aware JS auditing plus `cargo audit` coverage.

### [HIGH] `npm audit --omit=dev --json` currently reports 17 production vulnerabilities

- Local audit result on 2026-03-17:
  - 16 high
  - 1 moderate
- Root causes observed in manifests:
  - `package.json:70` `@aws-sdk/client-bedrock-runtime`
  - `package.json:86` `file-type`
- Notable advisory surfaced by audit:
  - `fast-xml-parser` DoS issue via transitive AWS dependency
  - `file-type` ZIP decompression-bomb DoS issue
- Recommendation: prioritize dependency refresh or temporary pinning/mitigation path.

### [HIGH] Standalone `@gsd/pi-ai` CLI writes tokens to `./auth.json` without explicit hardening

- Evidence:
  - `packages/pi-ai/src/cli.ts:8`
  - `packages/pi-ai/src/cli.ts:24`
  - contrast with `packages/pi-coding-agent/src/core/auth-storage.ts:63`
  - contrast with `packages/pi-coding-agent/src/core/auth-storage.ts:106`
- Risk: OAuth access/refresh tokens can land in a repo or shared directory with default permissions.
- Recommendation: reuse `AuthStorage` or explicitly `chmod 0600` on creation/write.

### [MEDIUM] Secrets are loaded into ambient process environment and inherited by child processes

- Evidence:
  - `src/cli.ts:107`
  - `src/cli.ts:189`
  - `src/wizard.ts:10`
  - `src/wizard.ts:27`
  - `packages/pi-coding-agent/src/core/exec.ts:40`
- Risk: tool API keys and bot tokens become broadly visible to subprocesses that may not need them.
- Recommendation: move to scoped env injection per tool/process instead of global hydration.
