---
id: T02
parent: S02
milestone: M004
provides:
  - Web mode cross-references in README.md, docs/README.md, docs/getting-started.md, docs/architecture.md, docs/commands.md, docs/configuration.md, docs/troubleshooting.md
key_files:
  - README.md
  - docs/README.md
  - docs/getting-started.md
  - docs/architecture.md
  - docs/commands.md
  - docs/configuration.md
  - docs/troubleshooting.md
key_decisions:
  - none
patterns_established:
  - Cross-reference updates are summaries/pointers with links to the full guide, not duplicated content
observability_surfaces:
  - none (documentation-only task)
duration: 10m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: Update README and existing docs

**Added web mode references to README and 6 existing docs — docs index, command table, getting-started section, architecture overview, CLI flags, env vars, and troubleshooting.**

## What Happened

Updated all 7 target files with web mode cross-references, matching each file's existing tone and structure:

1. **README.md** — Added `[Web Mode](./docs/web-mode.md)` to docs index (after Getting Started), `gsd --web [path]` row to command table, a "Web Mode" subsection in getting-started with `gsd --web` example, and a "Web Mode" paragraph in the architecture section describing the launcher → host → bridge → store layering.

2. **docs/README.md** — Added `[Web Mode](./web-mode.md)` row to User Documentation table with description "Browser-first workspace — launch, UI, commands, and architecture".

3. **docs/getting-started.md** — Added "Web Mode" subsection (4 lines) after Auto Mode, mentioning `gsd --web` and `gsd web stop` with link to full guide.

4. **docs/architecture.md** — Added "Web Mode" section (~20 lines) covering parent launcher → standalone host → bridge singleton → workspace store architecture with ASCII diagram and link to full guide.

5. **docs/commands.md** — Added "Web Mode" section with `gsd --web [path]`, `gsd web start [path]`, `gsd web stop [path]` in a table, plus browser command dispatch note linking to the guide.

6. **docs/configuration.md** — Added "Web Mode Environment Variables" section listing all 6 `GSD_WEB_*` env vars with descriptions and defaults in a table.

7. **docs/troubleshooting.md** — Added "Web Mode Issues" section covering port conflicts, bridge disconnects, build failures, and stale PID files with link to the guide.

## Verification

- `rg -i "web mode|--web|gsd --web" docs/ README.md | cut -d: -f1 | sort -u | wc -l` → **8** (all target files) ✓
- All `[text](./path.md)` cross-references resolve to existing files ✓
- `docs/README.md` table row count increased by 1 ✓
- No duplicate content — all updates are summaries/pointers with links to `docs/web-mode.md` ✓

### Slice-level checks (partial — intermediate task):
- `rg -i "web mode|--web|gsd --web" docs/ README.md | cut -d: -f1 | sort -u` → all 8 target files ✓
- `test -f docs/web-mode.md` → PASS ✓
- Every `[text](./file.md)` cross-reference resolves → PASS ✓
- `docs/README.md` table row count increased by 1 → PASS ✓
- CLI flags match: `--web`, `web start`, `web stop` present in commands.md and getting-started.md ✓
- Env vars match: all 6 `GSD_WEB_*` vars in configuration.md ✓
- Remaining checks (view names vs source, API route count vs source, command classification vs source) — deferred to T03 verification task

## Diagnostics

Documentation-only — no runtime inspection surfaces. Verify cross-reference coverage:
```bash
rg -i "web mode|--web|gsd --web" docs/ README.md | cut -d: -f1 | sort -u
```

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `README.md` — added web mode to docs index, command table, getting-started, architecture
- `docs/README.md` — added web mode row to User Documentation table
- `docs/getting-started.md` — added Web Mode subsection
- `docs/architecture.md` — added Web Mode section with architecture diagram
- `docs/commands.md` — added Web Mode section with CLI flags and dispatch note
- `docs/configuration.md` — added Web Mode Environment Variables section
- `docs/troubleshooting.md` — added Web Mode Issues section
- `.gsd/milestones/M004/slices/S02/S02-PLAN.md` — marked T02 done, added diagnostic verification step (pre-flight fix)
- `.gsd/milestones/M004/slices/S02/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
