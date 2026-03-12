---
phase: 5
slug: slice-detail-active-task
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | None — bun:test works by convention |
| **Quick run command** | `cd packages/mission-control && bun test tests/slice-detail.test.tsx tests/active-task.test.tsx` |
| **Full suite command** | `cd packages/mission-control && bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/mission-control && bun test tests/slice-detail.test.tsx tests/active-task.test.tsx`
- **After every plan wave:** Run `cd packages/mission-control && bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | SLCD-01 | unit | `bun test tests/slice-detail.test.tsx -t "ContextBudgetChart"` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | SLCD-02 | unit | `bun test tests/slice-detail.test.tsx -t "BoundaryMap"` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | SLCD-03 | unit | `bun test tests/slice-detail.test.tsx -t "UatStatus"` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | TASK-01 | unit | `bun test tests/active-task.test.tsx -t "TaskExecuting"` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | TASK-02 | unit | `bun test tests/active-task.test.tsx -t "MustHavesList"` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 1 | TASK-03 | unit | `bun test tests/active-task.test.tsx -t "TargetFiles"` | ❌ W0 | ⬜ pending |
| 05-02-04 | 02 | 1 | TASK-04 | unit | `bun test tests/active-task.test.tsx -t "CheckpointRef"` | ❌ W0 | ⬜ pending |
| 05-02-05 | 02 | 1 | TASK-05 | unit | `bun test tests/active-task.test.tsx -t "TaskWaiting"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/slice-detail.test.tsx` — stubs for SLCD-01, SLCD-02, SLCD-03
- [ ] `tests/active-task.test.tsx` — stubs for TASK-01, TASK-02, TASK-03, TASK-04, TASK-05
- [ ] `tests/state-deriver-phase5.test.ts` — covers state deriver extensions for must_haves, verification parsing

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pulsing amber dot animation | TASK-01 | CSS animation timing | Inspect executing state visually, verify amber dot pulses |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
