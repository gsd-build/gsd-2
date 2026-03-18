---
estimated_steps: 5
estimated_files: 2
---

# T02: Build RemoteQuestionsPanel and wire into settings surface

**Slice:** S04 — Remote Questions Settings
**Milestone:** M008

## Description

Builds the `RemoteQuestionsPanel` component and wires it into the `gsd-prefs` command surface case. The panel reads initial state from the existing `useSettingsData()` hook and fetches full status (including env var availability) from `GET /api/remote-questions`. It provides a form for channel type, channel ID, timeout, and poll interval with client-side validation, save via `POST /api/remote-questions`, and disconnect via `DELETE /api/remote-questions`.

Follows the exact visual patterns of the existing `PrefsPanel`, `ModelRoutingPanel`, and `BudgetPanel` — same shared infrastructure (`SettingsHeader`, `SettingsLoading`, `SettingsError`, `SettingsEmpty`, `KvRow`, `Pill`), same spacing, same semantic color tokens.

**Relevant skill:** Load the `frontend-design` skill for high-quality UI polish.

## Steps

1. **Add `RemoteQuestionsPanel` to `web/components/gsd/settings-panels.tsx`:**
   - Add necessary imports at the top: a suitable icon from lucide-react (e.g., `MessageSquare` or `Radio`), plus `useState`, `useEffect`, `useCallback` from react
   - Create `RemoteQuestionsPanel` as an exported function component
   - Use `useSettingsData()` hook for initial data access (read `data?.preferences?.remoteQuestions`)
   - On mount, also fetch `GET /api/remote-questions` to get the env var status (which isn't in the settings data payload)
   - **State:** `channel`, `channelId`, `timeoutMinutes`, `pollIntervalSeconds` form fields, plus `envVarSet` / `envVarName` / `status` from the API, plus `saving` / `deleting` / `error` / `success` feedback states
   - **Empty state:** When no config exists, show `SettingsEmpty` with message "No remote channel configured"
   - **Configured state:** Show current config as `KvRow` entries plus env var status badge
   - **Form:** Channel type dropdown (`<select>` with slack/discord/telegram options), channel ID text input, timeout minutes number input (1-30), poll interval seconds number input (2-30)
   - **Client-side validation:** Channel ID pattern check:
     - Slack: `/^[A-Z0-9]{9,12}$/`
     - Discord: `/^\d{17,20}$/`
     - Telegram: `/^-?\d{5,20}$/`
     - Show inline validation message when pattern doesn't match
   - **Save button:** POST to `/api/remote-questions` with `{ channel, channelId, timeoutMinutes, pollIntervalSeconds }`. On success, refresh data and show brief success feedback. On error, show error message.
   - **Disconnect button:** Only shown when a channel is currently configured. DELETE to `/api/remote-questions`. On success, clear form state and show brief success feedback.
   - **Env var status:** Show a note below the form — green checkmark + "SLACK_BOT_TOKEN is set" or warning + "SLACK_BOT_TOKEN not set — configure via TUI or environment" (without revealing the value)
   - **Layout:** Follow the same panel structure as `PrefsPanel` — `SettingsHeader` at top, content below with `space-y-3` or `space-y-4` spacing, use `rounded-lg border` containers for field groups

2. **Use correct form input styling:**
   - Use existing design system classes: `bg-input border-border text-foreground` for inputs
   - Use `text-xs` or `text-sm` to match existing settings panel typography
   - Use semantic color tokens (`text-success`, `text-warning`, `text-destructive`) for validation feedback
   - Number inputs should use `type="number"` with `min`/`max` attributes

3. **Wire into `command-surface.tsx`:**
   - Add `RemoteQuestionsPanel` to the import from `./settings-panels` (line 62, existing import)
   - In the `gsd-prefs` case (around line 2029), add `<RemoteQuestionsPanel />` after `<BudgetPanel />`

4. **Verify build:**
   - Run `npm run build:web-host` — must exit 0
   - Check no TypeScript errors in touched files

5. **Browser verification (if web mode is running):**
   - Navigate to settings (`/gsd prefs`)
   - Confirm `RemoteQuestionsPanel` renders after the Budget panel
   - Verify empty state shows "No remote channel configured"
   - Test save/disconnect flow if possible

## Must-Haves

- [ ] `RemoteQuestionsPanel` exported from `settings-panels.tsx`
- [ ] Panel reads initial state from `useSettingsData()` hook
- [ ] Panel fetches env var status from `GET /api/remote-questions`
- [ ] Form with channel type select, channel ID input, timeout input, poll interval input
- [ ] Client-side channel ID validation with inline feedback
- [ ] Save button POSTs to `/api/remote-questions`
- [ ] Disconnect button DELETEs from `/api/remote-questions` (only shown when configured)
- [ ] Env var status displayed without revealing the value
- [ ] Panel wired into `gsd-prefs` case in `command-surface.tsx`
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- Panel renders in browser at `/gsd prefs` settings surface
- Save persists config to `~/.gsd/preferences.md`
- Disconnect removes config from `~/.gsd/preferences.md`

## Inputs

- `web/app/api/remote-questions/route.ts` — T01's API route (GET/POST/DELETE)
- `web/lib/settings-types.ts` — T01's `remoteQuestions` field on `SettingsPreferencesData`
- `web/components/gsd/settings-panels.tsx` — existing panels to follow pattern of (`PrefsPanel`, `ModelRoutingPanel`, `BudgetPanel`)
- `web/components/gsd/command-surface.tsx` — existing `gsd-prefs` case (line ~2029) to add the panel to
- Shared infrastructure already in `settings-panels.tsx`: `SettingsHeader`, `SettingsLoading`, `SettingsError`, `SettingsEmpty`, `KvRow`, `Pill`, `useSettingsData()`

## Expected Output

- `web/components/gsd/settings-panels.tsx` — new `RemoteQuestionsPanel` export added
- `web/components/gsd/command-surface.tsx` — `RemoteQuestionsPanel` rendered in `gsd-prefs` case

## Observability Impact

- **Panel renders at `/gsd prefs`** — visible after Budget panel as `[data-testid="settings-remote-questions"]`
- **Env var status** — panel displays whether the channel-specific bot token env var is set (boolean), never reveals the value
- **Form validation feedback** — inline destructive-colored message on invalid channel ID format, per-channel pattern hints
- **Save/disconnect feedback** — success banner (auto-clears after 3s) or error banner with descriptive message from API
- **API fetch errors** — displayed via `SettingsError` component with the error message from `GET /api/remote-questions`
- **Inspection:** `GET /api/remote-questions` returns `{ config, envVarSet, envVarName, status }` — inspectable via curl to verify panel data source
