# M002: Web parity and hardening — Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

## Project Description

After M001 makes `gsd --web` real, M002 finishes the job: close the remaining TUI-to-web parity gaps, harden continuity/recovery and failure visibility, and make browser-first GSD strong enough for everyday use. This milestone is about "full parity with what the TUI can do as well as the current UI skin capabilities and views," not just the main happy path.

## Why This Milestone

M001 proves the assembled browser-first workflow. M002 converts that proof into a first-class product path by removing long-tail fallbacks, tightening lifecycle behavior, and polishing the surfaces that a real integrated run will expose as rough or incomplete.

## User-Visible Outcome

### When this milestone is complete, the user can:

- stay in the browser for the remaining TUI capabilities they actually need, not just the main start/resume loop
- refresh, reopen, recover, and inspect the workspace without losing situational awareness or control
- trust `gsd --web` as a first-class everyday way to run GSD

### Entry point / environment

- Entry point: `gsd --web`
- Environment: local dev / browser
- Live dependencies involved: local web host, rpc subprocess, project files, session persistence, git/activity surfaces

## Completion Class

- Contract complete means: remaining browser/TUI capability gaps have named web surfaces and real implementations, not TODO placeholders or hidden terminal-only escape hatches.
- Integration complete means: the browser workspace can exercise the full intended web parity path against real projects and real GSD sessions.
- Operational complete means: reconnect, refresh/reopen, interrupted runs, and common failure states are recoverable without dropping the user back into the TUI.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A user can live in `gsd --web` for daily work without needing the TUI for leftover commands or maintenance steps.
- A user can recover from the common lifecycle problems exposed by M001—refresh, reconnect, interrupted run, validation failure, and resumable work—inside the browser.
- The browser-first experience remains snappy and fast even with real activity, files, roadmap state, and agent streaming in play.

## Risks and Unknowns

- Long-tail parity may require expanding RPC/state surfaces more than the M001 happy path does.
- Continuity and reconnect behavior may surface race conditions between browser lifecycle, local host lifecycle, and live agent sessions.
- Richer activity/files/roadmap views can become slow or noisy if they are overfed with raw state rather than purpose-built view models.
- Finishing polish may require additional cleanup around packaging, defaults, and platform behavior.

## Existing Codebase / Prior Art

- `src/cli.ts` — browser launch path and packaging behaviors established in M001.
- `src/onboarding.ts` and M001 web onboarding outputs — credential lifecycle and validated setup flows.
- `packages/pi-coding-agent/src/modes/rpc/*` — RPC/session/event surface that may need parity expansion.
- M001 web host, bridge, live workspace state, and focused prompt surfaces — baseline to extend rather than replace.
- `packages/pi-coding-agent/src/modes/interactive/interactive-mode.ts` — source of parity truth for remaining capabilities.

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R011 — closes remaining lower-frequency TUI/browser parity gaps.
- R020 — may introduce broader project/session switching if M001 proves the need.
- R021 — may deepen observability if live usage shows current activity surfaces are too thin.
- R009 — continues protecting the "snappy and fast" requirement under heavier real-world use.

## Scope

### In Scope

- remaining TUI/browser parity gaps exposed after M001
- continuity, reconnect, resume/recover, and interrupted-run hardening
- richer control and observability surfaces needed for daily web use
- packaging/polish needed for browser-first daily-use readiness

### Out of Scope / Non-Goals

- redesigning the existing skin for aesthetics alone
- remote/shared cloud-hosted web mode unless explicitly re-scoped later
- widening scope beyond GSD itself to extra non-GSD backends or services

## Technical Constraints

- Preserve browser-first operation; do not reintroduce hidden TUI dependence.
- Keep launch current-project aware unless a later milestone explicitly broadens it.
- Protect responsiveness as state surfaces grow.
- Use M001’s actual integrated outputs as the source of truth, not assumptions made during bootstrap planning.

## Integration Points

- web host/runtime from M001 — extend, don’t replace unless proven necessary
- RPC/session/event surface — expand for parity gaps
- GSD project artifacts, session storage, and activity history — deepen coverage where browser gaps remain
- CLI packaging and startup behavior — browser-mode defaults and lifecycle polish

## Open Questions

- Which long-tail TUI capabilities remain after M001, and which deserve first-class visual surfaces versus direct command surfaces? — answer only after a live M001 gap audit.
- Does the integrated M001 runtime justify keeping Next.js, or does parity/hardening work expose a cleaner React-only host? — defer until the bridge and continuity costs are measurable.
