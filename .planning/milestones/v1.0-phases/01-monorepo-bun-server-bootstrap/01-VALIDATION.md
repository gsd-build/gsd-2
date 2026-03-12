---
phase: 1
slug: monorepo-bun-server-bootstrap
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test (built-in) |
| **Config file** | none — Bun test runs .test.ts files by convention |
| **Quick run command** | `bun test --cwd packages/mission-control` |
| **Full suite command** | `bun test --cwd packages/mission-control` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test --cwd packages/mission-control`
- **After every plan wave:** Run `bun test --cwd packages/mission-control`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | MONO-01 | smoke | `bun run --cwd packages/mission-control --version` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 0 | MONO-02 | smoke | `grep workspace packages/mission-control/package.json` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 0 | MONO-03 | smoke | `npm pack --dry-run 2>&1` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 0 | SERV-01 | integration | `bun run --cwd packages/mission-control dev & sleep 2 && curl -s http://localhost:4000` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/mission-control/tests/setup.test.ts` — stubs for MONO-01, MONO-02 (workspace structure validation)
- [ ] `packages/mission-control/tests/server.test.ts` — stubs for SERV-01 (server starts and responds on :4000)
- [ ] Bun test runner is built-in, no framework install needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GSD core publishes correctly | MONO-03 | npm publish side effects hard to automate safely | Run `npm pack --dry-run` at repo root, verify no `packages/` files included |
| HMR works in browser | SERV-01 | Requires browser interaction | Start dev server, open localhost:4000, edit App.tsx, verify hot reload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
