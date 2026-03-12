---
phase: 2
slug: file-to-state-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none — bun:test works zero-config |
| **Quick run command** | `bun test packages/mission-control/tests/` |
| **Full suite command** | `bun test packages/mission-control/tests/ --timeout 30000` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test packages/mission-control/tests/ --timeout 15000`
- **After every plan wave:** Run `bun test packages/mission-control/tests/ --timeout 30000`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | SERV-02 | integration | `bun test packages/mission-control/tests/watcher.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 0 | SERV-03 | unit | `bun test packages/mission-control/tests/state-deriver.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 0 | SERV-04 | integration | `bun test packages/mission-control/tests/ws-server.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 0 | SERV-05 | integration | `bun test packages/mission-control/tests/pipeline-perf.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 0 | SERV-08 | unit | `bun test packages/mission-control/tests/reconnect.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-06 | 01 | 0 | SERV-09 | integration | `bun test packages/mission-control/tests/state-deriver.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/watcher.test.ts` — stubs for SERV-02 (file watcher with debounce, recursive detection)
- [ ] `tests/state-deriver.test.ts` — stubs for SERV-03, SERV-09 (parsing all .planning/ file types, full state rebuild)
- [ ] `tests/ws-server.test.ts` — stubs for SERV-04 (WebSocket connection, diff push, full state on connect)
- [ ] `tests/pipeline-perf.test.ts` — stubs for SERV-05 (end-to-end latency measurement)
- [ ] `tests/reconnect.test.ts` — stubs for SERV-08 (exponential backoff logic, sequence numbering)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual reconnection indicator | SERV-08 | UI behavior | Open browser, kill server, verify reconnection toast appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
