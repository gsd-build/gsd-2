---
phase: 9
slug: live-preview
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Bun native), happy-dom for React component tests |
| **Config file** | none — Bun discovers `tests/*.test.ts` and `tests/*.test.tsx` automatically |
| **Quick run command** | `cd packages/mission-control && bun test tests/proxy-api.test.ts tests/mode-interceptor.test.ts tests/session-persistence.test.ts tests/usePreview.test.ts` |
| **Full suite command** | `cd packages/mission-control && bun test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/mission-control && bun test tests/proxy-api.test.ts tests/mode-interceptor.test.ts tests/session-persistence.test.ts tests/usePreview.test.ts`
- **After every plan wave:** Run `cd packages/mission-control && bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-W0-01 | W0 | 0 | SERV-06, PREV-03, PREV-04 | unit | `bun test tests/proxy-api.test.ts` | ❌ W0 | ⬜ pending |
| 9-W0-02 | W0 | 0 | SERV-07 | unit | `bun test tests/session-persistence.test.ts` | ❌ W0 | ⬜ pending |
| 9-W0-03 | W0 | 0 | PREV-01 | unit (hook) | `bun test tests/usePreview.test.ts` | ❌ W0 | ⬜ pending |
| 9-W0-04 | W0 | 0 | PREV-02 | unit (component) | `bun test tests/preview-panel.test.tsx` | ❌ W0 | ⬜ pending |
| 9-W0-05 | W0 | 0 | PREV-03 (URL detection) | unit | `bun test tests/mode-interceptor.test.ts` | ✅ exists | ⬜ pending |
| 9-01-xx | 01 | 1 | SERV-06 | unit | `bun test tests/proxy-api.test.ts -t "proxy"` | ❌ W0 | ⬜ pending |
| 9-01-xx | 01 | 1 | SERV-07 | unit | `bun test tests/session-persistence.test.ts` | ❌ W0 | ⬜ pending |
| 9-02-xx | 02 | 1 | PREV-01 | unit (hook) | `bun test tests/usePreview.test.ts` | ❌ W0 | ⬜ pending |
| 9-02-xx | 02 | 1 | PREV-02 | unit (component) | `bun test tests/preview-panel.test.tsx` | ❌ W0 | ⬜ pending |
| 9-02-xx | 02 | 1 | PREV-03 | unit | `bun test tests/proxy-api.test.ts` | ❌ W0 | ⬜ pending |
| 9-02-xx | 02 | 1 | PREV-04 | unit | `bun test tests/proxy-api.test.ts -t "offline"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/proxy-api.test.ts` — stubs for SERV-06, PREV-03, PREV-04 (proxy forwards, strips headers, returns 503 HTML when offline)
- [ ] `tests/session-persistence.test.ts` — stubs for SERV-07 (reads/writes layout prefs, chat history capped at 50, viewport)
- [ ] `tests/usePreview.test.ts` — stubs for PREV-01 (hook: Cmd+P toggles, toggle button triggers same state)
- [ ] `tests/preview-panel.test.tsx` — stubs for PREV-02 (viewport switcher cycles Desktop/Tablet/Mobile/Dual, Dual renders two device frames)
- [ ] Extend `tests/mode-interceptor.test.ts` — URL detection extracts port from `localhost:PORT`, excludes ports 4000/4001, no false positives

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Slide-in animation renders correctly | PREV-01 | Visual/animation behavior not assertable in jsdom | Toggle preview open, verify panel slides from right with correct duration |
| Device frames (iPhone 14 + Pixel) display correctly in Dual mode | PREV-02 | CSS/SVG rendering verification | Select Dual viewport, verify both device frames render side by side |
| Live proxy forwards real dev server content into iframe | PREV-03 | Requires running dev server process | Start a dev server on e.g. port 3000, open Mission Control, verify iframe loads content |
| CSP/X-Frame-Options stripping works in practice | PREV-03 | Depends on user dev server config | Smoke test: verify iframe is not blocked on a Vite dev server response |
| Auto-open on stdout URL detection | PREV-03 | Requires running Claude Code process | Run a task that starts a dev server, verify preview panel auto-opens |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
