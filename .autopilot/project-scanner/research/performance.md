// [Project Scanner - Performance Research]
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

# Performance Research

## Summary

- Overall rating: Good foundation, but warm-start and UI-thread efficiency are leaving measurable wins on the table.
- Highest-value theme: eliminate repeated synchronous startup work and avoid loading subsystems before they are needed.

## Findings

### [HIGH IMPACT] Managed resource sync still runs on every startup

- Evidence:
  - `src/cli.ts:342`
  - `src/cli.ts:440`
  - `src/resource-loader.ts:172`
  - `src/resource-loader.ts:179`
  - `src/resource-loader.ts:193`
  - `src/resource-loader.ts:207`
  - `src/resource-loader.ts:222`
- Why it matters: comments explicitly claim version-match should skip the copy, but the implementation still does `rmSync` + `cpSync` + `chmodSync` across extensions, agents, and skills on both print and interactive paths.
- Likely payoff: better warm startup, less disk churn, less noisy smoke testing.

### [HIGH IMPACT] Core GSD extension graph is activated as a monolith

- Evidence:
  - `src/resources/extensions/gsd/index.ts:29`
  - `src/resources/extensions/gsd/index.ts:129`
  - `src/resources/extensions/gsd/commands.ts:1`
  - `src/resources/extensions/gsd/auto.ts:1`
- Why it matters: every session pays parse/eval cost for auto-mode, visualizer, worktree, preferences, and command logic even when users only need a small subset.
- Likely payoff: faster cold start and lower memory footprint if command handlers lazy-import heavier modules.

### [HIGH IMPACT] Startup repeats synchronous extension discovery and manifest reads

- Evidence:
  - `src/loader.ts:17`
  - `src/loader.ts:62`
  - `src/loader.ts:92`
  - `src/loader.ts:122`
  - `src/resource-loader.ts:98`
  - `src/resource-loader.ts:234`
- Why it matters: the loader and resource loader both rescan extension structure and reread `package.json`.
- Likely payoff: trim pre-session sync I/O by using a build-time manifest and cached package metadata.

### [MEDIUM IMPACT] Verification gate serializes all discovered commands

- Evidence:
  - `src/resources/extensions/gsd/verification-gate.ts:169`
  - `src/resources/extensions/gsd/verification-gate.ts:172`
  - `src/resources/extensions/gsd/verification-gate.ts:196`
- Why it matters: `typecheck`, `lint`, and `test` are all run sequentially even when they are independent.
- Likely payoff: lower post-unit latency, especially in larger repos GSD orchestrates.

### [MEDIUM IMPACT] Auto-mode watchdogs poll on fixed timers with sync state checks

- Evidence:
  - `src/resources/extensions/gsd/auto.ts:3085`
  - `src/resources/extensions/gsd/auto.ts:3202`
  - `src/resources/extensions/gsd/unit-runtime.ts:91`
  - `src/resources/extensions/gsd/auto-supervisor.ts:48`
  - `src/resources/extensions/gsd/native-git-bridge.ts:256`
- Why it matters: 15-second poll loops keep rereading runtime files and checking dirty-tree state; the fallback git-state cache is shorter than the poll interval, so cache hits are missed.
- Likely payoff: lower steady-state background overhead during long autonomous runs.

### [MEDIUM IMPACT] VS Code sidebar rebuilds the entire webview HTML on refresh

- Evidence:
  - `vscode-extension/src/sidebar.ts:91`
  - `vscode-extension/src/sidebar.ts:101`
  - `vscode-extension/src/sidebar.ts:142`
- Why it matters: refreshes happen on connection events and every 10 seconds while connected, and each refresh re-fetches state/stats then replaces `webview.html`.
- Likely payoff: smoother extension UX and lower IPC/render churn by switching to `postMessage` diffs.

### [MEDIUM IMPACT] VS Code chat participant inlines full referenced file contents

- Evidence:
  - `vscode-extension/src/chat-participant.ts:37`
  - `vscode-extension/src/chat-participant.ts:193`
  - `vscode-extension/src/chat-participant.ts:203`
  - `vscode-extension/src/chat-participant.ts:206`
- Why it matters: large file references inflate prompt size, token spend, and latency.
- Likely payoff: cheaper chat turns with truncation, chunking, or selective range injection.

### [MEDIUM IMPACT] Path autocomplete still blocks on sync filesystem calls

- Evidence:
  - `packages/pi-tui/src/autocomplete.ts:142`
  - `packages/pi-tui/src/autocomplete.ts:406`
  - `packages/pi-tui/src/autocomplete.ts:473`
  - `packages/pi-tui/src/autocomplete.ts:486`
  - `packages/pi-tui/src/components/editor.ts:985`
  - `packages/pi-tui/src/components/editor.ts:2085`
- Why it matters: large directories can hitch typing because autocomplete does sync `stat`/`readdir` work on the UI path.
- Likely payoff: noticeably better perceived responsiveness in large repos.
