# M004: Web Mode Documentation and CI/CD Integration

**Vision:** Users can discover, learn, and troubleshoot `gsd --web` from the docs, and web host regressions are caught in CI before merge.

## Success Criteria

- A new user reading the README discovers `gsd --web` within the first screen of the documentation index and can navigate to a complete web mode guide
- `docs/web-mode.md` covers launch, onboarding, workspace views (dashboard, power, roadmap, files, activity, visualizer), browser commands (30 subcommands: 20 surface, 9 passthrough, 1 help), architecture (parent launcher → packaged host → bridge → store), configuration, and troubleshooting
- Existing docs (`architecture.md`, `troubleshooting.md`, `commands.md`, `getting-started.md`, `configuration.md`) and `docs/README.md` reference web mode accurately where relevant
- The CI `web-build` job runs on ubuntu-latest and macos-latest, executes `npm run build:web-host`, runs web contract tests, and reports pass/fail independently from the existing `build` job
- All documentation paths, commands, view names, and configuration references match the post-M003 codebase

## Key Risks / Unknowns

- **`build:web-host` on Linux CI** — The standalone Next.js build (with `src/web/` service file tracing) has only run on macOS locally. GitHub Actions ubuntu runners may surface platform-specific failures. This is the primary technical risk.
- **Web contract test isolation in CI** — Some web contract tests import from `web/lib/` which may have Next.js module resolution assumptions. Import failures in CI would require test glob filtering.
- **macOS CI runner cost** — GitHub Actions macOS runners are 10x Linux cost. The justification is that the packaged host targets macOS users; but the Next.js standalone build and Node test runner should be platform-agnostic. Worth documenting the tradeoff.

## Proof Strategy

- `build:web-host` on Linux → retire in S01 by running the real standalone build in the CI job on ubuntu-latest and verifying exit 0
- Web contract test isolation → retire in S01 by running `test:web-contract` in CI and verifying all 15 web contract test files pass

## Verification Classes

- Contract verification: `rg -i "web mode\|--web\|gsd --web" docs/ README.md` returns hits in all targeted files; web contract tests pass in CI; `actionlint` on ci.yml; cross-reference resolution checks
- Integration verification: CI job passes on a real push to the worktree branch on both ubuntu-latest and macos-latest
- Operational verification: none — no runtime services
- UAT / human verification: none — documentation accuracy is mechanically verifiable against source

## Milestone Definition of Done

This milestone is complete only when all are true:

- `docs/web-mode.md` exists with complete coverage of launch, onboarding, workspace, commands, architecture, configuration, and troubleshooting
- README documentation index includes web mode guide; command table includes `gsd --web`; getting-started and architecture sections reference web mode
- `docs/README.md` has a web mode entry in the user documentation table
- `architecture.md`, `troubleshooting.md`, `commands.md`, `getting-started.md`, `configuration.md` each reference web mode where relevant
- `.github/workflows/ci.yml` has a `web-build` job with `matrix: [ubuntu-latest, macos-latest]`
- CI job runs `npm run build:web-host` and `npm run test:web-contract` independently from existing jobs
- Every file path, CLI command, view name, and config reference in docs matches the actual codebase
- `npm run test:web-contract` script exists in `package.json` and targets web contract test files
- All cross-references between docs resolve (no broken `[text](./file.md#anchor)` links)
- R111 and R112 are validated with specific proof

## Requirement Coverage

- Covers: R111 (web mode documentation), R112 (CI web-build job)
- Partially covers: none
- Leaves for later: none
- Orphan risks: none — all active requirements addressed

## Slices

- [x] **S01: CI web-build job** `risk:medium` `depends:[]`
  > After this: pushing to the branch triggers a `web-build` CI job on ubuntu-latest and macos-latest that builds the web host and runs web contract tests, reporting pass/fail independently from the existing `build` job.
- [x] **S02: Web mode documentation** `risk:low` `depends:[]`
  > After this: `docs/web-mode.md` is a complete guide to `gsd --web`; the README, docs index, and 5 existing docs all reference web mode accurately; all paths, commands, and view names are verified against the codebase.

## Boundary Map

### S01

Produces:
- `package.json` `test:web-contract` script targeting `src/tests/web-*.test.ts` (11 web contract test files)
- `.github/workflows/ci.yml` `web-build` job with matrix `[ubuntu-latest, macos-latest]`, running `build:web-host` and `test:web-contract`

Consumes:
- nothing (independent slice)

### S02

Produces:
- `docs/web-mode.md` — complete web mode guide
- Updated `README.md` — documentation index, command table, getting-started, architecture sections
- Updated `docs/README.md` — web mode entry in user docs table
- Updated `docs/architecture.md`, `docs/troubleshooting.md`, `docs/commands.md`, `docs/getting-started.md`, `docs/configuration.md` — web mode references

Consumes:
- nothing (independent slice, does not depend on S01)
