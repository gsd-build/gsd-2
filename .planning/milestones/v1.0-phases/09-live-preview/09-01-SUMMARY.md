---
phase: 09-live-preview
plan: 01
subsystem: api
tags: [bun, proxy, session-persistence, mode-interceptor, websocket, live-preview]

# Dependency graph
requires:
  - phase: 08-discuss-review-mode
    provides: ModeEvent infrastructure and parseStreamForModeEvents in mode-interceptor.ts
  - phase: 06-claude-integration
    provides: pipeline.ts PipelineHandle and wireSessionEvents pattern
provides:
  - handleProxyRequest — Bun fetch forwarding with header stripping and offline HTML
  - readSession / writeSession with MissionControlSession schema (50-message cap)
  - dev_server_detected ModeEvent for localhost URL detection in Claude stdout
  - getPreviewPort / setPreviewPort on PipelineHandle with reset on switchProject
  - /api/preview/* route in server.ts forwarding to detected dev server
affects:
  - 09-live-preview (02+): PreviewPanel UI depends on getPreviewPort and preview_open WS event

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Bun native fetch forwarding (no http-proxy-middleware dependency)
    - Offline HTML page returned by proxy instead of empty 503 (iframe-friendly)
    - Regex URL scan on stripped text after XML processing in parseStreamForModeEvents
    - Closure variable (previewPort) per startPipeline invocation, reset on switchProject
    - writeFileSync (sync) for session persistence, readFile (async) on startup

key-files:
  created:
    - packages/mission-control/src/server/proxy-api.ts
    - packages/mission-control/src/server/session-persistence-api.ts
    - packages/mission-control/tests/proxy-api.test.ts
    - packages/mission-control/tests/session-persistence.test.ts
  modified:
    - packages/mission-control/src/server/chat-types.ts
    - packages/mission-control/src/server/mode-interceptor.ts
    - packages/mission-control/src/server/pipeline.ts
    - packages/mission-control/src/server.ts
    - packages/mission-control/tests/mode-interceptor.test.ts

key-decisions:
  - "Offline HTML returned at status 200 (not 503) so iframe renders it as page content instead of broken frame"
  - "X-Frame-Options and Content-Security-Policy stripped from all proxied responses to prevent iframe blocking"
  - "previewPort stored as closure variable inside startPipeline (not module-level) to ensure per-project reset on switchProject"
  - "dev_server_detected URL scan runs on stripped text (post-XML) so mode tag content does not match localhost patterns"
  - "Ports 4000 and 4001 explicitly excluded from dev_server_detected to avoid Mission Control self-detection"
  - "session-persistence-api.ts is distinct from session-metadata.json — separate file for UI state (layout, viewport, chat history)"

patterns-established:
  - "Pattern: Proxy API follows handleFsRequest dispatcher pattern — returns Response directly (not Response|null) for /api/preview"
  - "Pattern: Session persistence uses readFile (async) on startup, writeFileSync (sync) on state changes — same as session-manager.ts"
  - "Pattern: TDD Wave 0 — failing test scaffolds committed before implementation, implementation makes them GREEN"

requirements-completed:
  - SERV-06
  - SERV-07

# Metrics
duration: 7min
completed: 2026-03-12
---

# Phase 9 Plan 01: Live Preview Server Foundation Summary

**Bun HTTP proxy with offline HTML, localhost URL detection for auto-open, and session persistence API with 50-message cap — full server-side foundation for live preview**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-12T07:08:40Z
- **Completed:** 2026-03-12T07:15:27Z
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files modified:** 9

## Accomplishments

- `proxy-api.ts`: handleProxyRequest forwards to dev server with Bun fetch, strips X-Frame-Options and Content-Security-Policy, returns styled offline HTML at status 200 when port is null or server unreachable
- `session-persistence-api.ts`: readSession/writeSession for `.planning/.mission-control-session.json` with MissionControlSession schema (version 1, layoutPrefs, chatHistory capped at 50 per sessionId, lastView always "chat", activeViewport)
- `mode-interceptor.ts`: dev_server_detected events emitted for localhost:PORT and 127.0.0.1:PORT patterns in Claude stdout, excluding ports 4000/4001
- `pipeline.ts`: PipelineHandle gains getPreviewPort/setPreviewPort; previewPort closure variable resets on switchProject; preview_open broadcast via publishChat when dev server detected
- `server.ts`: /api/preview route wired before 404 fallback, forwarding to handleProxyRequest

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 test scaffolds for proxy, session persistence, and URL detection** - `8307f1d` (test)
2. **Task 2: Proxy API, session persistence, mode-interceptor URL detection, pipeline extension, server route** - `c69f7a2` (feat)

**Plan metadata:** (pending — this commit)

_Note: TDD tasks — Task 1 was RED (failing imports), Task 2 is GREEN (19/19 pass)_

## Files Created/Modified

- `packages/mission-control/src/server/proxy-api.ts` - Bun fetch proxy with header stripping and offline HTML fallback
- `packages/mission-control/src/server/session-persistence-api.ts` - readSession/writeSession with MissionControlSession schema
- `packages/mission-control/src/server/chat-types.ts` - Added dev_server_detected to ModeEventType, port field on ModeEvent
- `packages/mission-control/src/server/mode-interceptor.ts` - URL detection scan on stripped text, excludes ports 4000/4001
- `packages/mission-control/src/server/pipeline.ts` - getPreviewPort/setPreviewPort on PipelineHandle, previewPort closure, switchProject reset
- `packages/mission-control/src/server.ts` - /api/preview route before 404 fallback
- `packages/mission-control/tests/proxy-api.test.ts` - 4 tests: forwarding, header stripping, offline HTML, status 200
- `packages/mission-control/tests/session-persistence.test.ts` - 4 tests: default values, 50-message cap, layoutPrefs, round-trip
- `packages/mission-control/tests/mode-interceptor.test.ts` - Extended with 5 dev_server_detected tests

## Decisions Made

- Offline HTML returned at status 200 so iframe renders the message as page content (not a broken iframe error) — per RESEARCH.md Pattern 5
- X-Frame-Options and Content-Security-Policy headers stripped unconditionally from all proxied responses — dev tooling often sets these by default
- `previewPort` stored as a closure variable inside `startPipeline` (not module-level) to ensure per-project isolation and reset on project switch
- URL scan runs on `stripped` text after XML mode tag processing — avoids false matches inside XML attributes or mode tag content
- `session-persistence-api.ts` uses a separate file from `.session-metadata.json` to avoid schema conflicts with session continuity data

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing test failures (TaskExecuting x5, ClaudeProcessManager x3, ChatView x1) were present before our changes and are unrelated to Phase 9 work. Net result: 448 pass (up from 446 baseline), 9 fail (down from 11 pre-existing).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All Wave 0 contracts established: proxy, session persistence, dev server detection, pipeline port tracking
- 19 Wave 0 tests GREEN as acceptance gates for implementation
- Ready for Phase 09-02: PreviewPanel UI (overlay drawer, viewport switcher, Cmd+P binding, usePreview hook)

---
*Phase: 09-live-preview*
*Completed: 2026-03-12*
