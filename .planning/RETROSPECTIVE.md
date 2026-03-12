# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-12
**Phases:** 15 (1–11 incl. 3.1, 6.1, 6.2, 6.3) | **Plans:** 48
**Timeline:** 2025-12-14 → 2026-03-12 (88 days, 1,163 commits)
**Codebase:** ~12,744 lines TypeScript/TSX

### What Was Built

- Bun fullstack monorepo: React 19 dashboard served on :4000, file watcher on `.planning/`, WebSocket diff pipeline with sub-100ms file-to-UI updates
- Claude Code child process integration with NDJSON event streaming — 4 parallel sessions, git worktree isolation per session
- VS Code-style project sidebar with native OS file picker (Windows Zenity workaround), pipeline hot-switch on project change
- Full process event streaming including sub-agent events (tool_use, text, thinking, result)
- Discuss mode (structured question cards, decision log) and Review mode (6-pillar scoring with count-up animation)
- Live preview panel proxied through Bun with 4 viewports (desktop/tablet/mobile/dual device frames)
- CSS logo animation (400ms branded build sequence), onboarding/resume flow, project selector
- Command palette (Ctrl+Shift+P), panel focus shortcuts (Ctrl+1–5), 44px touch targets, heading hierarchy

### What Worked

- **GSD-on-GSD execution**: Using GSD to build GSD Mission Control created real-world dogfooding pressure. The planning-phase boundary and must_haves system caught gaps that would have shipped as bugs.
- **Wave-based execution**: Running parallel plan agents per wave compressed timelines significantly — Phases 6.2 and 6.3 (4 and 8 plans respectively) completed in a single session each.
- **Decimal phase insertions**: When UAT revealed the 5-panel layout was unusable (Phase 3), inserting Phase 3.1 immediately without renumbering kept the history clean and causal. Used 4 times total (3.1, 6.1, 6.2, 6.3).
- **NDJSON streaming architecture**: Switching to full event streaming (Phase 6.2) gave the dashboard visibility into sub-agent activity that simple stdout capture would have missed.
- **Pure function TDD pattern**: Phase 10 writing `shouldOpenCommandPalette`/`shouldSwitchPanel` as pure functions first, then wiring them in, made keyboard shortcuts testable and the integration clean.

### What Was Inefficient

- **SessionManager added scope**: Phase 6.3 expanded from the original Phase 6 scope significantly — multi-session, worktrees, settings, assets were all added mid-milestone as discovered needs. This was necessary but unpredicted. Future milestones should account for this discovery pattern.
- **Phase 7 animation scope drift**: Remotion was planned but dropped in favor of CSS keyframes — the upfront Remotion research and planning time was wasted. Better to have qualified the Remotion dependency earlier in planning.
- **Native file dialog complexity**: Windows native dialog (Zenity) proved unreliable. Custom branded modal workaround was the right call but added an unplanned plan (6.2-04 checkpoint). OS dialog behavior should be flagged as a risk item in future plans that touch system dialogs.
- **Gap closure overhead**: 4 decimal phases (3.1, 6.1, 6.2, 6.3) + Phase 11 documentation integrity gap closure added ~15 plans to the original 30-plan estimate. Gap closure is expected, but the audit → plan-gaps → execute-gaps cycle could be smoother.

### Patterns Established

- **Design system before panels**: Laying down Tailwind tokens + fontsource + design-tokens.ts in Phase 3.1 before any component work meant all subsequent components shared the same token vocabulary. No one-off colors.
- **State derivation as the canonical truth**: Making the Bun file watcher + state deriver the single source of truth meant restarts never had ghost state. Every feature that needed "current state" just reads from the deriver output.
- **SessionManager pattern for concurrency**: A central registry owning process lifecycle and WebSocket channel routing proved extensible. Adding worktrees in 6.3-03 was additive, not disruptive.
- **Checkpoint plans for human verification**: Putting human-verify steps as the last plan in a phase (e.g., 6.2-04, 6.3-06, 10-03) created a natural quality gate. This should be a default pattern.

### Key Lessons

1. **Test infrastructure is investment, not overhead**: Plans that wrote smoke tests first (Phase 1, 2, 10) produced the cleanest implementations. Plans that skipped testing left more gaps for the verifier to find.
2. **The 5-panel layout failure (Phase 3) was informative**: The PRD specified a 5-panel layout. It shipped and was immediately unworkable. Prototyping layout constraints earlier (or using a checkpoint plan before building all panel content) would have caught this sooner.
3. **Require must_haves for decimal phases too**: Early decimal phases (3.1, 6.1) had looser must_haves than the integer phases. This made verification harder. All phases should have equally specific must_haves.
4. **PREV-05 (orphaned requirement) was a planning artifact**: PREV-05 was defined but never planned or implemented. The milestone audit caught it. In future milestones, every requirement in REQUIREMENTS.md should have a named phase before planning begins.

### Cost Observations

- Model mix: sonnet-4-6 throughout (no Opus, no Haiku switching in v1.0)
- Notable: GSD's `execute-phase` wave parallelism kept executor context fresh (200k per agent vs accumulated context in orchestrator). Orchestrator context stayed lean at ~10-15% throughout execution.
- Sessions: ~15 context windows across 88 days

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 15 |
| Plans | 48 |
| LOC (TS/TSX) | ~12,744 |
| Timeline | 88 days |
| Gap closure plans | 5 (3.1, 6.1, 6.2, 6.3, 11) |
| Requirements defined | 97 |
| Requirements shipped | 97/97 |
