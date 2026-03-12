---
phase: 7
slug: session-flow-animation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test runner (built-in, Jest-compatible API) |
| **Config file** | bunfig.toml (minimal, serves static plugin) |
| **Quick run command** | `bun test --filter session` |
| **Full suite command** | `cd packages/mission-control && bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/session-flow.test.tsx tests/animations.test.tsx`
- **After every plan wave:** Run `cd packages/mission-control && bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 0 | SESS-01 | unit | `bun test tests/session-flow.test.tsx -t "onboarding"` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 0 | SESS-02 | unit | `bun test tests/session-flow.test.tsx -t "resume"` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 0 | SESS-03 | unit | `bun test tests/session-flow.test.tsx -t "selector"` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 0 | SESS-04 | unit | `bun test tests/session-perf.test.ts -t "800ms"` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 0 | ANIM-01 | unit | `bun test tests/animations.test.tsx -t "logo"` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 0 | ANIM-02 | unit | `bun test tests/animations.test.tsx -t "loading"` | ❌ W0 | ⬜ pending |
| 07-02-03 | 02 | 0 | ANIM-03 | unit | `bun test tests/animations.test.tsx -t "stagger"` | ❌ W0 | ⬜ pending |
| 07-02-04 | 02 | 0 | ANIM-04 | unit | `bun test tests/animations.test.tsx -t "pulse"` | ❌ W0 | ⬜ pending |
| 07-02-05 | 02 | 0 | ANIM-05 | unit | `bun test tests/animations.test.tsx -t "slide"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/session-flow.test.tsx` — stubs for SESS-01, SESS-02, SESS-03
- [ ] `tests/session-perf.test.ts` — stubs for SESS-04
- [ ] `tests/animations.test.tsx` — stubs for ANIM-01 through ANIM-05
- [ ] `tests/session-status-api.test.ts` — covers server-side continue-here detection
- [ ] `src/styles/animations.css` — custom @keyframes (no framework needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual smoothness of logo animation | ANIM-01 | Perceived quality requires human eye | Open app, observe 600ms logo build animation for jank |
| Stagger timing feels natural | ANIM-03 | Timing perception is subjective | Open dashboard, verify panel fade-in feels sequential not simultaneous |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
