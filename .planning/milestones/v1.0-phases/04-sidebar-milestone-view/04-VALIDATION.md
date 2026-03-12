---
phase: 4
slug: sidebar-milestone-view
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | None — bun:test works by convention |
| **Quick run command** | `bun test tests/sidebar.test.tsx tests/milestone.test.tsx` |
| **Full suite command** | `cd packages/mission-control && bun test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/sidebar.test.tsx tests/milestone.test.tsx`
- **After every plan wave:** Run `cd packages/mission-control && bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | SIDE-01 | unit | `bun test tests/sidebar.test.tsx -t "logo"` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | SIDE-02 | unit | `bun test tests/sidebar.test.tsx -t "project"` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | SIDE-03 | unit | `bun test tests/sidebar.test.tsx -t "nav"` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | SIDE-04 | unit | `bun test tests/sidebar.test.tsx -t "connection"` | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 1 | SIDE-05 | unit | `bun test tests/sidebar.test.tsx -t "model"` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | MLST-01 | unit | `bun test tests/milestone.test.tsx -t "header"` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | MLST-02 | unit | `bun test tests/milestone.test.tsx -t "phase row"` | ❌ W0 | ⬜ pending |
| 04-02-03 | 02 | 2 | MLST-03 | unit | `bun test tests/milestone.test.tsx -t "commit"` | ❌ W0 | ⬜ pending |
| 04-02-04 | 02 | 2 | MLST-04 | unit | `bun test tests/milestone.test.tsx -t "history"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sidebar.test.tsx` — stubs for SIDE-01 through SIDE-05
- [ ] `tests/milestone.test.tsx` — stubs for MLST-01 through MLST-04

*Existing test infrastructure (bun:test + happy-dom) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GSD pixel-art logo visual quality | SIDE-01 | SVG rendering quality is visual | Inspect logo in browser at 1x and 2x zoom |
| Overall layout visual coherence | ALL | Design system consistency | Compare against design tokens spec |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
