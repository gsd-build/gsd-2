# M004 — Research

**Date:** 2026-03-17

## Summary

M004 is a documentation-and-CI milestone — no product code changes, only new docs, doc updates, and a CI workflow addition. The codebase research confirms that **zero existing documentation** mentions web mode: the README, docs/README.md index, getting-started, architecture, commands, configuration, and troubleshooting all describe only the TUI/CLI path. The CI pipeline (`ci.yml`) has no web-related jobs — `build:web-host` is defined in `package.json` but never executed in CI. This is a clean greenfield for both deliverables.

The web mode implementation is mature (M001–M003 complete, 1197 unit tests, 27 integration tests, 118 parity contract tests), giving us a stable target to document against. The primary risks are (1) writing docs that accurately describe the post-M003 feature surface and (2) determining which web tests can run in CI without Playwright browser installation.

The recommended approach is three slices: (S01) the dedicated `docs/web-mode.md` guide, (S02) README and existing doc updates, and (S03) the CI web-build job. S01 first because it's the reference document that S02 cross-links to. S03 is independent and can be ordered flexibly.

## Recommendation

**Prove the CI job first, write docs second.** Despite docs being the larger deliverable, the CI job has the only real technical uncertainty (Playwright in CI, cross-platform Next.js standalone build). Resolving that quickly (S03 or early S01 parallel work) de-risks the milestone. Then write the comprehensive web mode guide (S01), and finish with README/existing doc updates (S02) which are mechanical cross-referencing.

However, from a dependency perspective, `docs/web-mode.md` should exist before updating other docs to cross-reference it. So the natural build order is: **S01 (web mode guide) → S02 (README + existing docs) → S03 (CI job)**, with S03 being independent and parallelizable with S01/S02.

## Implementation Landscape

### Key Files

**Documentation targets:**

- `docs/web-mode.md` — **New file.** Dedicated web mode guide covering launch, onboarding, workspace UI, browser commands, architecture, configuration, troubleshooting.
- `README.md` — Update documentation index (line ~51), command tables (line ~216), getting-started section (line ~214), architecture overview. Currently ~300+ lines, zero web mentions.
- `docs/README.md` — Documentation index table. Add web mode guide entry alongside the existing 15 user docs and 3 architecture docs.
- `docs/getting-started.md` — Add `gsd --web` as an alternative launch path. Currently describes only `gsd` (TUI). ~135 lines.
- `docs/architecture.md` — Add web host/bridge/store architecture section. Currently covers CLI→loader→extensions→dispatch pipeline. ~133 lines.
- `docs/commands.md` — Add browser command dispatch behavior, `gsd --web` CLI flag, `gsd web stop`. Currently ~73 lines, pure TUI.
- `docs/configuration.md` — Reference web-relevant preferences (GSD_WEB_* env vars if any user-facing ones exist, port/host). Currently ~460+ lines.
- `docs/troubleshooting.md` — Add web-specific troubleshooting section (port conflicts, bridge disconnects, build failures, Playwright). Currently ~120 lines.

**CI target:**

- `.github/workflows/ci.yml` — Add `web-build` job. Currently 3 jobs: `no-gsd-dir`, `build` (ubuntu), `windows-portability` (windows).

**Source truth for documentation content:**

- `src/web-mode.ts` — Launch mechanics, port selection, host resolution (packaged vs dev), `GSD_WEB_*` env vars, browser auto-open.
- `src/cli-web-branch.ts` — `gsd --web [path]`, `gsd web start`, `gsd web stop` CLI parsing.
- `src/web/bridge-service.ts` — Bridge singleton, RPC subprocess, session state, SSE event streaming.
- `web/components/gsd/app-shell.tsx` — App shell with 6 views: dashboard, power, roadmap, files, activity, visualize. Plus command surface overlays.
- `web/components/gsd/sidebar.tsx` — NavRail with view entries, settings button, milestone explorer.
- `web/components/gsd/command-surface.tsx` — 2222-line orchestrator for /gsd command surfaces.
- `web/components/gsd/diagnostics-panels.tsx` — Forensics, doctor, skill-health panels.
- `web/components/gsd/knowledge-captures-panel.tsx` — Knowledge + captures/triage surface.
- `web/components/gsd/settings-panels.tsx` — Prefs, model routing, budget panels.
- `web/components/gsd/remaining-command-panels.tsx` — 10 remaining command panels.
- `web/components/gsd/visualizer-view.tsx` — 7-tab visualizer (Progress, Deps, Metrics, Timeline, Agent, Changes, Export).
- `web/app/api/` — 23 API route directories (boot, captures, cleanup, doctor, export-data, files, forensics, git, history, hooks, inspect, knowledge, live-state, onboarding, recovery, session, settings-data, shutdown, skill-health, steer, terminal, undo, visualizer).
- `web/lib/browser-slash-command-dispatch.ts` — Browser command dispatch with rpc/surface/local/reject outcomes.

**Test files for CI:**

- `src/tests/web-*.test.ts` — 11 web contract test files (included in `test:unit` glob).
- `src/tests/integration/web-mode-*.test.ts` — 3 web integration test files (included in `test:integration` glob). All 3 import Playwright `chromium`.
- `src/resources/extensions/gsd/tests/*.test.ts` — GSD extension tests (also in `test:unit` glob).

### Build Order

1. **S01: Dedicated web mode guide** — Write `docs/web-mode.md` first. This is the single reference doc that all other updates cross-link to. Must accurately describe: launch (`gsd --web`), onboarding flow, workspace views (dashboard/power/roadmap/files/activity/visualize), browser commands (/gsd subcommand dispatch with 20 surface, 9 passthrough, 1 help), architecture (parent launcher → packaged host → bridge singleton → workspace store), configuration, and troubleshooting. Draw content from the source files listed above.

2. **S02: README and existing doc updates** — With the guide written, update README.md (documentation index, command table, getting-started, architecture sections) and the 5 existing docs (docs/README.md, getting-started.md, architecture.md, commands.md, troubleshooting.md, configuration.md). Each update should match the tone and depth of the surrounding content — bolt-on blocks, not rewrites.

3. **S03: CI web-build job** — Add a `web-build` job to `ci.yml` that runs on `ubuntu-latest` and `macos-latest`, installs deps, runs `npm run build:web-host`, and runs web contract tests. The key design decision is what tests to include.

### Verification Approach

**Documentation (S01, S02):**
- All referenced file paths exist in the codebase (`docs/web-mode.md` exists, cross-references resolve)
- All CLI commands/flags mentioned match `src/cli-web-branch.ts` and `src/web-mode.ts`
- All view names match `web/components/gsd/app-shell.tsx` active views
- All API routes mentioned match `web/app/api/` directory listing
- All /gsd subcommands match the 30-command classification (20 surface, 9 passthrough, 1 help)
- `rg -i "web mode\|--web\|browser" docs/ README.md` returns hits in all targeted files
- `docs/README.md` table has a web mode entry

**CI (S03):**
- `ci.yml` has a `web-build` job with matrix `[ubuntu-latest, macos-latest]`
- Job runs `npm run build:web-host` 
- Job runs web contract tests
- YAML validates (`actionlint` or manual syntax check)
- Job is independent from existing `build` job (no `needs:` dependency on it)

## Constraints

- **Post-M003 accuracy required.** All docs must describe the current codebase, not aspirational features. Every path, command, view name, and API route must be verified against source.
- **Web integration tests require Playwright browsers.** The 3 integration test files (`web-mode-assembled.test.ts`, `web-mode-onboarding.test.ts`, `web-mode-runtime.test.ts`) all `import { chromium } from "playwright"` and call `chromium.launch()`. Running these in CI requires `npx playwright install chromium` or equivalent. The first CI pass should include contract tests only; integration tests can be added if Playwright setup proves straightforward.
- **`build:web-host` requires web deps.** The script is `npm --prefix web run build && npm run stage:web-host`. The `web/` directory has its own `package.json` with Next.js, Radix, etc. CI must `npm ci` at root (which installs workspaces) or separately install web deps.
- **No dedicated web test scripts.** Web contract tests are mixed into the `test:unit` glob (`src/tests/web-*.test.ts`). There's no `test:web-contract` script. CI can either run the full `test:unit` (which includes all 1197 tests) or use a targeted glob for just web tests.
- **Match existing doc tone.** Existing docs are technical but approachable, with code examples, tables, and tree diagrams. The web mode guide should follow the same style.
- **Node.js test runner.** Tests use Node's built-in `node:test` with `--experimental-strip-types` and a custom resolver (`resolve-ts.mjs`). CI must use the same invocation pattern.

## Common Pitfalls

- **Over-documenting internal implementation.** The web mode guide should cover what users need (launch, views, commands, troubleshooting), not internal API routes or bridge protocol details. Keep the architecture section high-level.
- **Cross-reference drift.** If `docs/web-mode.md` mentions section anchors that don't exist in the target doc, or vice versa, links break silently. Verify every `[text](./file.md#anchor)` reference.
- **CI job dependency ordering.** The `web-build` job must NOT depend on the `build` job (`needs: build`) — they should run in parallel. Adding `needs` would serialize them and slow the pipeline.
- **`npm ci` at root installs web deps.** The root `package.json` likely has `web/` as a workspace or the Next.js build references files from `src/`. Verify whether `npm ci` at root installs `web/node_modules` or if a separate `npm --prefix web ci` is needed.
- **macOS CI runner cost.** GitHub Actions macOS runners are 10x the cost of Linux runners. The web-build job should only use macOS if there's a real platform-specific risk. The Next.js standalone build and Node test runner should be platform-agnostic. Consider making macOS a separate optional sub-job or documenting the cost tradeoff.

## Open Risks

- **Playwright in CI.** Web integration tests need `chromium.launch()`. Installing Playwright browsers in CI adds ~2min setup time and significant disk usage. If this proves problematic, the first CI pass should run only `build:web-host` + web contract tests (no Playwright). Integration tests can be added in a follow-up once the base job is proven.
- **`build:web-host` on Linux CI.** The standalone Next.js build has been tested locally on macOS. GitHub Actions ubuntu runners may have different Node/npm behaviors (especially around the standalone output tracing that copies `src/web/` service files). A build failure here would be a real finding, not a docs issue.
- **Web contract test isolation.** Some web contract tests import from `web/lib/` which may have Next.js-specific module resolution. If any contract test fails in CI due to import resolution differences, the test glob may need filtering.
- **Stale docs after future changes.** Documentation written now will drift as the web UI evolves. This is inherent to docs-as-code and not solvable in M004, but worth noting.

## Candidate Requirements vs Scope

Both R111 and R112 are well-scoped and directly address real gaps:

- **R111 (docs)** — Table stakes. Web mode is a primary product path with zero documentation. The scope (dedicated guide + README + 5 existing docs) is appropriate.
- **R112 (CI)** — Table stakes. The CI pipeline completely ignores the web host and all web tests. A dedicated job is the minimum viable fix.

**No missing requirements identified.** The scope is tight and appropriate for a docs+CI milestone. No candidate requirements to add.

**One advisory note:** Consider adding a `test:web-contract` npm script that targets just `src/tests/web-*.test.ts` — this would make the CI job cleaner (run only web-relevant tests instead of all 1197 unit tests) and would be useful for local development too. This is an implementation detail for S03, not a requirement.

## Sources

- Codebase exploration of `docs/`, `README.md`, `.github/workflows/ci.yml`, `src/web-mode.ts`, `src/cli-web-branch.ts`, `src/web/bridge-service.ts`, `web/components/gsd/`, `web/app/api/`, `web/lib/`, `src/tests/web-*.test.ts`, `src/tests/integration/web-mode-*.test.ts`, `package.json` scripts.
- Inlined M004-CONTEXT.md scope, requirements, and decisions register.
