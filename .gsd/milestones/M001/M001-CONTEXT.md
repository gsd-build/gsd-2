# M001: Web mode foundation — Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

## Project Description

Integrate a browser-first web mode into GSD by taking the existing web skin now housed in `web/` and wiring it into the real GSD workflow. The web path is launched with `gsd --web`, should auto-open the browser, and should not open the regular Pi + GSD TUI. The existing skin is the contract for M001: use that exact skin and wire it into GSD rather than redesigning it.

## Why This Milestone

This is the first real user-facing proof that GSD can run as a browser-first product rather than only a TUI. It retires the hardest unknowns early: launch path, current-project scoping, live bridge to the agent, browser onboarding, and whether the existing Next.js skin can carry the real workflow without feeling too heavy.

## User-Visible Outcome

### When this milestone is complete, the user can:

- run `gsd --web` in a project and land in a live browser workspace for that current project
- complete first-time setup in the browser, with required keys entered and tested before continuing
- start or resume GSD work from the existing dashboard / terminal / power / roadmap / files / activity surfaces and finish the primary workflow without ever touching the TUI

### Entry point / environment

- Entry point: `gsd --web`
- Environment: local dev / browser
- Live dependencies involved: rpc subprocess, local web host, local browser, provider credential validation

## Completion Class

- Contract complete means: CLI flag, browser onboarding contract, bridge protocol, workspace boot contract, and current-project state surfaces exist and are wired with real implementations.
- Integration complete means: browser workspace talks to a real live GSD agent/session, reads real project state, and handles mid-run prompts and resume flows.
- Operational complete means: `gsd --web` can launch, auto-open, survive normal refresh/reopen behavior for the current project, and never fall back to opening the TUI.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- In a clean project, `gsd --web` starts the web workspace, opens the browser, blocks on first-time setup, validates required credentials, and lands in a usable workspace.
- In an existing project, `gsd --web` opens the current-project workspace and the user can start or resume work from the browser, interact with the agent, answer prompts in the focused panel, and observe real progress in the existing skin.
- No key M001 view is backed by mock data, and the TUI is not opened or required anywhere in the end-to-end path.

## Risks and Unknowns

- Existing RPC/event surface may not yet expose everything the skin needs — parity work may require expanding the bridge rather than only wiring UI.
- The current Next.js skin may be a good shell or may turn out to be unnecessary runtime weight — this decision needs proof from the live integration, not assumption.
- Browser onboarding must validate required keys and still feel snappy and fast — validation/orchestration could introduce startup drag.
- Current-project scoping, live session continuity, and prompt interruptions must feel natural in-browser or the product will still feel like a hidden TUI wrapper.

## Existing Codebase / Prior Art

- `src/cli.ts` — CLI entrypoint, current interactive launch path, existing `--mode rpc`, onboarding trigger, model/session boot.
- `src/onboarding.ts` — current first-run provider/tool setup and validation flow to adapt for web onboarding.
- `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` — current RPC command/state/event surface, including extension UI requests.
- `packages/pi-coding-agent/src/modes/rpc/rpc-client.ts` — existing programmatic client shape for spawning and controlling a GSD session in RPC mode.
- `web/` — in-repo web skin to preserve and wire into the real workflow.

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R001 — adds the browser-only `--web` launch path.
- R002 — adds validated browser onboarding.
- R003 — keeps launch scoped to the current project/cwd.
- R004 — proves the primary workflow can run end-to-end in-browser without opening the TUI.
- R005 — converts the exact existing skin from mock UI to live workspace.
- R006 — handles mid-run prompts in a focused panel.
- R007 — keeps session continuity and resume inside web mode.
- R008 — removes mock/live mixing from core workspace views.
- R009 — preserves the "snappy and fast" feel.
- R010 — makes failures visible and recoverable in-browser.

## Scope

### In Scope

- `gsd --web` CLI entry and browser auto-open
- local web host/runtime and live agent bridge
- browser-first onboarding for required/optional GSD credentials, with required keys validated before use
- current-project workspace boot and no-TUI execution path
- live terminal/power/dashboard/roadmap/files/activity surfaces using the existing skin
- focused prompt/confirmation/editor interruption handling in-browser
- start/resume workflow controls from the UI
- real end-to-end assembly proof in a local run

### Out of Scope / Non-Goals

- redesigning or re-skinning the existing test UI during M001
- launching the TUI alongside `--web`
- remote/shared/LAN access or a cloud-hosted web backend
- full closure of every long-tail parity gap not required for the primary browser-first loop

## Technical Constraints

- Use the exact existing skin as the starting UI contract.
- `gsd --web` must not open the regular Pi + GSD TUI.
- Required keys must be entered and tested before the workspace is usable.
- The browser workspace must stay current-project scoped for launch.
- Avoid architecture churn before the live bridge exists; prove whether Next.js server behavior is actually needed before replacing it.
- Keep the experience snappy and fast.

## Integration Points

- CLI boot path — add `--web` launch behavior and browser auto-open.
- RPC subprocess / agent session — drive the live agent without TUI.
- Auth / onboarding storage — reuse or adapt existing provider/tool credential flows.
- GSD project artifacts — read current project state, milestones, slices, tasks, and activity from real files/sessions.
- Browser workspace — wire the exact skin to live data and actions.

## Open Questions

- Does M001 keep the Next.js shell as-is with a local bridge, or does the integration prove a lighter React-only host is the right follow-up? — default is keep the skin for M001 and revisit only if the live bridge shows Next is just overhead.
