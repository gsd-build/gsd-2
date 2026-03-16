---
depends_on: [M003]
---

# M004: Web Mode Documentation and CI/CD Integration

**Gathered:** 2026-03-16
**Status:** Queued — pending auto-mode execution.

## Project Description

The browser-first `gsd --web` mode shipped across M001 and M002 and gains full feature parity in M003, yet the documentation and CI pipeline have not been updated to reflect any of it. The README, `docs/` guides, and `ci.yml` workflow all predate web mode entirely. M004 adds a dedicated web mode guide, updates existing docs and the README to reference web mode where relevant, and introduces a separate CI job that builds and tests the web host on Linux and macOS so web regressions are caught before merge.

## Why This Milestone

Web mode is becoming the primary user-facing product path. Without documentation, users don't know it exists or how to use it. Without CI coverage, web build and test regressions ship silently — the current pipeline only builds the CLI/TUI and never runs `build:web-host` or web contract tests. Both gaps need closing now that the feature set is stable after M003.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Find `gsd --web` in the README, getting-started guide, and a dedicated web mode guide that covers setup, usage, architecture, and troubleshooting
- Discover web mode commands, configuration, and architecture from the existing docs that now reference the browser path alongside the TUI
- Trust that web host build failures and web contract test failures will block PRs via a dedicated CI job running on Linux and macOS

### Entry point / environment

- Entry point: `docs/`, `README.md`, `.github/workflows/ci.yml`
- Environment: GitHub Actions CI (ubuntu-latest, macos-latest), local dev documentation
- Live dependencies involved: none — documentation and CI configuration only

## Completion Class

- Contract complete means: `docs/web-mode.md` exists with full coverage; README documentation index and relevant sections reference web mode; `ci.yml` has a dedicated web-build job on ubuntu-latest and macos-latest that runs `build:web-host` and web contract/integration tests; existing docs (architecture, troubleshooting, commands, getting-started, configuration) reference web mode where relevant.
- Integration complete means: CI job passes on a real PR and catches a simulated web build failure; documentation is internally consistent (cross-references resolve, commands match reality, paths exist).
- Operational complete means: none — no runtime services.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A new user reading the README can discover `gsd --web` and navigate to complete setup/usage documentation.
- The CI web-build job runs on both ubuntu-latest and macos-latest, executes `npm run build:web-host`, runs web-specific tests, and reports failures independently from the existing build job.
- Existing docs (architecture.md, troubleshooting.md, commands.md, getting-started.md, configuration.md) reference web mode accurately where relevant.
- All documentation paths, commands, and configuration references match the actual codebase after M003.

## Risks and Unknowns

- **M003 merge may change file paths or module names** — Documentation must be written against the post-M003 codebase, not the current state. This is why M004 depends on M003 completion.
- **Web host build may have platform-specific failures on macOS CI** — The standalone Next.js build has only been tested on macOS locally; GitHub Actions macOS runners may behave differently.
- **Web contract tests may need CI-specific setup** — Tests that depend on the bridge service or packaged host may need environment configuration for headless CI.
- **Existing docs have varying levels of detail** — Updates need to match the tone and depth of each doc rather than bolting on uniform blocks.

## Existing Codebase / Prior Art

- `README.md` — Main project README with documentation index, command tables, architecture overview, getting-started, and configuration sections. No web mode mentions.
- `docs/` — 26 documentation files covering architecture, auto-mode, commands, configuration, cost-management, getting-started, git-strategy, migration, skills, token-optimization, troubleshooting, and working-in-teams. None reference web mode.
- `.github/workflows/ci.yml` — Current CI with `build` (ubuntu) and `windows-portability` jobs. Runs `npm run build`, `typecheck:extensions`, `validate-pack`, `test:unit`, `test:integration`. No `build:web-host` or web tests.
- `.github/workflows/build-native.yml` — Native build workflow (Rust/git2). Not relevant but shows existing CI patterns.
- `web/` — Next.js web host directory with its own `package.json` and build pipeline.
- `src/tests/web-*.test.ts` — Web contract test files (command parity, session parity, live state, recovery diagnostics, continuity, state surfaces, onboarding, live interaction).
- `src/tests/integration/web-mode-*.test.ts` — Web integration tests (assembled, runtime, onboarding).

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R111 (new) — Web mode documentation covers setup, usage, architecture, and troubleshooting in a dedicated guide plus updates to existing docs and README.
- R112 (new) — CI pipeline includes a dedicated web-build job on Linux and macOS that catches web host build and test regressions independently.

## Scope

### In Scope

- New `docs/web-mode.md` covering: what web mode is, how to launch (`gsd --web`), browser onboarding, the workspace UI (dashboard, terminal, roadmap, files, activity, visualizer, diagnostics, settings), browser commands, architecture (host/bridge/store), configuration, troubleshooting web-specific issues
- README updates: add web mode to documentation index, update command tables, add web mode to getting-started and architecture sections
- Existing doc updates: `architecture.md` (web host/bridge/store architecture), `troubleshooting.md` (web-specific issues), `commands.md` (browser dispatch behavior), `getting-started.md` (mention `gsd --web` as an alternative), `configuration.md` (web-relevant preferences)
- New dedicated CI job in `ci.yml`: runs on ubuntu-latest and macos-latest, installs dependencies, runs `npm run build:web-host`, runs web contract tests and web integration tests
- Verification that all documentation references match the post-M003 codebase

### Out of Scope / Non-Goals

- Redesigning the documentation site or adding a docs framework (R031-adjacent)
- Writing API reference docs for the web routes (internal implementation detail)
- Adding end-to-end browser CI tests with Playwright in GitHub Actions (would require browser install steps, complex setup — may be a future milestone)
- Modifying the web UI itself — this milestone is docs and CI only
- CI for the native build pipeline (already handled by build-native.yml)

## Technical Constraints

- Documentation must be written against the post-M003 codebase — all paths, commands, module names, and feature references must reflect the merged upstream state
- CI job must install web dependencies (`npm --prefix web ci` or equivalent) since the web host has its own `package.json`
- CI job should run independently and in parallel with the existing `build` job — not block or slow the core pipeline
- Web contract/integration tests use `node --experimental-strip-types` and the same test runner pattern as existing tests
- Match the existing documentation tone and depth — technical but approachable, code examples where helpful

## Integration Points

- `.github/workflows/ci.yml` — Add new `web-build` job alongside existing `build` and `windows-portability` jobs
- `README.md` — Update documentation index, command table, getting-started, architecture sections
- `docs/*.md` — Update architecture, troubleshooting, commands, getting-started, configuration with web mode references
- `docs/web-mode.md` — New file, cross-referenced from README and other docs
- `package.json` scripts — Reference `build:web-host`, `test:unit`, `test:integration` from CI steps

## Open Questions

- Whether web integration tests can run headlessly in GitHub Actions without additional browser dependencies — will be determined during CI setup. If they need Playwright browsers, the first pass may limit CI to contract tests and `build:web-host` only, deferring integration test CI to a follow-up.
