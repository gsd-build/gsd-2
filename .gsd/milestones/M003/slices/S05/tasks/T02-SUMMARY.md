---
id: T02
parent: S05
milestone: M003
provides:
  - CommandSurfaceKnowledgeCapturesState contract types and initialization
  - Store actions for loading knowledge, captures, and resolving capture triage
  - KnowledgeCapturesPanel two-tab component (Knowledge + Captures)
  - Command surface wiring for gsd-knowledge, gsd-capture, gsd-triage sections
key_files:
  - web/lib/command-surface-contract.ts
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/knowledge-captures-panel.tsx
  - web/components/gsd/command-surface.tsx
key_decisions:
  - Panel component implements its own lightweight PanelHeader/PanelError/PanelLoading/PanelEmpty helpers instead of importing from diagnostics-panels.tsx (those are not exported)
  - Both tabs pre-load data on section open for instant tab switching
patterns_established:
  - patchKnowledgeCapturesState / patchKnowledgeCapturesPhaseState follows same pattern as patchDoctorState / patchDiagnosticsPhaseState
  - Tab-based panel with initialTab prop driven by command surface section
observability_surfaces:
  - commandSurface.knowledgeCaptures.knowledge.phase — idle/loading/loaded/error
  - commandSurface.knowledgeCaptures.captures.phase — idle/loading/loaded/error
  - commandSurface.knowledgeCaptures.resolveRequest.pending/lastError/lastResult — triage action lifecycle
  - Network requests to /api/knowledge and /api/captures visible in devtools
duration: 12min
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Add contract state, store actions, panel component, and wire into command surface

**Built full client-side integration: contract state, store methods, two-tab panel component, and command surface wiring for knowledge/captures/triage sections.**

## What Happened

1. **Contract (`command-surface-contract.ts`)** — Added `CommandSurfaceKnowledgeCapturesResolveState`, `CommandSurfaceKnowledgeCapturesState` interfaces, `createInitialKnowledgeCapturesState()` factory, and `knowledgeCaptures` field to `WorkspaceCommandSurfaceState`. Initialized in both `createInitialCommandSurfaceState()` and `openCommandSurfaceState()`.

2. **Store (`gsd-workspace-store.tsx`)** — Added `patchKnowledgeCapturesState()` and `patchKnowledgeCapturesPhaseState()` private helpers. Added `loadKnowledgeData()`, `loadCapturesData()`, and `resolveCaptureAction()` public async methods. Registered all three in `ActionKey` union and `useGSDWorkspaceActions` hook.

3. **Panel component (`knowledge-captures-panel.tsx`)** — Created two-tab panel with Knowledge and Captures tabs. Knowledge tab shows entries with type badges (rule/pattern/lesson/freeform). Captures tab shows entries with status badges (pending/triaged/resolved), classification labels, and triage action buttons for pending entries. Inline PanelHeader/PanelError/PanelLoading/PanelEmpty helpers match diagnostics-panels styling.

4. **Command surface wiring (`command-surface.tsx`)** — Imported panel, added `loadKnowledgeData`/`loadCapturesData` to destructured actions, added useEffect auto-load conditions for gsd-knowledge/gsd-capture/gsd-triage sections, and wired three renderSection cases.

## Verification

- `npm run build` — TypeScript compilation exits 0 ✅
- `npm run build:web-host` — Next.js production build exits 0 (no SSR errors) ✅
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 114 pass, 4 fail ✅ (4 failures are pre-existing `/gsd visualize` issues confirmed by running against clean branch — same 114/4 result)

## Diagnostics

- **State inspection:** `useGSDWorkspaceState().commandSurface.knowledgeCaptures` shows full phase state for knowledge, captures, and resolveRequest
- **Network:** GET `/api/knowledge` and `/api/captures` fire on section open; POST `/api/captures` on triage button click
- **Error visibility:** Phase `"error"` with message string rendered inline; resolve errors shown above captures list

## Deviations

None — implemented exactly as planned.

## Known Issues

- Pre-existing: 4 test failures for `/gsd visualize` (view-navigate vs surface assertion) unrelated to this task — confirmed same result on clean branch

## Files Created/Modified

- `web/lib/command-surface-contract.ts` — Added knowledge/captures state interfaces, factory, and field in WorkspaceCommandSurfaceState
- `web/lib/gsd-workspace-store.tsx` — Added imports, private patch helpers, 3 async load/resolve methods, ActionKey entries, hook entries
- `web/components/gsd/knowledge-captures-panel.tsx` — New two-tab panel component with knowledge entries, capture entries, and triage actions
- `web/components/gsd/command-surface.tsx` — Import, useEffect auto-load, renderSection wiring for 3 sections
- `.gsd/milestones/M003/slices/S05/tasks/T02-PLAN.md` — Added missing Observability Impact section
