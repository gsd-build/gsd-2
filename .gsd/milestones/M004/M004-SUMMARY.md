---
id: M004
provides:
  - docs/web-mode.md — complete 270-line web mode guide (7 sections)
  - Web mode cross-references in README.md and 6 existing docs (8 files total)
  - test:web-contract npm script (256 tests, 12 files)
  - web-build CI job with ubuntu-latest/macos-latest matrix, independent from existing jobs
key_decisions:
  - D063/D065: Exclude Playwright-dependent web integration tests from CI; contract tests (256) provide sufficient regression coverage without browser install complexity
  - D064: Two independent slices (S01 CI, S02 docs) mapping cleanly to R112 and R111
  - D066: --test-force-exit required for test:web-contract due to server module open handles
patterns_established:
  - Web contract tests use --test-force-exit for clean CI exit when test files import server modules
  - CI web jobs run independently (no needs: dependency) with OS matrix matching deployment targets
  - Cross-reference doc updates are summaries/pointers with links to the full guide, not duplicated content
observability_surfaces:
  - web-build CI job appears as separate GitHub Actions check with per-OS pass/fail
  - npm run test:web-contract runs 12 test files (256 tests) with per-file pass/fail output
requirement_outcomes:
  - id: R111
    from_status: active
    to_status: validated
    proof: docs/web-mode.md exists (270 lines, 7 sections). README docs index, command table, getting-started, and architecture sections reference web mode. docs/README.md has web mode row. architecture.md, troubleshooting.md, commands.md, getting-started.md, configuration.md each reference web mode. All 8 files confirmed via rg cross-reference scan. 7-check accuracy verification (source paths, view names, CLI flags, env vars, cross-reference links, command classification, API route count) passed with zero discrepancies.
  - id: R112
    from_status: active
    to_status: validated
    proof: test:web-contract script in package.json targets src/tests/web-*.test.ts (256 tests pass, 0 fail, 12 files). web-build job in ci.yml has matrix [ubuntu-latest, macos-latest], 5 steps (checkout, setup-node, npm ci, build:web-host, test:web-contract), no needs key. YAML parses cleanly. First real CI run will occur on merge — structural verification is complete.
duration: 45m
verification_result: passed
completed_at: 2026-03-17
---

# M004: Web Mode Documentation and CI/CD Integration

**Complete web mode guide, cross-references in 7 existing docs, and independent CI job catching web host build and test regressions on Linux and macOS.**

## What Happened

Two independent slices delivered documentation and CI coverage for the browser-first `gsd --web` mode that shipped across M001–M003.

**S01 (CI web-build job)** added a `test:web-contract` npm script to `package.json` using the existing Node test runner pattern with `--test-force-exit` (required because 6 of 12 test files import server modules that keep open handles). Added a `web-build` job to `.github/workflows/ci.yml` with `strategy.matrix.os: [ubuntu-latest, macos-latest]` running `build:web-host` and `test:web-contract` independently from existing CI jobs. The 256 contract tests pass locally in ~9 seconds.

**S02 (Web mode documentation)** wrote `docs/web-mode.md` — a 270-line guide covering launch, browser onboarding, workspace UI (6 views), browser commands (30 subcommands: 20 surface, 9 passthrough, 1 help), architecture (parent launcher → standalone host → bridge singleton → workspace store, 23 API routes), and configuration/troubleshooting (6 `GSD_WEB_*` env vars). Updated 7 existing files with web mode cross-references: README.md (docs index, command table, getting-started subsection, architecture paragraph), docs/README.md (user docs table row), and 5 existing guides (architecture, troubleshooting, commands, getting-started, configuration). A 7-check accuracy verification confirmed every path, view name, CLI flag, env var, command classification, and API route count matches the codebase with zero discrepancies.

## Cross-Slice Verification

| Success Criterion | Evidence |
|---|---|
| New user discovers `gsd --web` in README first screen | README line 30: docs index entry; line 209: getting-started code block; line 269: command table row |
| `docs/web-mode.md` covers all required topics | 270 lines, 7 major sections: overview, getting started, browser onboarding, workspace, browser commands, architecture, configuration & troubleshooting |
| Existing docs reference web mode accurately | `rg` confirms 8 files: architecture.md (5 hits), troubleshooting.md (3), commands.md (4), getting-started.md (4), configuration.md (9), docs/README.md (1), docs/web-mode.md, README.md |
| CI `web-build` job on ubuntu-latest and macos-latest | YAML parse confirms matrix `["ubuntu-latest","macos-latest"]`, 5 steps, no `needs:` key |
| CI runs `build:web-host` and `test:web-contract` independently | Steps 4-5 are `npm run build:web-host` and `npm run test:web-contract`; no dependency on existing `build` job |
| All doc paths/commands/view names match codebase | S02/T03 7-check verification: source paths exist, 6 view names match KNOWN_VIEWS, CLI flags match cli-web-branch.ts, 6 env vars match web-mode.ts, cross-references resolve, command classification (20/9/1) matches dispatch, API route count = 23 |
| `test:web-contract` script exists and works | `npm run test:web-contract` → 256 pass, 0 fail, 12 files, ~9s |
| Cross-references resolve | Link resolution check: zero broken file links across all 8 updated docs |
| R111 and R112 validated | See requirement outcomes below |

## Requirement Changes

- R111: active → validated — `docs/web-mode.md` exists with all required sections. README docs index, command table, getting-started, and architecture sections reference web mode. `docs/README.md` has entry. All 5 existing docs updated. 7-check accuracy verification passed with zero discrepancies. Zero broken cross-reference links.
- R112: active → validated — `test:web-contract` script passes locally (256/256, 12 files). `web-build` CI job has correct matrix, steps, and independence. Structural verification complete; first real CI run occurs on merge.

## Forward Intelligence

### What the next milestone should know
- Web mode documentation is complete and verified against the post-M003 codebase. No documentation debt remains.
- The CI `web-build` job is structurally verified but has not yet run on GitHub Actions. The first push after merge is the real proof — monitor it for platform-specific failures, especially `build:web-host` on ubuntu-latest.
- All 30 `/gsd` subcommands, 6 workspace views, 23 API routes, and 6 `GSD_WEB_*` env vars are documented. If M005 or later milestones add new commands, views, routes, or env vars, `docs/web-mode.md` needs updating.

### What's fragile
- Command classification counts (20 surface, 9 passthrough, 1 help) are hardcoded in docs — adding or reclassifying subcommands requires a doc update.
- API route count (23) is documented as a number — new routes require updating the architecture section.
- `build:web-host` on Linux CI is the primary untested risk — the standalone Next.js build has only run on macOS locally.
- `--test-force-exit` masks underlying open-handle cleanup in 6 test files — removing it requires fixing the server module imports.

### Authoritative diagnostics
- `npm run test:web-contract` — 256 tests, 12 files, per-file pass/fail; the single source of truth for web contract test health.
- `rg -i "web mode|--web|gsd --web" docs/ README.md | cut -d: -f1 | sort -u` — confirms cross-reference coverage across all 8 files.
- `web-build` job in GitHub Actions — per-OS pass/fail visible as a separate check (once first run completes).

### What assumptions changed
- Original plan estimated 15 web contract test files; actual count is 12 files with 256 tests.
- `--test-force-exit` was not anticipated but is required for reliable CI execution.
- No platform-specific surprises during local verification, but Linux CI remains the open risk.

## Files Created/Modified

- `docs/web-mode.md` — complete web mode guide (270 lines, 7 sections)
- `README.md` — web mode in docs index, command table, getting-started, architecture
- `docs/README.md` — web mode row in User Documentation table
- `docs/getting-started.md` — Web Mode subsection
- `docs/architecture.md` — Web Mode section with architecture diagram
- `docs/commands.md` — Web Mode section with CLI flags and dispatch note
- `docs/configuration.md` — Web Mode Environment Variables section
- `docs/troubleshooting.md` — Web Mode Issues section
- `package.json` — added `test:web-contract` script
- `.github/workflows/ci.yml` — added `web-build` job with matrix strategy
