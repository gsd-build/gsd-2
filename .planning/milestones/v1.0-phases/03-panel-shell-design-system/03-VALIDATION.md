---
phase: 3
slug: panel-shell-design-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test runner (built-in) |
| **Config file** | none — Bun test runs by convention from tests/ |
| **Quick run command** | `cd packages/mission-control && bun test` |
| **Full suite command** | `cd packages/mission-control && bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/mission-control && bun test`
- **After every plan wave:** Run `cd packages/mission-control && bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | PNLS-01 | unit | `bun test tests/panel-shell.test.tsx -t "default sizes"` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 0 | PNLS-04 | unit | `bun test tests/panel-states.test.tsx` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 0 | PNLS-03 | unit | `bun test tests/layout-storage.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 0 | PNLS-05 | unit | `bun test tests/design-tokens.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 0 | PNLS-06 | unit | `bun test tests/design-tokens.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | PNLS-02 | manual-only | Visual verification — drag interaction | N/A | ⬜ pending |
| 03-02-02 | 02 | 1 | PNLS-07 | manual-only | Visual verification — spacing review | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/panel-shell.test.tsx` — stubs for PNLS-01, PNLS-02 (render assertions)
- [ ] `tests/panel-states.test.tsx` — stubs for PNLS-04 (loading/empty/error rendering)
- [ ] `tests/layout-storage.test.ts` — stubs for PNLS-03 (storage adapter)
- [ ] `tests/design-tokens.test.ts` — stubs for PNLS-05, PNLS-06 (CSS variable assertions)
- [ ] React test dependencies: may need `@testing-library/react` or `happy-dom` for component tests with Bun

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Panels resizable via drag handles | PNLS-02 | Drag interaction requires browser | Open dashboard, drag panel borders, verify resize |
| 8-point spacing grid | PNLS-07 | Visual spacing review | Inspect computed styles, verify multiples of 8px |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
