---
phase: 6
slug: chat-panel-claude-code-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test (built-in, `bun:test`) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test --filter <pattern>` |
| **Full suite command** | `bun test` (from packages/mission-control) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test --filter <changed-module>`
- **After every plan wave:** Run `bun test` (full suite from packages/mission-control)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | CHAT-01 | unit | `bun test tests/chat-input.test.tsx` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 0 | CHAT-06 | unit | `bun test tests/chat-input.test.tsx` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 0 | CHAT-02 | integration | `bun test tests/claude-process.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 0 | CHAT-03 | unit | `bun test tests/ndjson-parser.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-05 | 01 | 0 | CHAT-04 | unit | `bun test tests/chat-message.test.tsx` | ❌ W0 | ⬜ pending |
| 06-01-06 | 01 | 0 | CHAT-07 | unit | `bun test tests/chat-router.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/claude-process.test.ts` — stubs for CHAT-02 (spawn + stream parsing, mock process)
- [ ] `tests/ndjson-parser.test.ts` — stubs for CHAT-03 (pure function, fixture data)
- [ ] `tests/chat-router.test.ts` — stubs for CHAT-07 (routing performance, prefix matching)
- [ ] `tests/chat-input.test.tsx` — stubs for CHAT-01, CHAT-06 (autocomplete, command history)
- [ ] `tests/chat-message.test.tsx` — stubs for CHAT-04 (visual differentiation by role)

*Existing infrastructure covers CHAT-05 (file watcher pipeline already tested).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Token-by-token rendering visible in UI | CHAT-03 | Visual streaming timing cannot be automated | Send message, observe tokens appearing incrementally |
| State panels animate during execution | CHAT-05 | Animation timing is visual | Run a file-writing command, observe panel updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
