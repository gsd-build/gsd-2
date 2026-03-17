---
estimated_steps: 7
estimated_files: 7
---

# T02: Update README and existing docs

**Slice:** S02 — Web Mode Documentation
**Milestone:** M004

## Description

Add web mode references to the README, docs index, and 5 existing docs. Each update should match the tone and depth of the surrounding content — bolt-on sections, not rewrites.

## Steps

1. `README.md` — Add `[Web Mode](./docs/web-mode.md)` entry to the documentation index (after Getting Started). Add `gsd --web [path]` row to the command table. Add a brief web mode paragraph in the getting-started section. Add a one-paragraph web mode note in the architecture overview.
2. `docs/README.md` — Add a web mode row to the User Documentation table: `[Web Mode](./web-mode.md)` with description "Browser-first workspace — launch, UI, commands, and architecture"
3. `docs/getting-started.md` — Add a "Web Mode" subsection (3-5 lines) after the main launch instructions, mentioning `gsd --web` and linking to the full guide.
4. `docs/architecture.md` — Add a "Web Mode" section (~15-20 lines) covering the parent launcher → host → bridge → store architecture. Link to the full guide for details.
5. `docs/commands.md` — Add `gsd --web [path]`, `gsd web start [path]`, `gsd web stop` to the CLI flags/commands section. Add a brief note about browser command dispatch.
6. `docs/configuration.md` — Add a "Web Mode" section listing `GSD_WEB_*` env vars with descriptions.
7. `docs/troubleshooting.md` — Add a "Web Mode Issues" section covering port conflicts, bridge disconnects, and build failures.

## Must-Haves

- [ ] All 7 files updated
- [ ] Each update matches the surrounding content's tone and structure
- [ ] All `[text](./path)` cross-references point to existing files
- [ ] No duplicate content between the guide and these updates — updates are pointers/summaries with links

## Verification

- `rg -i "web mode\|--web\|gsd --web" docs/ README.md | cut -d: -f1 | sort -u | wc -l` returns 8
- All `[text](./path)` links verified to resolve

## Observability Impact

This task is documentation-only — no runtime code is changed.

- **Inspection surface:** `rg -i "web mode\|--web\|gsd --web" docs/ README.md | cut -d: -f1 | sort -u` confirms cross-reference coverage across all 8 target files.
- **Failure visibility:** Broken cross-reference links (`[text](./path.md)` pointing to non-existent files) are detectable by iterating extracted relative links and running `test -f` on each resolved path.
- **No runtime signals changed.** No env vars, log lines, error messages, or status surfaces are modified.

## Inputs

- `docs/web-mode.md` — the guide written in T01 (for cross-referencing)
- Existing files for tone/structure reference

## Expected Output

- `README.md` — updated with web mode in docs index, command table, getting-started, architecture
- `docs/README.md` — updated table with web mode entry
- `docs/getting-started.md` — new Web Mode subsection
- `docs/architecture.md` — new Web Mode section
- `docs/commands.md` — new web CLI entries and browser dispatch note
- `docs/configuration.md` — new Web Mode env vars section
- `docs/troubleshooting.md` — new Web Mode Issues section
