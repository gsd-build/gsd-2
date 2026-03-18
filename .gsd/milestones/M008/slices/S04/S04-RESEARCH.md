# S04 (Remote Questions Settings) — Research

**Date:** 2026-03-18

## Summary

This slice adds a `RemoteQuestionsPanel` to the web settings surface so users can view and edit Slack/Discord/Telegram remote question configuration without the TUI. The types, validation, and read/write logic already exist — `RemoteQuestionsConfig` in `preferences.ts`, `saveRemoteQuestionsConfig()` / `removeRemoteQuestionsConfig()` in `remote-command.ts`, and `resolveRemoteConfig()` / `getRemoteConfigStatus()` in `config.ts`. The web settings surface already has three read-only panels (`PrefsPanel`, `ModelRoutingPanel`, `BudgetPanel`) rendered in `command-surface.tsx` under the `gsd-prefs` case. The new panel needs both read and write capability.

The read path is handled by extending the existing `collectSettingsData()` child script to pass through `remote_questions` from loaded preferences. The write path needs a new `/api/remote-questions` API route that performs YAML frontmatter manipulation on `~/.gsd/preferences.md` — the same pattern used by `saveRemoteQuestionsConfig()` in `remote-command.ts`. The YAML manipulation is simple enough (~20 lines) to replicate directly in the API route, avoiding the child-process overhead required when importing from extension modules (per the Turbopack `.js→.ts` constraint in KNOWLEDGE).

## Recommendation

1. Add `remoteQuestions` field to `SettingsPreferencesData` in `settings-types.ts` and expose it from the existing `collectSettingsData()` child script (one line addition).
2. Create `/api/remote-questions/route.ts` with GET (current config + status) and POST (save config) / DELETE (remove config). Do YAML frontmatter read-modify-write directly in the route — no child-process needed since the manipulation is plain `fs` + regex.
3. Add `RemoteQuestionsPanel` to `settings-panels.tsx` with form fields for channel type (select), channel ID (text input), timeout minutes (number input, 1-30), poll interval seconds (number input, 2-30). Show current status and a save/disconnect button.
4. Wire `RemoteQuestionsPanel` into `command-surface.tsx` under the `gsd-prefs` case alongside existing panels.

## Implementation Landscape

### Key Files

- `web/lib/settings-types.ts` — Add `remoteQuestions` to `SettingsPreferencesData` interface: `{ channel?: "slack" | "discord" | "telegram"; channelId?: string; timeoutMinutes?: number; pollIntervalSeconds?: number }`.
- `src/web/settings-service.ts` — Add one line to the child script that exposes `p.remote_questions` as `remoteQuestions` in the preferences payload (lines ~68-87, the child script string array).
- `web/app/api/remote-questions/route.ts` — New. GET returns current remote_questions config (read from `~/.gsd/preferences.md` YAML frontmatter). POST saves new config (channel, channel_id, timeout_minutes, poll_interval_seconds). DELETE removes the `remote_questions` block. Uses the same YAML frontmatter regex pattern as `saveRemoteQuestionsConfig()` in `remote-command.ts` (line ~284).
- `web/components/gsd/settings-panels.tsx` — Add `RemoteQuestionsPanel` export. Uses the existing `SettingsHeader`, `Pill`, `KvRow`, `SettingsEmpty` shared infrastructure. Form fields: channel type dropdown, channel ID text input, timeout number input, poll interval number input. Save and Disconnect buttons.
- `web/components/gsd/command-surface.tsx` — Import `RemoteQuestionsPanel` from settings-panels. Add it to the `gsd-prefs` case (line ~2032) after the existing three panels. Also render it solo for the `gsd-remote` surface case if one exists (check parity dispatch).
- `src/resources/extensions/gsd/preferences.ts` — Reference only (no changes). `RemoteQuestionsConfig` interface (line 141): `{ channel: "slack"|"discord"|"telegram"; channel_id: string|number; timeout_minutes?: number; poll_interval_seconds?: number }`.
- `src/resources/extensions/remote-questions/config.ts` — Reference only. `resolveRemoteConfig()` for validation logic, `CHANNEL_ID_PATTERNS` for client-side validation, clamp ranges (timeout 1-30, poll 2-30).
- `src/resources/extensions/remote-questions/remote-command.ts` — Reference only. `saveRemoteQuestionsConfig()` (line ~275) and `removeRemoteQuestionsConfig()` (line ~300) show the YAML frontmatter manipulation pattern to replicate in the API route.

### Build Order

1. **Types first** — Add `remoteQuestions` to `SettingsPreferencesData` in `settings-types.ts` and update the child script in `settings-service.ts`. This unblocks the read path.
2. **API route** — Create `/api/remote-questions/route.ts` with GET/POST/DELETE. The YAML frontmatter manipulation is self-contained; uses `getGlobalGSDPreferencesPath()` pattern (resolve to `~/.gsd/preferences.md`). Validate inputs server-side: channel must be slack/discord/telegram, channel_id must match `CHANNEL_ID_PATTERNS`, timeout/poll clamped to valid ranges.
3. **Panel UI** — Add `RemoteQuestionsPanel` to `settings-panels.tsx`. Read from existing `useSettingsData()` hook (remoteQuestions field). Write via fetch to `/api/remote-questions`. Include client-side validation feedback.
4. **Wire into command surface** — Import and render in `command-surface.tsx`.

### Verification Approach

- `npm run build:web-host` exits 0 (build contract).
- Start web mode, navigate to settings (`/gsd prefs`), confirm `RemoteQuestionsPanel` renders with empty state ("No remote channel configured").
- Fill in channel type + channel ID + save → verify `~/.gsd/preferences.md` contains the `remote_questions` YAML block.
- Refresh settings → confirm saved values appear in the panel.
- Click disconnect → verify the `remote_questions` block is removed from preferences.md.
- Re-read settings → confirm panel shows empty state again.

## Constraints

- **Turbopack .js→.ts resolution**: Cannot import `saveRemoteQuestionsConfig` or `resolveRemoteConfig` directly from extension modules in API routes. The API route must do its own YAML manipulation or use the child-process pattern. Direct YAML manipulation is simpler for this case.
- **Preferences path**: Must use `~/.gsd/preferences.md` (the global path). The `getGlobalGSDPreferencesPath()` resolves to `join(homedir(), ".gsd", "preferences.md")` — replicate this in the API route.
- **Channel ID validation**: Must use the same patterns as `config.ts` — Slack: `/^[A-Z0-9]{9,12}$/`, Discord: `/^\d{17,20}$/`, Telegram: `/^-?\d{5,20}$/`.
- **No token handling in web UI**: The TUI `handleSetupSlack/Discord/Telegram` flows include bot token prompting and validation. The web panel handles ONLY the preferences config (channel type, channel ID, timeout, poll interval) — NOT the bot token. Tokens are set via `secure_env_collect` or the TUI setup flow. The panel should show a status note about whether the required env var is set (without revealing the value).
