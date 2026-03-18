---
id: T02
parent: S04
milestone: M008
provides:
  - RemoteQuestionsPanel component for settings surface
  - Remote questions config UI with save/disconnect/validation
key_files:
  - web/components/gsd/settings-panels.tsx
  - web/components/gsd/command-surface.tsx
key_decisions:
  - Used onBlur-triggered validation (channelIdTouched) to avoid aggressive validation while typing
  - Derived env var name client-side as fallback when API hasn't responded yet
patterns_established:
  - Settings panel with form inputs — select, text, number with client-side validation and API save/delete
  - Success feedback auto-clear via useEffect timer (3s)
observability_surfaces:
  - data-testid="settings-remote-questions" for the panel root element
  - Success/error banners visible in panel after save/disconnect operations
  - Env var status displayed as green success or yellow warning badge (never reveals value)
duration: 15m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Build RemoteQuestionsPanel and wire into settings surface

**Built RemoteQuestionsPanel with channel config form, client-side validation, save/disconnect, and env var status — wired into gsd-prefs settings surface.**

## What Happened

1. Added `RemoteQuestionsPanel` to `web/components/gsd/settings-panels.tsx`:
   - Uses `useSettingsData()` hook for initial data, fetches `GET /api/remote-questions` for env var status
   - Form with channel type select (slack/discord/telegram), channel ID text input with per-channel regex validation, timeout minutes (1-30), poll interval seconds (2-30)
   - Channel ID validation shows inline error on blur with pattern hint per channel type
   - Save button POSTs to API, disconnect button DELETEs — both show success/error feedback
   - Env var status badge: green checkmark when set, yellow warning when not (never reveals value)
   - Empty state shows "No remote channel configured" via SettingsEmpty
   - Configured state shows current config as KvRow entries in a bordered card

2. Wired into `command-surface.tsx`:
   - Added to import line alongside PrefsPanel, ModelRoutingPanel, BudgetPanel
   - Rendered after BudgetPanel in the `gsd-prefs` case

3. Follows exact patterns of existing panels — same shared infrastructure (SettingsHeader, SettingsLoading, SettingsError, SettingsEmpty, KvRow), same spacing, same semantic color tokens.

## Verification

- `npm run build:web-host` exits 0 — `/api/remote-questions` listed as dynamic route ✓
- `RemoteQuestionsPanel` exported from `settings-panels.tsx` at line 534 ✓
- Import wired in `command-surface.tsx` line 62, rendered at line 2035 ✓
- Full CRUD via curl: POST saves → GET reads → DELETE disconnects → GET confirms removal ✓
- POST with invalid channel ID returns 400 with descriptive error ✓
- Browser visual verification unavailable (browser tool session failed), but component uses identical patterns to existing panels that render correctly

### Slice-level checks
- [x] `npm run build:web-host` exits 0
- [x] `RemoteQuestionsPanel` wired into gsd-prefs case
- [x] Save config → remote_questions block in ~/.gsd/preferences.md
- [x] Disconnect → block removed
- [x] GET returns current state after mutations
- [x] POST with invalid channel ID returns 400 with descriptive error
- [ ] Browser visual verification (browser tool unavailable — deferred to manual/next task)

## Diagnostics

- `curl http://localhost:3000/api/remote-questions` — returns current config + env var status
- Panel renders at `/gsd prefs` as `[data-testid="settings-remote-questions"]`
- Save/disconnect operations show success banner (auto-clears 3s) or error banner

## Deviations

None.

## Known Issues

- Browser visual verification could not be completed — browser tool session not available in this environment. Build passes and component follows identical patterns to existing panels.

## Files Created/Modified

- `web/components/gsd/settings-panels.tsx` — added RemoteQuestionsPanel export with form, validation, save/disconnect, env var status
- `web/components/gsd/command-surface.tsx` — added RemoteQuestionsPanel import and render in gsd-prefs case
- `.gsd/milestones/M008/slices/S04/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
