# S04: Remote Questions Settings

**Goal:** Slack/Discord/Telegram remote question configuration is accessible from the web settings panel — users can view, save, and disconnect channel config without the TUI.
**Demo:** Open `/gsd prefs` in web mode → `RemoteQuestionsPanel` renders with current state (empty or configured). Fill channel type, channel ID, timeout, poll interval → Save → `~/.gsd/preferences.md` has the `remote_questions` YAML block. Click Disconnect → block removed. Refresh → panel reflects current state.

## Must-Haves

- `RemoteQuestionsPanel` component renders in the settings surface under `/gsd prefs`
- Read path: panel shows current `remote_questions` config from preferences (or empty state)
- Write path: Save persists channel type, channel ID, timeout, poll interval to `~/.gsd/preferences.md` YAML frontmatter
- Delete path: Disconnect removes the `remote_questions` block from preferences
- Client-side validation: channel ID format matches `CHANNEL_ID_PATTERNS` (Slack: `[A-Z0-9]{9,12}`, Discord: `\d{17,20}`, Telegram: `-?\d{5,20}`)
- Server-side validation: channel type is slack/discord/telegram, channel ID matches patterns, timeout clamped 1-30, poll interval clamped 2-30
- Panel shows env var status note (whether `SLACK_BOT_TOKEN` / `DISCORD_BOT_TOKEN` / `TELEGRAM_BOT_TOKEN` is set) without revealing the value
- Panel does NOT handle bot token setup — that stays in TUI/`secure_env_collect`

## Proof Level

- This slice proves: integration
- Real runtime required: yes (YAML read/write against real `~/.gsd/preferences.md`)
- Human/UAT required: yes (visual check of panel in browser)

## Verification

- `npm run build:web-host` exits 0
- Start web mode, navigate to settings, confirm `RemoteQuestionsPanel` renders
- Save config → verify `remote_questions` block in `~/.gsd/preferences.md`
- Disconnect → verify block removed
- Refresh → confirm panel reflects current state
- `GET /api/remote-questions` returns structured JSON with `status` and `error` fields for both success and failure paths
- `POST /api/remote-questions` with invalid channel ID returns 400 with descriptive `{ error }` message

## Observability / Diagnostics

- Runtime signals: API route returns structured JSON with `status` field indicating config state
- Inspection surfaces: `GET /api/remote-questions` returns current config + env var status
- Failure visibility: API errors return `{ error: string }` with descriptive messages
- Redaction constraints: env var values never exposed — only whether the required token env var is set (boolean)

## Integration Closure

- Upstream surfaces consumed: `RemoteQuestionsConfig` type from `src/resources/extensions/gsd/preferences.ts`, `CHANNEL_ID_PATTERNS` / validation constants from `src/resources/extensions/remote-questions/config.ts`, `collectSettingsData()` child script in `src/web/settings-service.ts`, existing settings data loading in `gsd-workspace-store.tsx`
- New wiring introduced in this slice: `/api/remote-questions/route.ts` API route, `RemoteQuestionsPanel` rendered in `command-surface.tsx` gsd-prefs case
- What remains before the milestone is truly usable end-to-end: S05 (progress bar dynamics + terminal text size)

## Tasks

- [x] **T01: Add remote questions types, child script field, and API route** `est:45m`
  - Why: Establishes the data contract and read/write API that the UI panel consumes. The type extension unblocks the read path via existing `loadSettingsData()`. The API route provides GET (current config + env var status), POST (save config), and DELETE (remove config) — all doing direct YAML frontmatter manipulation on `~/.gsd/preferences.md`.
  - Files: `web/lib/settings-types.ts`, `src/web/settings-service.ts`, `web/app/api/remote-questions/route.ts`
  - Do: (1) Add `remoteQuestions` optional field to `SettingsPreferencesData` in `settings-types.ts` with shape `{ channel?: "slack" | "discord" | "telegram"; channelId?: string; timeoutMinutes?: number; pollIntervalSeconds?: number }`. (2) In `settings-service.ts` child script, add `remoteQuestions` field that maps from `p.remote_questions` — map `channel_id` → `channelId`, `timeout_minutes` → `timeoutMinutes`, `poll_interval_seconds` → `pollIntervalSeconds`, stringify `channel_id` since it can be string|number. (3) Create `/api/remote-questions/route.ts` with GET/POST/DELETE. GET reads `~/.gsd/preferences.md` YAML frontmatter, extracts `remote_questions`, checks if the required env var is set. POST validates inputs (channel must be slack/discord/telegram, channel_id must match pattern, timeout clamped 1-30, poll clamped 2-30) and writes back. DELETE removes the `remote_questions` block. Use `homedir()` + `.gsd/preferences.md` for path. Use regex-based YAML frontmatter parsing matching the pattern in `parsePreferencesMarkdown()` from preferences.ts. Replicate `CHANNEL_ID_PATTERNS` constants directly in the route (cannot import from extension modules due to Turbopack constraint). Include `ENV_KEYS` map for env var status check.
  - Verify: `npx tsc --noEmit -p web/tsconfig.json` passes (or at minimum no errors in touched files)
  - Done when: `GET /api/remote-questions` returns valid JSON with config and env var status fields, POST saves valid config, DELETE removes it, types compile cleanly.

- [x] **T02: Build RemoteQuestionsPanel and wire into settings surface** `est:45m`
  - Why: Delivers the user-facing UI that reads from the existing `useSettingsData()` hook and writes via fetch to `/api/remote-questions`. Wires the panel into the `gsd-prefs` command surface case.
  - Files: `web/components/gsd/settings-panels.tsx`, `web/components/gsd/command-surface.tsx`
  - Do: (1) Add `RemoteQuestionsPanel` export to `settings-panels.tsx`. Use the existing shared infrastructure: `SettingsHeader` (with Radio/MessageSquare icon, "Remote Questions" title), `SettingsLoading`, `SettingsError`, `SettingsEmpty` ("No remote channel configured"). (2) Panel reads initial state from `useSettingsData()` hook (`data.preferences.remoteQuestions`). (3) On mount or when data lacks remote details, fetch `GET /api/remote-questions` for full status including env var availability. (4) Form fields: channel type as a `<select>` (Slack/Discord/Telegram), channel ID as text input with pattern validation feedback, timeout minutes as number input (1-30, default 5), poll interval seconds as number input (2-30, default 5). (5) Save button: POST to `/api/remote-questions` with `{ channel, channelId, timeoutMinutes, pollIntervalSeconds }`. Show success/error feedback. (6) Disconnect button (only when configured): DELETE to `/api/remote-questions`. Show confirmation or immediate disconnect with feedback. (7) Show env var status note: "SLACK_BOT_TOKEN is set ✓" or "SLACK_BOT_TOKEN not set — remote questions will not work until the bot token is configured" (without revealing the value). (8) Client-side validation: channel ID format checked against the same patterns — Slack: `/^[A-Z0-9]{9,12}$/`, Discord: `/^\d{17,20}$/`, Telegram: `/^-?\d{5,20}$/`. Show inline validation error if format is wrong. (9) In `command-surface.tsx`: import `RemoteQuestionsPanel` from `./settings-panels` and add it to the `gsd-prefs` case after `<BudgetPanel />`. (10) Skill note: load the `frontend-design` skill for high-quality UI. Follow the visual patterns of existing panels — consistent spacing, semantic tokens, same component primitives.
  - Verify: `npm run build:web-host` exits 0
  - Done when: `RemoteQuestionsPanel` renders in `/gsd prefs` settings surface, save/disconnect work against the API, build passes.

## Files Likely Touched

- `web/lib/settings-types.ts`
- `src/web/settings-service.ts`
- `web/app/api/remote-questions/route.ts` (new)
- `web/components/gsd/settings-panels.tsx`
- `web/components/gsd/command-surface.tsx`
