---
phase: 09-live-preview
plan: 02
subsystem: ui
tags: [react, hooks, preview, websocket, device-frames, tdd, viewport, lucide-react, tw-animate-css]

# Dependency graph
requires:
  - phase: 09-live-preview-01
    provides: proxy-api.ts handleProxyRequest, pipeline.ts getPreviewPort/setPreviewPort, preview_open WebSocket broadcast
  - phase: 08-discuss-review-mode
    provides: pure/stateful component split pattern (ReviewView/ReviewViewWithAnimation), shouldPulseOnTaskChange pure function export pattern
provides:
  - usePreview hook with open/port/viewport state, Cmd+P binding, preview_open WS listener
  - shouldTogglePreview pure exported function for hook-free test assertions
  - PreviewPanel pure render component (hook-free, all props)
  - ViewportSwitcher four-button row (Desktop/Tablet/Mobile/Dual)
  - DeviceFrame CSS shells for iPhone 14 and Pixel 7 with DEVICE_FRAMES constant
  - PreviewPanelWithState stateful wrapper for AppShell integration
affects:
  - 09-live-preview (03+): AppShell wiring of usePreview + PreviewPanel rendering

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pure function extraction: shouldTogglePreview exported alongside hook for direct test calls (no React renderer needed)
    - Pure/stateful split: PreviewPanel (hook-free, testable) + PreviewPanelWithState (owns useState)
    - Device frame CSS: border + border-radius + fixed dimensions from DEVICE_FRAMES lookup, no external library
    - Slide-in animation: "animate-in slide-in-from-right duration-200" from tw-animate-css (matches DecisionLogDrawer.tsx)

key-files:
  created:
    - packages/mission-control/src/hooks/usePreview.ts
    - packages/mission-control/src/components/preview/PreviewPanel.tsx
    - packages/mission-control/src/components/preview/PreviewPanelWithState.tsx
    - packages/mission-control/src/components/preview/ViewportSwitcher.tsx
    - packages/mission-control/src/components/preview/DeviceFrame.tsx
    - packages/mission-control/tests/usePreview.test.ts
    - packages/mission-control/tests/preview-panel.test.tsx
  modified: []

key-decisions:
  - "shouldTogglePreview checks e.key === 'p' (lowercase only) — Cmd+Shift+P with uppercase P does not trigger"
  - "KeyboardEvent constructor not available in bun test environment — tests use plain objects cast to KeyboardEvent"
  - "ViewportSwitcher renders as component reference in JSON.stringify (not expanded) — test asserts on viewport prop value in tree"
  - "PreviewPanelWithState accepts initialPort to allow AppShell to seed detected port from usePreview"
  - "DeviceFrame cosmetic: iPhone uses notch div at top, Pixel uses punch-hole circle — minimal visual differentiation"

patterns-established:
  - "Pattern: usePreview follows useChatMode raw WebSocket pattern exactly (new WebSocket, not useReconnectingWebSocket)"
  - "Pattern: Component tree tests use JSON.stringify + string containment (no DOM renderer required)"
  - "Pattern: DEVICE_FRAMES constant exported from DeviceFrame.tsx for testability (same as TIER_STYLES, STATUS_CONFIG)"

requirements-completed:
  - PREV-01
  - PREV-02
  - PREV-03
  - PREV-04

# Metrics
duration: 10min
completed: 2026-03-12
---

# Phase 9 Plan 02: Preview Panel UI Summary

**usePreview hook (Cmd+P binding + WebSocket auto-open) and full PreviewPanel component tree (pure render, viewport switcher, dual device frames for iPhone 14 + Pixel 7) — 36 tests GREEN**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-12T07:38:38Z
- **Completed:** 2026-03-12T07:48:38Z
- **Tasks:** 2 (TDD: RED then GREEN for each)
- **Files modified:** 7

## Accomplishments

- `usePreview.ts`: hook with open/port/viewport state, Cmd+P / Ctrl+P keydown listener, raw WebSocket listener for `preview_open` events; `shouldTogglePreview` exported pure function for test assertions
- `PreviewPanel.tsx`: pure render with `animate-in slide-in-from-right duration-200`, header with editable port input, ViewportSwitcher in header, single/dual iframe modes, native app empty state
- `ViewportSwitcher.tsx`: four buttons (Desktop 1440px, Tablet 768px, Mobile 375px, Dual) using Lucide icons, cyan active state
- `DeviceFrame.tsx`: iPhone 14 (390x750, radius 47) and Pixel 7 (412x750, radius 17) CSS frames with iframeIds, `DEVICE_FRAMES` const exported
- `PreviewPanelWithState.tsx`: stateful wrapper owning port + viewport state for AppShell integration

## Task Commits

Each task was committed atomically:

1. **Task 1: usePreview hook + test scaffold (PREV-01)** - `7c0e624` (feat)
2. **Task 2: PreviewPanel component tree + test scaffold (PREV-02, PREV-03, PREV-04)** - `9f9a1c6` (feat)

**Plan metadata:** (pending — this commit)

_Note: TDD tasks — RED phase confirmed (import fails) before each GREEN implementation_

## Files Created/Modified

- `packages/mission-control/src/hooks/usePreview.ts` - Hook with Cmd+P binding, WS listener, shouldTogglePreview pure export
- `packages/mission-control/src/components/preview/PreviewPanel.tsx` - Pure render panel with slide-in animation
- `packages/mission-control/src/components/preview/PreviewPanelWithState.tsx` - Stateful wrapper for AppShell
- `packages/mission-control/src/components/preview/ViewportSwitcher.tsx` - Four viewport buttons with Lucide icons
- `packages/mission-control/src/components/preview/DeviceFrame.tsx` - iPhone 14 + Pixel 7 CSS device frames
- `packages/mission-control/tests/usePreview.test.ts` - 14 tests: keyboard, WS shape, viewport values
- `packages/mission-control/tests/preview-panel.test.tsx` - 22 tests: animation class, dual ids, port input, native state

## Decisions Made

- `shouldTogglePreview` checks `e.key === "p"` (lowercase) — Shift+Cmd+P with uppercase `P` intentionally excluded
- `KeyboardEvent` constructor is not available in bun test environment — tests use plain objects cast to `KeyboardEvent` for `shouldTogglePreview`
- `JSON.stringify` on React elements renders child components as opaque references (props visible but not expanded) — tests adjusted to assert on `"viewport":"desktop"` instead of button label text
- `PreviewPanelWithState` accepts `initialPort` prop to allow AppShell to seed the port from `usePreview`
- DeviceFrame notch (iPhone) vs punch-hole (Pixel) purely cosmetic — minimal CSS divs, no image assets

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Expectation Fix] Adjusted test assertions for React JSON serialization**
- **Found during:** Task 2 (preview-panel.test.tsx GREEN phase)
- **Issue:** Two tests failed: `expect(html).toContain("onClose")` — functions don't appear in JSON; `expect(html).toContain("Desktop")` — ViewportSwitcher renders as component ref not expanded
- **Fix:** Changed assertions to match actual serialization: `toContain("Close preview")` (aria-label) and `toContain('"viewport":"desktop"')` (component prop)
- **Files modified:** tests/preview-panel.test.tsx
- **Verification:** All 22 tests GREEN after adjustment
- **Committed in:** `9f9a1c6` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — test expectation mismatch on React serialization)
**Impact on plan:** No scope change. Fix required for test reliability.

## Issues Encountered

- Pre-existing test failures (9 tests) remain unchanged from baseline — ChatView hook violation, ClaudeProcessManager, etc. None related to Phase 9 work.
- Full suite: 484 pass / 9 fail (net gain: +36 tests from this plan)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All PREV-01 through PREV-04 automated tests GREEN (36 tests total across Tasks 1 and 2)
- `usePreview` hook ready for AppShell wiring in Phase 09-03
- `PreviewPanelWithState` accepts port from `usePreview` via `initialPort` prop
- `shouldTogglePreview` and `DEVICE_FRAMES` exported for additional test coverage if needed

## Self-Check: PASSED

- usePreview.ts: FOUND
- PreviewPanel.tsx: FOUND
- ViewportSwitcher.tsx: FOUND
- DeviceFrame.tsx: FOUND
- PreviewPanelWithState.tsx: FOUND
- 09-02-SUMMARY.md: FOUND
- Commit 7c0e624: FOUND
- Commit 9f9a1c6: FOUND

---
*Phase: 09-live-preview*
*Completed: 2026-03-12*
