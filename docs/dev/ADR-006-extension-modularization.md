# ADR-006: Extension Modularization & Install Infrastructure

**Status:** Proposed (canonical text on GitHub)
**Date:** 2026-03-28
**Deciders:** Jeremy McSpadden
**Canonical location:** [Issue #2995](https://github.com/gsd-build/gsd-2/issues/2995)

## Pointer

This ADR's full text lives on the GitHub issue tracker so the discussion thread, label state (`accepted`, `priority: high`, `area: gsd-extension`), and milestone progress stay in one place. This file exists only so the local ADR sequence has no gap and cross-references from ADR-007 resolve to a real path.

## One-line summary

Modularize GSD2 across 7 milestones (v1.3–v1.9): split the 177K-LOC core `gsd` extension, introduce an `npm`-package-based extension install/uninstall/update surface, lazy-load provider SDKs, and ship a `~450 MB` default install instead of `~842 MB`.

See [Issue #2995](https://github.com/gsd-build/gsd-2/issues/2995) for the full Context / Decision / Milestone breakdown / Success Metrics / Risks / Consequences.
