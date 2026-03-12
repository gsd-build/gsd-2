---
phase: 8
slug: discuss-review-modes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test 1.3.10 (built-in) |
| **Config file** | `bunfig.toml` |
| **Quick run command** | `cd packages/mission-control && bun test tests/discuss-review.test.tsx tests/mode-interceptor.test.ts --timeout 5000` |
| **Full suite command** | `cd packages/mission-control && bun test tests/ --timeout 10000` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/mission-control && bun test tests/discuss-review.test.tsx tests/mode-interceptor.test.ts --timeout 5000`
- **After every plan wave:** Run `cd packages/mission-control && bun test tests/ --timeout 10000`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 0 | DISC-01 | unit | `bun test tests/mode-interceptor.test.ts` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 0 | DISC-02, DISC-03, DISC-04, DISC-05, DISC-06 | unit | `bun test tests/discuss-review.test.tsx` | ❌ W0 | ⬜ pending |
| 8-01-03 | 01 | 0 | REVW-01, REVW-02, REVW-03, REVW-04 | unit | `bun test tests/discuss-review.test.tsx` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 1 | DISC-01 | unit | `bun test tests/mode-interceptor.test.ts` | ❌ W0 | ⬜ pending |
| 8-02-02 | 02 | 1 | DISC-02, DISC-03, DISC-04, DISC-05 | unit | `bun test tests/discuss-review.test.tsx` | ❌ W0 | ⬜ pending |
| 8-02-03 | 02 | 1 | DISC-06 | unit | `bun test tests/discuss-review.test.tsx` | ❌ W0 | ⬜ pending |
| 8-03-01 | 03 | 2 | REVW-01, REVW-02 | unit | `bun test tests/discuss-review.test.tsx` | ❌ W0 | ⬜ pending |
| 8-03-02 | 03 | 2 | REVW-03, REVW-04 | unit | `bun test tests/discuss-review.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/mode-interceptor.test.ts` — pure function tests for `parseStreamForModeEvents` (DISC-01)
- [ ] `tests/discuss-review.test.tsx` — covers DISC-02 through DISC-06, REVW-01 through REVW-04
- Framework install: none needed — `bun test` already works

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Overlay dims chat messages visually | DISC-01 | Visual rendering requires browser | Run `/gsd:discuss-phase` in Mission Control, verify messages appear dimmed behind question card |
| Decision log drawer slides in from right | DISC-06 | CSS animation requires browser | Answer first question, verify drawer animates in from right edge |
| Review score count-up on view mount | REVW-02 | `requestAnimationFrame` requires browser | Run `/gsd:ui-review`, verify scores animate from 0 to final value on ReviewView open |
| Fix button dismisses ReviewView and sends chat | REVW-04 | Integration requires live Claude process | Click Fix on action card, verify ReviewView closes and pre-drafted message appears in chat |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
