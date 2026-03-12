---
phase: 09-live-preview
plan: "04"
subsystem: live-preview
tags: [viewport-persistence, session, gap-closure, SERV-07]
dependency_graph:
  requires: [09-03-PLAN.md]
  provides: [viewport-persistence-wired]
  affects: [PreviewPanelWithState, AppShell, usePreview, session-persistence-api]
tech_stack:
  added: []
  patterns: [initialViewport-prop-seeding, onViewportChange-lift, handleViewportChange-wrapper]
key_files:
  created: []
  modified:
    - packages/mission-control/src/components/preview/PreviewPanelWithState.tsx
    - packages/mission-control/src/components/layout/AppShell.tsx
decisions:
  - "[Phase 09-live-preview]: initialViewport prop seeds useState in PreviewPanelWithState; onViewportChange callback lifts user changes to AppShell's usePreview setViewport for writeSession persistence"
metrics:
  duration: 2min
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_modified: 2
requirements:
  - SERV-07
---

# Phase 09 Plan 04: Viewport Persistence Wiring Summary

**One-liner:** Wired session-restored viewport from usePreview into PreviewPanelWithState via initialViewport/onViewportChange props, closing the SERV-07 persistence gap.

## What Was Built

The Phase 09 verification report identified a gap: PreviewPanelWithState always initialized viewport to "desktop" and never received the session-restored value from usePreview. Likewise, user viewport changes inside the panel were never lifted back to AppShell for writeSession persistence.

This plan closes that gap with two small, targeted edits:

1. **PreviewPanelWithState** gained `initialViewport?: Viewport` (seeds useState) and `onViewportChange?: (v: Viewport) => void` (lifted callback). A `handleViewportChange` wrapper calls both the internal `setViewport` and the optional callback.

2. **AppShell** passes `initialViewport={viewport}` and `onViewportChange={setViewport}` to PreviewPanelWithState, completing the bidirectional wiring: session data flows in via initialViewport, user changes flow out via onViewportChange -> setViewport -> writeSession effect.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add initialViewport and onViewportChange props to PreviewPanelWithState | e1c8986 |
| 2 | Wire viewport and onViewportChange through AppShell | c4c0d8f |

## Verification

- All 22 preview-panel tests: GREEN
- Full test suite: 484 pass / 9 fail (same 9 pre-existing failures, no new failures)
- TypeScript: tsc not installed as project dep; build uses Bun/Vite (no TS errors surfaced in test run)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `packages/mission-control/src/components/preview/PreviewPanelWithState.tsx` — FOUND
- `packages/mission-control/src/components/layout/AppShell.tsx` — FOUND
- Commit e1c8986 — FOUND
- Commit c4c0d8f — FOUND
