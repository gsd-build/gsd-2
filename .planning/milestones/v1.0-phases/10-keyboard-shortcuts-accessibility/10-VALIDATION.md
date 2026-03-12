---
phase: 10
slug: keyboard-shortcuts-accessibility
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in Bun test runner) |
| **Config file** | packages/mission-control/bunfig.toml |
| **Quick run command** | `cd packages/mission-control && bun test tests/keyboard-accessibility.test.ts` |
| **Full suite command** | `cd packages/mission-control && bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/mission-control && bun test tests/keyboard-accessibility.test.ts`
- **After every plan wave:** Run `cd packages/mission-control && bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-W0-01 | W0 | 0 | KEYS-01 through KEYS-06 | unit stub | `bun test tests/keyboard-accessibility.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-01 | 01 | 1 | KEYS-01 | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | KEYS-01 | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | KEYS-02 | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-04 | 01 | 1 | KEYS-06 | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | KEYS-03 | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 2 | KEYS-04 | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-03 | 02 | 2 | KEYS-05 | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/keyboard-accessibility.test.ts` — stubs for KEYS-01 through KEYS-06

*All tests are new — no existing test file covers keyboard/accessibility requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Command palette opens visually and fuzzy search works | KEYS-01 | Requires browser rendering + keyboard interaction | Press Ctrl+Shift+P, type partial command name, verify results filter |
| Focus ring is visually visible on panel switch | KEYS-02 | CSS :focus-visible requires visual inspection | Tab through panels, verify distinct visible focus ring |
| cmdk + React 19 compatibility | KEYS-01 | Runtime compatibility not confirmed in docs | Install cmdk, run dev server, smoke-test command palette |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
