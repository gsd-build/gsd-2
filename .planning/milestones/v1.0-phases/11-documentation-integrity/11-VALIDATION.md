---
phase: 11
slug: documentation-integrity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — documentation-only phase |
| **Config file** | none |
| **Quick run command** | `ls .planning/phases/03-panel-shell-design-system/` |
| **Full suite command** | `ls .planning/phases/03-panel-shell-design-system/ && grep -n "requirements-completed" .planning/phases/06-chat-panel-claude-code-integration/*-SUMMARY.md .planning/phases/10-keyboard-shortcuts-accessibility/*-SUMMARY.md` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `ls .planning/phases/03-panel-shell-design-system/`
- **After every plan wave:** Run full suite command above
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | PNLS-01 through PNLS-07 | file-check | `ls .planning/phases/03-panel-shell-design-system/03-VERIFICATION.md` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | PNLS-01 through PNLS-07 | grep | `grep -c "Complete" .planning/REQUIREMENTS.md` | ✅ | ⬜ pending |
| 11-02-02 | 02 | 2 | PNLS-01 through PNLS-07 | grep | `grep "requirements-completed" .planning/phases/10-keyboard-shortcuts-accessibility/*-SUMMARY.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.planning/phases/03-panel-shell-design-system/03-VERIFICATION.md` — must be created in Plan 11-01

*Wave 0 is the file creation itself — no test stubs needed for a documentation phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Phase 03 VERIFICATION.md accurately describes supersession by Phase 3.1 | PNLS-01, PNLS-02 | Content accuracy requires human judgment | Read 03-VERIFICATION.md; confirm it acknowledges Phase 3.1 superseded the original layout while preserving the design system artifacts |
| Traceability table entries are factually correct | PNLS-01 through PNLS-07 | Correctness requires cross-referencing multiple documents | Verify FS-01/02/03/05 show Complete in REQUIREMENTS.md traceability table |
| SUMMARY frontmatter is complete | PNLS-01 through PNLS-07 | Frontmatter accuracy requires reading source VERIFICATION.md files | Check that Phase 10 SUMMARY files have `requirements-completed` field |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
