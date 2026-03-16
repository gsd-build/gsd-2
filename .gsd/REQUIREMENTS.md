# Requirements

This file is the explicit capability and coverage contract for the project.

Use it to track what is actively in scope, what has been validated by completed work, what is intentionally deferred, and what is explicitly out of scope.

Guidelines:
- Keep requirements capability-oriented, not a giant feature wishlist.
- Requirements should be atomic, testable, and stated in plain language.
- Every **Active** requirement should be mapped to a slice, deferred, blocked with reason, or moved out of scope.
- Each requirement should have one accountable primary owner and may have supporting slices.
- Research may suggest requirements, but research does not silently make them binding.
- Validation means the requirement was actually proven by completed work and verification, not just discussed.

## Active

### R100 — Clean upstream merge with all conflicts resolved and build green
- Class: core-capability
- Status: active
- Description: Merge 398 upstream commits (v2.12→v2.21) into the fork, resolve all 50 file conflicts, and achieve a green build (`npm run build`, `npm run build:web-host`).
- Why it matters: Nothing else in M003 can proceed until the codebase is unified and compiling.
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Conflicts concentrated in GSD extension core (auto.ts decomposition), cli.ts, loader.ts, onboarding.ts, git-service.ts, types.ts. Web-only files (web/, src/web/) have zero conflicts.

### R101 — Browser slash-command dispatch covers all upstream /gsd subcommands
- Class: primary-user-loop
- Status: active
- Description: Every /gsd subcommand (help, next, auto, stop, pause, status, visualize, queue, quick, discuss, capture, triage, history, undo, skip, export, cleanup, mode, prefs, config, hooks, run-hook, skill-health, doctor, forensics, migrate, remote, steer, inspect, knowledge) dispatches correctly from the browser terminal — opening a surface, executing, or rejecting with clear guidance.
- Why it matters: Silent command fallthrough was the highest-risk M002 gap; extending dispatch to new commands maintains that safety.
- Source: user
- Primary owning slice: M003/S02
- Supporting slices: M003/S04, M003/S05, M003/S06, M003/S07
- Validation: unmapped
- Notes: Current dispatch handles ~12 commands. Upstream added ~15 more.

### R102 — Workflow visualizer page with 7 tabbed sections
- Class: core-capability
- Status: active
- Description: A dedicated browser page with tabbed sections for Progress, Deps, Metrics, Timeline, Agent activity, Changelog, and Export — backed by the upstream visualizer-data.ts aggregation.
- Why it matters: The TUI visualizer is a primary workflow surface for understanding project state; web mode needs parity.
- Source: user
- Primary owning slice: M003/S03
- Supporting slices: none
- Validation: unmapped
- Notes: Upstream has VisualizerData interface with milestones, phase, totals, byPhase, bySlice, byModel, units, criticalPath, agentActivity, changelog.

### R103 — Forensics panel for auto-mode failure investigation
- Class: failure-visibility
- Status: active
- Description: A browser panel showing forensic anomaly scanning results — stuck loops, cost spikes, timeouts, missing artifacts, crashes, doctor issues, and error traces from auto-mode runs.
- Why it matters: Auto-mode failures need browser-visible investigation, not just TUI-only forensics.
- Source: user
- Primary owning slice: M003/S04
- Supporting slices: M003/S02
- Validation: unmapped
- Notes: Upstream forensics.ts provides handleForensics() with ForensicReport containing anomalies, session traces, and doctor issues.

### R104 — Doctor panel with health checks, auto-fix, and scope filtering
- Class: failure-visibility
- Status: active
- Description: A browser panel showing doctor health check results (7 runtime checks), auto-fix actions, severity filtering, and scope selection.
- Why it matters: Doctor is the primary health diagnostic tool; existing web recovery surface covers only basic recovery, not the full doctor report.
- Source: user
- Primary owning slice: M003/S04
- Supporting slices: M003/S02
- Validation: unmapped
- Notes: Upstream doctor.ts provides runGSDDoctor() with DoctorReport containing issues, auto-fix capability, and scope filtering.

### R105 — Skill health panel with telemetry, staleness, and heal suggestions
- Class: operability
- Status: active
- Description: A browser panel showing per-skill pass/fail rates, token usage, staleness warnings, declining performance flags, and heal-skill suggestions.
- Why it matters: Skill lifecycle management is a new upstream capability that needs browser visibility.
- Source: user
- Primary owning slice: M003/S04
- Supporting slices: M003/S02
- Validation: unmapped
- Notes: Upstream skill-health.ts provides generateSkillHealthReport() with SkillHealthReport.

### R106 — Knowledge and captures/triage dedicated page
- Class: core-capability
- Status: active
- Description: A dedicated browser page showing KNOWLEDGE.md entries and CAPTURES.md with pending/triaged/resolved status, classification labels, and triage action controls.
- Why it matters: Knowledge and captures are persistent project-context artifacts that need browser visibility and interaction.
- Source: user
- Primary owning slice: M003/S05
- Supporting slices: M003/S02
- Validation: unmapped
- Notes: Upstream captures.ts provides loadAllCaptures/loadPendingCaptures/markCaptureResolved. KNOWLEDGE.md is an append-only register.

### R107 — Extended settings surface for model routing, provider management, and budget visibility
- Class: core-capability
- Status: active
- Description: The browser settings command surface shows dynamic model routing configuration, provider fallback chain management, budget allocation visibility, and all preference fields from the upstream preferences wizard.
- Why it matters: Model/provider/budget management is a substantial new upstream capability with TUI-only surfaces.
- Source: user
- Primary owning slice: M003/S06
- Supporting slices: M003/S02
- Validation: unmapped
- Notes: Upstream has model-router.ts, complexity-classifier.ts, context-budget.ts, fallback-resolver.ts, model-discovery.ts, provider-manager TUI component.

### R108 — Browser surfaces for quick tasks, history, undo, steer, mode, hooks, config, inspect, export, cleanup
- Class: core-capability
- Status: active
- Description: Each of the remaining /gsd subcommands opens a browser-native surface with appropriate controls, feedback, and state visibility.
- Why it matters: Absolute parity means no command is TUI-only.
- Source: user
- Primary owning slice: M003/S07
- Supporting slices: M003/S02
- Validation: unmapped
- Notes: These are individually smaller but collectively substantial. Some (quick, history, undo) have rich data views; others (hooks, run-hook, config) are simpler.

### R109 — TUI-to-web 1:1 feature parity audit with gap closure
- Class: quality-attribute
- Status: active
- Description: A systematic comparison of every TUI feature against the web UI, with any gaps found being closed in this slice.
- Why it matters: Individual feature slices may miss edge cases or subtle TUI behaviors; a dedicated audit pass catches them.
- Source: user
- Primary owning slice: M003/S08
- Supporting slices: M003/S03, M003/S04, M003/S05, M003/S06, M003/S07
- Validation: unmapped
- Notes: Audit should cover commands, surfaces, data visibility, interaction patterns, and error states.

### R110 — Full test suite passes after merge and all new web UI work
- Class: quality-attribute
- Status: active
- Description: npm run test:unit, npm run test:integration, npm run test:browser-tools, npm run build, and npm run build:web-host all pass clean after all M003 work.
- Why it matters: The merge and new code must not break existing functionality.
- Source: user
- Primary owning slice: M003/S09
- Supporting slices: M003/S01
- Validation: unmapped
- Notes: Test breakage likely comes from the merge (interface changes) and new web code (new route/store contracts).

## Validated

### R011 — Remaining lower-frequency TUI capabilities reach browser parity after the primary loop
- Class: core-capability
- Status: validated
- Description: After the primary browser-first loop is real, the remaining lower-frequency TUI capabilities should be brought into browser parity as needed for daily use.
- Why it matters: The stated goal is full parity with what the TUI can do, not just a browser path for the main happy path.
- Source: user
- Primary owning slice: M002/S01
- Supporting slices: M002/S02, M002/S03, M002/S04
- Validation: verified by `src/tests/integration/web-mode-runtime.test.ts`, `src/tests/integration/web-mode-onboarding.test.ts`, `src/tests/integration/web-mode-assembled.test.ts`, `src/tests/web-command-parity-contract.test.ts`, `src/tests/web-session-parity-contract.test.ts`, `src/tests/web-live-state-contract.test.ts`, `src/tests/web-recovery-diagnostics-contract.test.ts`, `npm run build:web-host`, and the real packaged-host browser proof of refresh/reopen, daily-use browser controls, and seeded interrupted-run recovery.
- Notes: S01 proved safe browser slash-command dispatch plus RPC-backed/browser-surface outcomes for the daily-use built-ins in scope. S02 added current-project session browse/resume/rename parity, daily-use settings/auth controls, a real Git sidebar surface, and browser-visible title/widget/editor shell state. S03 added targeted live freshness, narrow invalidation-driven reloads, and browser-native recovery diagnostics. S04 completed the real packaged-host refresh/reopen/daily-use/interrupted-run browser proof and closed the remaining runtime risk.

### R001 — Browser-only `--web` launch path
- Class: launchability
- Status: validated
- Description: Running `gsd --web` starts browser mode for the current project, auto-opens the web workspace, and does not launch the Pi/GSD TUI.
- Why it matters: The browser-first product path is not real if it still depends on the TUI at startup.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: M001/S07
- Validation: verified by `src/tests/web-mode-cli.test.ts`, `src/tests/integration/web-mode-runtime.test.ts`, S01's fresh temp-home runtime/browser proof, and the launch contract that waits for `/api/boot` readiness before reporting success.
- Notes: The launch path itself is now real and stayed green through the final assembled regression reruns.

### R002 — Browser onboarding validates required setup and unlocks the workspace entirely in-browser
- Class: launchability
- Status: validated
- Description: A first-run `gsd --web` user must be able to complete required setup in-browser, validate required credentials, and reach an unlocked usable workspace without touching the TUI.
- Why it matters: Browser mode is not operationally real if first-run setup still needs terminal fallback or lets invalid credentials silently through.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: M001/S01, M001/S07
- Validation: verified by `src/tests/web-onboarding-contract.test.ts`, `src/tests/integration/web-mode-onboarding.test.ts`, `npm run build:web-host`, packaged-host route spot-checks of `/api/boot` + `/api/onboarding` + blocked `/api/session/command`, and S02's browser/runtime proof of failed validation, successful retry, unlock, and first-command success.
- Notes: Browser onboarding, validation, lock enforcement, and bridge-auth refresh are now part of the preserved shell itself.

### R003 — Web mode opens into the current project/cwd workspace
- Class: primary-user-loop
- Status: validated
- Description: `gsd --web` should open directly into the current working directory's GSD workspace rather than a generic launcher.
- Why it matters: This keeps the web path aligned with how GSD is launched today and avoids friction at the point of use.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: M001/S04
- Validation: verified by `/api/boot`, the slice-level runtime integration test, and browser rendering of the live current-project scope/status state.
- Notes: Broader project switching remains a later concern; current-project launch is now proven.

### R004 — Primary GSD workflow runs end-to-end in the browser without opening TUI
- Class: primary-user-loop
- Status: validated
- Description: Users must be able to start or resume work, interact with the agent, answer prompts, and complete the primary GSD workflow entirely in the browser.
- Why it matters: If the core workflow still needs the TUI, web mode is only a sidecar.
- Source: user
- Primary owning slice: M001/S07
- Supporting slices: M001/S01, M001/S02, M001/S03, M001/S04, M001/S05, M001/S06
- Validation: verified by `src/tests/integration/web-mode-assembled.test.ts` (boot → onboarding → prompt → streaming → tool execution → blocking UI request → UI response → turn boundary), the 5-test integration regression (`web-mode-assembled`, `web-mode-runtime`, `web-mode-onboarding`), S03/S05 contract coverage for focused interactions and workflow controls, and final live browser/UAT closure at milestone completion.
- Notes: M001 closed the primary browser-first loop. Remaining parity work moves to R011/M002.

### R005 — Existing skin becomes a live workspace rather than a mock shell
- Class: core-capability
- Status: validated
- Description: The existing dashboard, terminal, power, roadmap, files, and activity surfaces in `web/` must be wired to real GSD data and actions.
- Why it matters: The user explicitly wants the exact skin preserved and integrated, not replaced with a new UI.
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: M001/S03, M001/S05, M001/S06
- Validation: verified by `src/tests/web-state-surfaces-contract.test.ts` (17/17), `src/tests/integration/web-mode-runtime.test.ts`, the 59-test contract regression rerun, and `npm run build:web-host`.
- Notes: The preserved skin is now the real workspace, not a mock shell with a live terminal bolted onto it.

### R006 — Agent interruptions are handled in a focused web panel
- Class: continuity
- Status: validated
- Description: Confirmations, choices, text input, editor-style interruptions, and similar mid-run agent requests must be handled in a focused primary web surface rather than buried modals.
- Why it matters: The browser needs a clear interaction model for live agent work, or parity will break under real prompts.
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S07
- Validation: verified by `src/tests/web-live-interaction-contract.test.ts` (10/10 — UI request lifecycle, transcript streaming, steer/abort, fire-and-forget state, failure paths), `npm run build:web-host` (focused panel and terminal controls compile and mount), and the assembled route-level lifecycle proof in S07.
- Notes: The focused panel now covers all four blocking request types: select, confirm, input, and editor.

### R007 — Session continuity works across refresh/reopen and supports resume inside web mode
- Class: continuity
- Status: validated
- Description: Users can refresh or reopen the browser workspace, reattach to the correct current-project session state, and resume work from the web UI.
- Why it matters: Browser mode stops feeling first-class if normal browser lifecycle behavior loses context or control.
- Source: inferred
- Primary owning slice: M001/S06
- Supporting slices: M001/S05, M001/S07
- Validation: verified by `src/tests/web-continuity-contract.test.ts` (14/14 — reconnect resync, visibility-return refresh, transcript cap, command timeout, retry affordances), sessionStorage view persistence in app-shell, and `npm run build:web-host`.
- Notes: This covers current-project continuity and resume inside web mode, not cross-project launching.

### R008 — Live web mode never mixes mock data with real GSD state
- Class: constraint
- Status: validated
- Description: Core web workspace views must not ship with mixed mock/live content once they are declared integrated.
- Why it matters: Fake/live mixing destroys trust and makes parity claims impossible to verify.
- Source: inferred
- Primary owning slice: M001/S04
- Supporting slices: M001/S07
- Validation: verified by `src/tests/web-state-surfaces-contract.test.ts` (17/17 — explicit mock-free invariant checks across integrated surfaces), the final 59-test contract regression rerun, and `npm run build:web-host`.
- Notes: The mock-free invariant is now a standing regression guard, not a one-time inspection.

### R009 — Web mode feels snappy and fast
- Class: quality-attribute
- Status: validated
- Description: Streaming, navigation, updates, and prompt handling in web mode must feel snappy and fast under normal local use.
- Why it matters: The user explicitly called out speed as a non-negotiable quality bar.
- Source: user
- Primary owning slice: M001/S06
- Supporting slices: M001/S01, M001/S03, M001/S04, M001/S05, M001/S07
- Validation: verified by S06's continuity/performance hardening (`MAX_TRANSCRIPT_BLOCKS`, command timeout recovery, reconnect/visibility refresh), S07's thinner `launchWebMode` parent bootstrap and stable runtime/build regressions, and the final live browser/UAT closure for the remaining subjective acceptance bar.
- Notes: Preserve the user's exact phrasing: "snappy and fast." M001 cleared that bar for normal local use.

### R010 — Failures are visible and recoverable in-browser
- Class: failure-visibility
- Status: validated
- Description: Setup failures, bridge disconnects, blocked actions, and agent/runtime errors must be visible in-browser with a clear recovery path.
- Why it matters: A browser-first path becomes fragile if the user has to guess what failed or fall back to terminal debugging.
- Source: research
- Primary owning slice: M001/S06
- Supporting slices: M001/S03, M001/S04, M001/S07
- Validation: verified by `src/tests/web-continuity-contract.test.ts` (timeout clears stuck state with error visibility and reconnect recovery), S02's structured onboarding lock/validation diagnostics, the error-banner retry affordance in app-shell, and `npm run build:web-host`.
- Notes: This is especially important because `--web` intentionally suppresses TUI fallback.

## Deferred

### R020 — Cross-project launcher / recent-project hub beyond current cwd
- Class: admin/support
- Status: deferred
- Description: Support broader project/session switching beyond the current-project launch contract.
- Why it matters: It may become useful once browser mode is established, but it is not required to make `gsd --web` real.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Current-project launch is the primary requirement for now.

### R021 — Deep historical analytics beyond the live activity surfaces
- Class: operability
- Status: deferred
- Description: Add deeper analytics/history views beyond the live dashboard and activity surfaces required for the core web workflow.
- Why it matters: This may improve long-term observability, but it is not part of the initial browser-first contract.
- Source: research
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Revisit only if live usage shows the built-in activity surfaces are too thin.

### R022 — Remote / LAN / shared access to the web workspace
- Class: operability
- Status: deferred
- Description: Support using the browser workspace from outside the local machine or sharing it across users.
- Why it matters: This may matter later, but it adds security and lifecycle complexity that is not needed for the initial local browser-first path.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: M001 should stay local and current-project scoped.

## Out of Scope

### R030 — Open TUI alongside `--web`
- Class: anti-feature
- Status: out-of-scope
- Description: `gsd --web` should not launch the TUI in parallel or rely on a visible TUI session.
- Why it matters: This prevents the browser path from becoming a disguised sidecar.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: This is a hard product boundary for M001.

### R031 — Re-skin or redesign the current UI during initial integration
- Class: anti-feature
- Status: out-of-scope
- Description: M001 should not spend time redesigning the current UI skin instead of wiring it into live GSD behavior.
- Why it matters: It keeps scope focused on integration and parity rather than aesthetic churn.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: "Just use the exact skin in the test UI and wire it into GSD."

### R032 — Separate cloud backend for core web mode
- Class: constraint
- Status: out-of-scope
- Description: Core web mode should not depend on a separate cloud-hosted backend to function.
- Why it matters: The requested scope is "just gsd," running locally from the CLI launch path.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Local host + local agent bridge is the expected shape.

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | launchability | validated | M001/S01 | M001/S07 | validated |
| R002 | launchability | validated | M001/S02 | M001/S01, M001/S07 | validated |
| R003 | primary-user-loop | validated | M001/S01 | M001/S04 | validated |
| R004 | primary-user-loop | validated | M001/S07 | M001/S01, M001/S02, M001/S03, M001/S04, M001/S05, M001/S06 | validated |
| R005 | core-capability | validated | M001/S04 | M001/S03, M001/S05, M001/S06 | validated |
| R006 | continuity | validated | M001/S03 | M001/S07 | validated |
| R007 | continuity | validated | M001/S06 | M001/S05, M001/S07 | validated |
| R008 | constraint | validated | M001/S04 | M001/S07 | validated |
| R009 | quality-attribute | validated | M001/S06 | M001/S01, M001/S03, M001/S04, M001/S05, M001/S07 | validated |
| R010 | failure-visibility | validated | M001/S06 | M001/S03, M001/S04, M001/S07 | validated |
| R011 | core-capability | validated | M002/S01 | M002/S02, M002/S03, M002/S04 | validated |
| R020 | admin/support | deferred | none | none | unmapped |
| R021 | operability | deferred | none | none | unmapped |
| R022 | operability | deferred | none | none | unmapped |
| R030 | anti-feature | out-of-scope | none | none | n/a |
| R031 | anti-feature | out-of-scope | none | none | n/a |
| R032 | constraint | out-of-scope | none | none | n/a |
| R100 | core-capability | active | M003/S01 | none | unmapped |
| R101 | primary-user-loop | active | M003/S02 | M003/S04, M003/S05, M003/S06, M003/S07 | unmapped |
| R102 | core-capability | active | M003/S03 | none | unmapped |
| R103 | failure-visibility | active | M003/S04 | M003/S02 | unmapped |
| R104 | failure-visibility | active | M003/S04 | M003/S02 | unmapped |
| R105 | operability | active | M003/S04 | M003/S02 | unmapped |
| R106 | core-capability | active | M003/S05 | M003/S02 | unmapped |
| R107 | core-capability | active | M003/S06 | M003/S02 | unmapped |
| R108 | core-capability | active | M003/S07 | M003/S02 | unmapped |
| R109 | quality-attribute | active | M003/S08 | M003/S03, M003/S04, M003/S05, M003/S06, M003/S07 | unmapped |
| R110 | quality-attribute | active | M003/S09 | M003/S01 | unmapped |

## Coverage Summary

- Active requirements: 11
- Mapped to slices: 11
- Validated: 11
- Unmapped active requirements: 0
