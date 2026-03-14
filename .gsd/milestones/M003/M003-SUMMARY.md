---
id: M003
provides:
  - Reconciled local milestone work with upstream origin/main while preserving the models.dev registry architecture
  - Verified PR-ready branch state with build, unit, scenario, and live registry coverage intact
  - Durable reconciliation traceability through recorded decisions and merge commit reference
key_decisions:
  - D023: Merge over rebase to preserve milestone history and make reconciliation explicit
  - D024: Favor models.dev architecture in any architecture-file conflict resolution
  - D025: Record merge commit hash ded3ac3b for traceability
patterns_established:
  - Upstream reconciliation is accepted only after git history, build, unit tests, scenario tests, and decision logging all agree
  - Even a clean merge needs post-merge verification because behavioral regressions can hide outside conflict markers
observability_surfaces:
  - git history via `git log --oneline -5` showing merge commit `ded3ac3b`
  - clean working tree via `git status --short`
  - verification artifacts in `S01-SUMMARY.md` and `S01-UAT.md`
  - decision log entries D023-D025 in `.gsd/DECISIONS.md`
requirement_outcomes:
  - id: R011
    from_status: active
    to_status: validated
    proof: S01 completed a clean merge of `origin/main`; `git log --oneline -5` shows merge commit `ded3ac3b`; S01-SUMMARY records passing build plus 32 pi-ai tests and 9 scenario tests proving reconciliation preserved behavior.
  - id: R012
    from_status: active
    to_status: validated
    proof: S01-SUMMARY records `npm run build -w @gsd/pi-ai` passing, `npm test -w @gsd/pi-ai` passing with 32 tests, scenario verification passing with 9 tests, and `git status` clean, which satisfies local PR-readiness.
duration: ~30 minutes (1 slice, 5 tasks)
verification_result: passed
completed_at: 2026-03-14
---

# M003: Upstream Reconciliation and PR Preparation

**Merged current `origin/main` into the milestone work without losing the models.dev registry path, then proved the result is locally PR-ready with build + 41-test verification.**

## What Happened

M003 took the finished M001/M002 registry work and reconciled it against upstream so the branch could move from “feature-complete” to “reviewable and ready.” The expected hard part was conflict resolution in the registry architecture files, but upstream had not changed those files, so the merge itself completed cleanly. The milestone still did the important part: it verified the absence of conflicts did not hide regressions.

That verification covered the whole registry path. The reconciled branch kept the models.dev architecture in `packages/pi-ai/src/models.ts`, `packages/pi-ai/src/index.ts`, and `packages/pi-coding-agent/src/core/model-registry.ts`; built cleanly; passed the 32-test `@gsd/pi-ai` suite including live models.dev verification; passed the 9 production-like scenario tests; and recorded the reconciliation choices in `.gsd/DECISIONS.md`. With only one slice in the milestone, cross-slice integration risk collapsed into a single question: did the merged branch still behave like M001/M002 intended? The answer is yes, and the evidence is concrete.

## Cross-Slice Verification

- **Success criterion: Merge current `origin/main` without losing M001/M002 behavior.** Met. `S01-SUMMARY.md` records a clean `git merge origin/main`, confirms the key architecture files remained on the models.dev design, and notes no upstream edits landed in those files. The preserved behavior was then exercised by the post-merge test runs.
- **Success criterion: All 32 pi-ai tests, 9 scenario tests, and live verification pass on the merged result.** Met. `S01-SUMMARY.md` records `npm test -w @gsd/pi-ai` passing with 32 tests, including live models.dev verification, and `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js` passing with 9 tests.
- **Success criterion: The diff against upstream is coherent and reviewable, with intentional conflict handling.** Met. `S01-SUMMARY.md` shows the merge brought in only upstream CI workflow changes while leaving the models.dev architecture files untouched; `D023` and `D024` document the intended reconciliation policy even though no manual file-level conflict resolution was required.
- **Success criterion: Branch is locally ready to become a PR.** Met. `S01-SUMMARY.md` records a successful `npm run build -w @gsd/pi-ai`, a clean `git status`, and decision-log completion. Current git inspection still shows a clean working tree and recent history containing the M003 merge boundary.

Definition of done verification:
- **All slices complete:** The roadmap lists only `S01`, and it is `[x]` in `M003-ROADMAP.md`.
- **All slice summaries exist:** `S01-SUMMARY.md` exists under `.gsd/milestones/M003/slices/S01/`.
- **Cross-slice integration points work:** M003 has a single slice, so the milestone integration point is the final merged branch state. That state is supported by the build, 32 unit/live tests, 9 scenario tests, clean git status, and the recorded merge commit `ded3ac3b` visible in `git log --oneline -5`.
- **Milestone definition of done items:** Supported by evidence from `S01-SUMMARY.md`, `S01-UAT.md`, `.gsd/DECISIONS.md`, and current git observables. No unmet definition-of-done item was found.

Criteria not met:
- None.

## Requirement Changes

- R011: active → validated — Proven by the clean upstream merge recorded in `S01-SUMMARY.md`, supported by merge commit `ded3ac3b` in git history and the full 41-test verification passing after reconciliation.
- R012: active → validated — Proven by `S01-SUMMARY.md` recording successful build, successful 32-test `@gsd/pi-ai` run, successful 9-test scenario run, and clean `git status`, which together establish local PR readiness.

## Forward Intelligence

### What the next milestone should know
- M003 did not find architecture conflicts in the expected files. The main remaining risk is no longer merge mechanics; it is newer post-M003 upstream drift and CI compliance, which is why R013-R015 are queued under M004.
- The strongest proof surface for this work is the combination of `S01-SUMMARY.md`, `S01-UAT.md`, `.gsd/DECISIONS.md`, and git history around merge commit `ded3ac3b`.

### What's fragile
- CI/workflow parity after additional upstream movement — M003 proved the local reconciled branch, but R014 exists because newer upstream changes may still require workflow-specific follow-up.

### Authoritative diagnostics
- `.gsd/milestones/M003/slices/S01/S01-SUMMARY.md` — most compact statement of what was merged and what passed.
- `.gsd/milestones/M003/slices/S01/S01-UAT.md` — exact local commands and expected signals for re-checking PR readiness.
- `git log --oneline -5` — trustworthy proof of the merge boundary and current branch lineage.
- `.gsd/DECISIONS.md` — authoritative trace of the reconciliation policy and merge hash.

### What assumptions changed
- Expected architecture-file conflicts during merge — upstream had not touched those files, so the merge was clean and the real work shifted to proof rather than conflict surgery.

## Files Created/Modified

- `.gsd/milestones/M003/M003-SUMMARY.md` — milestone-level completion record with success-criteria and definition-of-done verification
- `.gsd/PROJECT.md` — refreshed current-state wording to reflect completed M003 handoff on local `main`
- `.gsd/STATE.md` — added quick-glance project status and next-step handoff
