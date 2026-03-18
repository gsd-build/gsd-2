# M010: Upstream Sync v2.22→v2.28 — Research

**Date:** 2026-03-18

## Summary

This merge covers 223 upstream commits across 291 files changed (34K insertions, 7K deletions) from v2.22.0 to v2.28.0. A dry-run merge reveals **only 7 files with conflicts** (10 hunks total) — dramatically fewer than M003's 50-file merge. The high-risk file `auto.ts` (12 fork commits, 46 upstream commits) auto-merges cleanly because fork and upstream changes target different regions. The `src/web/` and `web/` directories have zero upstream changes — the entire web skin is fork-only and untouched by this merge.

**Critical scope correction:** Park/discard (#1107), /gsd keys (#1089), and commands.ts decomposition are NOT in v2.28.0 — they landed post-v2.28.0. Only the session picker (#721) is in scope. R127 and R129 need deferral.

**Recommendation:** Merge to v2.28.0 as planned. Build session picker web UI (R128). Defer R127 (park/discard) and R129 (/gsd keys) to a future milestone.

## Recommendation

Big-bang merge to v2.28.0 tag. 7 conflict files, 10 hunks. Session picker web UI only. Defer post-v2.28 features.

## Implementation Landscape

### Key Files — Conflict Resolution (7 files)

- `src/cli.ts` — 2 hunks. Keep fork web additions + upstream session picker + headless.
- `src/resource-loader.ts` — 2 hunks. Take upstream, preserve fork additions.
- `src/resources/extensions/gsd/state.ts` — 2 hunks. Most nuanced — both modify deriveState.
- `packages/pi-coding-agent/src/core/settings-manager.ts` — 1 hunk.
- `src/resources/extensions/gsd/tests/derive-state-db.test.ts` — 1 hunk.
- `src/resources/extensions/gsd/workspace-index.ts` — 1 hunk.
- `src/tests/github-client.test.ts` — 1 hunk.

### Build Order

1. Merge + resolve 7 conflicts + clean dist + both builds green
2. Fix tests and type mirrors
3. Session picker web UI evaluation (R128)
4. Polish and regression

### Verification

- Zero conflict markers, both builds exit 0, test parity with baseline, all 223 commits in history.