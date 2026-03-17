# S03: Onboarding dev root step, context-aware launch, and final assembly — UAT

**Milestone:** M006
**Written:** 2026-03-17

## UAT Type

- UAT mode: mixed (artifact-driven for contract tests + live-runtime for browser flows)
- Why this mode is sufficient: Contract tests prove all edge cases of context-aware launch detection. Live-runtime verification covers the onboarding wizard flow, preference persistence, and project auto-initialization — all of which require a running server and browser.

## Preconditions

- `npm run build` and `npm run build:web-host` both exit 0
- All 1222 unit tests pass (`npm run test:unit`)
- A dev root directory exists with at least 2 subdirectories containing `.gsd/` folders (or create test projects: `mkdir -p ~/TestDevRoot/project-a/.gsd ~/TestDevRoot/project-b/.gsd`)
- No prior `~/.gsd/web-preferences.json` exists (delete if present for clean first-run test)

## Smoke Test

Run `gsd --web` from a fresh state (no web-preferences.json). The onboarding wizard should show 6 steps in the stepper, with "Root" as the 4th step label. After completing auth, the dev root step should appear with a text input and four suggestion chips.

## Test Cases

### 1. Onboarding dev root step renders correctly

1. Delete `~/.gsd/web-preferences.json` if it exists
2. Run `gsd --web` and complete the Welcome, Provider, and Auth steps
3. The Dev Root step (step 4/6) should appear
4. **Expected:** Step shows a FolderRoot icon, heading "Development Root", a text input, four suggestion chips (`~/Projects`, `~/Developer`, `~/Code`, `~/dev`), and Back/Skip/Continue buttons

### 2. Suggestion chips populate the input

1. On the Dev Root step, click the `~/Projects` suggestion chip
2. **Expected:** The text input is populated with the full expanded path (e.g., `/Users/<username>/Projects`)

### 3. Continue saves the dev root preference

1. Type or select a valid dev root path (e.g., `~/TestDevRoot`)
2. Click Continue
3. **Expected:** Continue button shows a loading spinner briefly, then advances to step 5 (Optional Integrations). `curl localhost:<port>/api/preferences` returns `{ "devRoot": "/Users/<username>/TestDevRoot" }`

### 4. Skip bypasses dev root without saving

1. Delete `~/.gsd/web-preferences.json`, restart `gsd --web`, reach the Dev Root step
2. Click Skip
3. **Expected:** Wizard advances to step 5 without saving. `curl localhost:<port>/api/preferences` returns `{}` or file doesn't exist

### 5. 6-step wizard navigation works correctly

1. From the Dev Root step (step 4), click Back
2. **Expected:** Returns to Auth step (step 3)
3. Advance back to Dev Root, then Continue with a path
4. **Expected:** Advances to Optional (step 5). From Optional, Back returns to Dev Root (step 4). Continue from Optional reaches Ready (step 6).

### 6. Context-aware launch from inside a project

1. Ensure `~/.gsd/web-preferences.json` contains `{ "devRoot": "/path/to/TestDevRoot" }`
2. `cd ~/TestDevRoot/project-a && gsd --web`
3. **Expected:** Web mode opens with the workspace scoped to `project-a`. The header/project indicator shows `project-a`'s path.

### 7. Context-aware launch from dev root itself

1. `cd ~/TestDevRoot && gsd --web`
2. **Expected:** Web mode opens with cwd as `~/TestDevRoot` (unchanged). The project picker / Projects view is accessible for selection.

### 8. Context-aware launch from outside dev root

1. `cd ~ && gsd --web`
2. **Expected:** Web mode opens with cwd as `~` (unchanged). Single-project behavior, no project switching attempted.

### 9. Projects view shows discovered projects after dev root set

1. Complete onboarding with dev root pointing to `~/TestDevRoot`
2. Click the Projects tab in the NavRail
3. **Expected:** Projects view shows `project-a` and `project-b` with appropriate type badges. Clicking a project switches the workspace context.

### 10. Project switch preserves background session

1. From the Projects view, click `project-a` — start or observe an agent session
2. Switch to `project-b`
3. Switch back to `project-a`
4. **Expected:** `project-a`'s agent session state is preserved — the terminal/transcript shows the same state as before the switch

## Edge Cases

### Stale dev root path

1. Set `web-preferences.json` to `{ "devRoot": "/nonexistent/path" }`
2. Run `gsd --web` from any directory
3. **Expected:** Falls back gracefully to the current cwd. No crash, no error dialog. Behaves as if no dev root is configured.

### Malformed preferences file

1. Write invalid JSON to `~/.gsd/web-preferences.json` (e.g., `{broken}`)
2. Run `gsd --web`
3. **Expected:** Falls back gracefully to cwd. No crash. The try/catch in `resolveContextAwareCwd` handles the parse error silently.

### Empty dev root input on Continue

1. On the Dev Root step, clear the input field and click Continue
2. **Expected:** Continue button is disabled or does nothing. The step does not advance with an empty path.

### Nested subdirectory resolution

1. Set dev root to `~/TestDevRoot`
2. `cd ~/TestDevRoot/project-a/src/lib && gsd --web`
3. **Expected:** Resolves to `~/TestDevRoot/project-a` (one level deep under dev root), not the deeply nested cwd.

### No dev root configured (backward compatibility)

1. Ensure `~/.gsd/web-preferences.json` does not exist or contains `{}`
2. Run `gsd --web` from any project directory
3. **Expected:** Single-project behavior unchanged. No project picker, no multi-project UI. Everything works exactly as before M006.

## Failure Signals

- Onboarding wizard shows only 5 steps (missing Dev Root step)
- Dev Root step doesn't appear after Auth step
- Continue button on dev root step doesn't call PUT /api/preferences (check Network tab)
- `gsd --web` from inside a project under dev root doesn't scope to that project
- Crash or error dialog on stale/malformed preferences file
- BootProjectInitializer doesn't register the launch project (check `data-testid="workspace-project-cwd"`)
- Projects view doesn't show projects after dev root is configured
- Background session lost after project switch round-trip
- Stepper labels don't show 6 entries (Welcome, Provider, Auth, Root, Extras, Ready)

## Requirements Proved By This UAT

- R020 (multi-project workspace) — Full end-to-end flow: onboarding with dev root → project discovery → project switching → background session preservation → context-aware launch

## Not Proven By This UAT

- Cross-project analytics (R021 — deferred to later milestone)
- Remote access scenarios (R022 — deferred to later milestone)
- Performance under many projects (>50 projects in dev root)
- Concurrent multi-tab usage with different active projects

## Notes for Tester

- The dev root text input accepts any path — there is no native folder picker due to browser security constraints. The suggestion chips are the primary UX for common paths.
- Context-aware launch is a CLI-side concern: the resolution happens before the server starts, so it's not inspectable in the browser's network tab. Check stderr output of the `gsd --web` process for `[gsd] Using project path:` messages.
- If testing the "no dev root" backward compatibility case, make sure to fully remove or empty `web-preferences.json` — a file with `{ "devRoot": "" }` may behave differently than a missing file.
- The project switch + session preservation test (case 10) requires an active or recent agent session. If no session exists, start a simple one (e.g., ask the agent "hello") before switching.
