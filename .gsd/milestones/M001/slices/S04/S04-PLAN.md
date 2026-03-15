# S04: Current-project state surfaces

**Goal:** Dashboard, Roadmap, Files, Activity, and DualTerminal views render real current-project data from the workspace store instead of hardcoded mock arrays.
**Demo:** Opening each view in a running `gsd --web` session shows live project state (milestones, slices, tasks, activity, .gsd/ files) derived from the boot payload and SSE events — no static placeholder data remains.

## Must-Haves

- Roadmap view renders milestones/slices/tasks from `boot.workspace.milestones` with status, risk badges, dependency labels, and progress derived from real data
- Activity view renders timestamped events from `terminalLines` store state instead of a static array
- Dashboard view renders metrics (elapsed, cost, tokens, progress) from `boot.auto` and `boot.workspace`, current-slice tasks from the workspace index, and recent activity from `terminalLines`
- DualTerminal left pane renders real auto-mode state from `boot.auto` and `terminalLines`; right pane delegates to the S03 Terminal component
- FilesView fetches and displays real `.gsd/` directory contents via a new server endpoint
- Files API endpoint is scoped to `.gsd/` within the project cwd — path traversal rejected
- Status derivation helpers (`getMilestoneStatus`, `getSliceStatus`, `getTaskStatus`) are shared between sidebar and roadmap, not duplicated
- `WorkspaceSliceTarget` carries `risk`, `depends`, and `demo` from the roadmap parser through to the client
- Every view handles empty/loading state intentionally (no milestones yet, auto-mode not active, no terminal lines) without looking broken
- All static mock arrays removed from the five view components — no mock/live mixing (R008)

## Proof Level

- This slice proves: integration
- Real runtime required: yes (build + running host with boot payload)
- Human/UAT required: no (contract test + build + existing test suite covers)

## Verification

- `npm run build:web-host` — all five rewired views compile and mount against real store state
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-state-surfaces-contract.test.ts` — workspace index carries risk/depends/demo, files API serves .gsd/ content and rejects path traversal, shared status helpers derive correctly
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-bridge-contract.test.ts src/tests/web-onboarding-contract.test.ts src/tests/web-live-interaction-contract.test.ts` — no regressions from workspace index or shared helper changes
- `grep -rn 'const roadmapData\|const activityLog\|const recentActivity\|const currentSliceTasks\|const modelUsage\|const gsdFiles\|AutoModeState.*idle.*working' web/components/gsd/roadmap.tsx web/components/gsd/activity-view.tsx web/components/gsd/dashboard.tsx web/components/gsd/files-view.tsx web/components/gsd/dual-terminal.tsx` — returns no matches (mock data removed)

## Observability / Diagnostics

- Runtime signals: views derive state from `boot.workspace`, `boot.auto`, `terminalLines` — all inspectable via store snapshot or `/api/boot`
- Inspection surfaces: `/api/boot` workspace payload now carries slice risk/depends/demo; `/api/files` serves .gsd/ tree and content
- Failure visibility: empty-state rendering for each view when data is absent (no milestones, auto inactive, no terminal lines); files API returns structured errors for invalid paths
- Redaction constraints: files API scoped to `.gsd/` only — no arbitrary filesystem reads

## Integration Closure

- Upstream surfaces consumed: `boot.workspace.milestones` (S01), `boot.auto` (S01), `boot.bridge` (S01), `terminalLines` (S03), `liveTranscript`/`activeToolExecution` (S03), status bar utility functions (S01)
- New wiring introduced in this slice: shared workspace-status helpers, extended WorkspaceSliceTarget with roadmap metadata, `/api/files` endpoint, five view components rewired to store
- What remains before the milestone is truly usable end-to-end: S05 (start/resume workflow controls), S06 (power mode + continuity + failure visibility), S07 (end-to-end assembly proof)

## Tasks

- [x] **T01: Extend workspace index and wire Roadmap + Activity views** `est:45m`
  - Why: Roadmap needs risk/depends/demo data the workspace index currently drops. Activity needs terminalLines. Both need shared status helpers that are currently local to sidebar.tsx. This establishes the data foundations the other views build on.
  - Files: `src/resources/extensions/gsd/workspace-index.ts`, `web/lib/gsd-workspace-store.tsx`, `web/lib/workspace-status.ts` (new), `web/components/gsd/sidebar.tsx`, `web/components/gsd/roadmap.tsx`, `web/components/gsd/activity-view.tsx`
  - Do: (1) Add `risk`, `depends`, `demo` fields to `WorkspaceSliceTarget` in both `workspace-index.ts` and the client store interface. Pass them through in `indexWorkspace` from `RoadmapSliceEntry`. (2) Extract `getMilestoneStatus`, `getSliceStatus`, `getTaskStatus` from `sidebar.tsx` into a shared `web/lib/workspace-status.ts` module. Update sidebar to import from there. (3) Replace `roadmapData` in `roadmap.tsx` with `useGSDWorkspaceState()` → `boot.workspace.milestones`, using shared status helpers and the new risk/depends/demo fields. Preserve the exact visual layout (D002). Handle empty state. (4) Replace `activityLog` in `activity-view.tsx` with `terminalLines` from the store. Map `TerminalLineType` to event icons. Handle empty state.
  - Verify: `npm run build:web-host` compiles; mock arrays removed from roadmap.tsx and activity-view.tsx
  - Done when: Roadmap renders real milestones/slices with risk badges and dependency labels from workspace index; Activity renders real terminal events; sidebar still works with extracted helpers

- [x] **T02: Wire Dashboard and DualTerminal views to real store data** `est:45m`
  - Why: Dashboard and DualTerminal both consume `boot.auto` (elapsed, cost, tokens) and workspace state. DualTerminal's right pane is redundant with the S03 Terminal — delegate to it instead of maintaining a separate mock command terminal.
  - Files: `web/components/gsd/dashboard.tsx`, `web/components/gsd/dual-terminal.tsx`
  - Do: (1) Replace Dashboard mock data: metric cards from `boot.auto` (elapsed via `formatDuration`, cost via `formatCost`, tokens via `formatTokens`), progress from workspace slice tasks, current-slice section from `getCurrentSlice(workspace)?.tasks`, recent activity from last N `terminalLines`, session/model info from `boot.bridge`. Use store utility functions. Handle auto-inactive state (zeros are correct). (2) Replace DualTerminal: left pane reads `boot.auto` for phase/progress/cost/tokens and `terminalLines` for log output — no simulated intervals. Right pane replaces `CommandTerminal` with the S03 `Terminal` component. Preserve the split-pane visual structure (D002).
  - Verify: `npm run build:web-host` compiles; mock arrays and simulated intervals removed from both files
  - Done when: Dashboard shows real metrics/progress/activity from store; DualTerminal left pane shows real auto state, right pane is the live Terminal

- [x] **T03: Add .gsd/ files API, wire FilesView, and write contract test** `est:45m`
  - Why: FilesView is the only view requiring a new server endpoint. The contract test proves mock data is fully removed and the new data plumbing is correct — closing R008.
  - Files: `web/app/api/files/route.ts` (new), `web/components/gsd/files-view.tsx`, `src/tests/web-state-surfaces-contract.test.ts` (new)
  - Do: (1) Add `GET /api/files` route that lists the `.gsd/` directory tree and reads individual file content via `?path=` query param. Scope all reads to `.gsd/` within the project cwd — reject path traversal (`..`, absolute paths, symlink escapes). Return `{ tree: FileNode[] }` for listing, `{ content: string }` for file reads. (2) Wire `FilesView` to fetch the tree on mount and fetch content on file selection. Replace the hardcoded `gsdFiles` constant. Preserve the file-tree + content-preview layout (D002). Handle loading/empty/error states. (3) Write `web-state-surfaces-contract.test.ts` covering: workspace index includes risk/depends/demo on slices; shared status helpers derive correctly for done/in-progress/pending; files API returns directory listing and file content; files API rejects path traversal attempts.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-state-surfaces-contract.test.ts` passes; `npm run build:web-host` compiles; grep for mock data constants returns empty
  - Done when: FilesView renders real .gsd/ files; contract test passes; no mock arrays remain in any of the five view components

- [x] **T04: Wire live session context into views and verify mock-free invariant** `est:30m`
  - Why: The live session context fields from S03 (activeToolExecution, streamingAssistantText, statusTexts) are not consumed by any view. Dashboard and DualTerminal should show tool execution state, StatusBar should surface extension status texts, and a contract test should formally verify the mock-free invariant.
  - Files: `web/components/gsd/dashboard.tsx`, `web/components/gsd/dual-terminal.tsx`, `web/components/gsd/status-bar.tsx`, `src/tests/web-state-surfaces-contract.test.ts`
  - Do: (1) Dashboard Session card: render activeToolExecution.name with pulsing dot, render streaming indicator when streamingAssistantText is non-empty. (2) DualTerminal AutoTerminal: render activeToolExecution.name below current unit. (3) StatusBar: render most recent statusTexts entry in left section. (4) Contract test: add 5 tests asserting no mock data arrays remain, all views import from real data sources, and dashboard/statusbar/dual-terminal consume the correct live session fields.
  - Verify: contract tests pass (17/17), build clean, regression tests pass (20/20)
  - Done when: All three views render live session context, contract test proves mock-free invariant

## Files Likely Touched

- `src/resources/extensions/gsd/workspace-index.ts`
- `web/lib/gsd-workspace-store.tsx`
- `web/lib/workspace-status.ts` (new)
- `web/components/gsd/sidebar.tsx`
- `web/components/gsd/roadmap.tsx`
- `web/components/gsd/activity-view.tsx`
- `web/components/gsd/dashboard.tsx`
- `web/components/gsd/dual-terminal.tsx`
- `web/app/api/files/route.ts` (new)
- `src/tests/web-state-surfaces-contract.test.ts` (new)
