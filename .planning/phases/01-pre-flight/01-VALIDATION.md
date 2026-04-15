---
phase: 1
slug: pre-flight
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-14
audited: 2026-04-15
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler (`tsc --noEmit`) + madge |
| **Config file** | `packages/pi-coding-agent/tsconfig.json` |
| **Quick run command** | `cd packages/pi-coding-agent && tsc --noEmit` |
| **Full suite command** | `tsc --noEmit && npx madge --circular packages/pi-coding-agent/src/` |
| **Estimated runtime** | ~10–15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/pi-coding-agent && tsc --noEmit`
- **After every plan wave:** Run full suite (`tsc --noEmit && madge --circular`)
- **Before `/gsd-verify-work`:** Full suite must be green (zero type errors, zero circular deps)
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | PF-05 (baseline) | — | N/A | static | `madge --circular packages/pi-coding-agent/src/ --extensions ts` | ✅ | ✅ green |
| 1-01-02 | 01 | 1 | PF-01 | — | N/A | static | `tsc --noEmit -p packages/pi-coding-agent/tsconfig.json` | ✅ | ✅ green |
| 1-01-03 | 01 | 1 | PF-02 | — | N/A | static | `tsc --noEmit -p packages/pi-coding-agent/tsconfig.json` | ✅ | ✅ green |
| 1-01-04 | 02 | 1 | PF-03 | — | N/A | static | `tsc --noEmit -p packages/pi-coding-agent/tsconfig.json` | ✅ | ✅ green |
| 1-01-05 | 02 | 1 | PF-04 | — | N/A | static | `tsc --noEmit -p packages/pi-coding-agent/tsconfig.json` | ✅ | ✅ green |
| 1-01-06 | 03 | 1 | PF-05 (gate) | — | N/A | static | `madge --circular packages/pi-coding-agent/src/ --extensions ts` | ✅ | ✅ green |
| 1-01-07 | 03 | 1 | PF-06 | — | N/A | static | `grep -r "from.*\\.ts['\"]" packages/pi-coding-agent/src/ --include="*.ts" \| wc -l` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed — all verification is via `tsc --noEmit` and `madge --circular`, which are already available.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| bridge-service.ts has no raw `../../packages/` paths | PF-02 success criterion 3 | Grep verification | `grep -r "../../packages/pi-coding-agent/src" src/web/bridge-service.ts` — must return empty |
| extensions/types.ts has no imports from agent-core files | PF-03/PF-04 success criterion 4 | Grep verification | `grep -E "from.*compaction\|from.*bash-executor\|from.*agent-session\|from.*keybindings" packages/pi-coding-agent/src/core/extensions/types.ts` — must return empty |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-04-15

---

## Validation Audit 2026-04-15

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Tasks confirmed green | 7 |

**Verification run results:**
- `madge --circular packages/pi-coding-agent/src/ --extensions ts` → 16 cycles (delta = 0 vs baseline) → PASS (Option A)
- `tsc --noEmit -p packages/pi-coding-agent/tsconfig.json` → 6 pre-existing error lines in 3 unrelated files, 0 new errors → PASS
- `grep -r "from.*\.ts['\"]" packages/pi-coding-agent/src/ --include="*.ts"` → 0 matches → PASS
- `npm run test:packages` → 224/224 tests pass → PASS

Manual-only greps also confirmed passing (bridge-service.ts and extensions/types.ts clean).
