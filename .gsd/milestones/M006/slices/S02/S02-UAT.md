# S02: Project discovery, Projects view, and store switching — UAT

**Milestone:** M006
**Written:** 2026-03-17

## UAT Type

- UAT mode: mixed (artifact-driven for contract/build verification, live-runtime for browser verification)
- Why this mode is sufficient: S02 proves integration of discovery, store scoping, and UI. Contract tests cover detection logic; live browser verification covers the Projects view, store switching, and SSE lifecycle. Full end-to-end human-experience UAT is deferred to S03.

## Preconditions

- `npm run build` and `npm run build:web-host` both exit 0
- `npm run test:unit` passes 1215+ tests with 0 failures
- A dev root directory exists with at least 2 subdirectories containing different project types (e.g., one with `package.json` + `.git`, another with `Cargo.toml`)
- Web mode is running: `gsd --web` or equivalent dev server started

## Smoke Test

Navigate to the web UI, click the "Projects" tab in the NavRail — the Projects view should render (either project cards if a dev root is configured, or an informational message about configuring a dev root).

## Test Cases

### 1. Project Discovery Returns Correct Metadata

1. Create a temporary directory with 4 subdirectories:
   - `proj-a/` containing `package.json` and `.git/`
   - `proj-b/` containing `.gsd/`
   - `proj-c/` containing `Cargo.toml`
   - `proj-d/` empty
2. Also create `.hidden/` and `node_modules/` directories
3. Call `GET /api/projects?root=<tmpdir>`
4. **Expected:** JSON array of exactly 4 entries, sorted alphabetically (proj-a, proj-b, proj-c, proj-d). `.hidden` and `node_modules` excluded. proj-a has kind `brownfield` with signals `hasPackageJson: true, hasGit: true`. proj-b has kind `empty-gsd`. proj-c has kind `brownfield` with `hasCargo: true`. proj-d has kind `blank`.

### 2. Discovery Handles Nonexistent Path Gracefully

1. Call `GET /api/projects?root=/nonexistent/path/that/does/not/exist`
2. **Expected:** Returns HTTP 200 with empty JSON array `[]`, not an error

### 3. Discovery Rejects Missing Root Parameter

1. Call `GET /api/projects` (no `?root=` parameter)
2. **Expected:** Returns HTTP 400 with JSON body `{ "error": "..." }`

### 4. Preferences Round-Trip

1. Call `GET /api/preferences`
2. **Expected:** Returns `{}` or existing preferences object
3. Call `PUT /api/preferences` with body `{ "devRoot": "/tmp/test-dev-root", "lastActiveProject": "/tmp/test-dev-root/proj-a" }`
4. **Expected:** Returns HTTP 200
5. Call `GET /api/preferences` again
6. **Expected:** Returns `{ "devRoot": "/tmp/test-dev-root", "lastActiveProject": "/tmp/test-dev-root/proj-a" }`

### 5. Projects Tab Appears in NavRail

1. Open the web UI
2. Look at the left sidebar/NavRail
3. **Expected:** A "Projects" tab with a folder icon (FolderKanban) appears before the Dashboard entry

### 6. Projects View Shows Discovered Projects

1. Set dev root via `PUT /api/preferences` to a directory containing at least 2 projects
2. Navigate to the Projects tab
3. **Expected:** Project cards render showing:
   - Project name (directory name)
   - Project path
   - Detection kind badge (Active/Initialized/Existing/Legacy v1/Blank) with color coding
   - Signal chips (Git/Node.js/Rust/Go/Python) where applicable

### 7. Store Switching via Project Click

1. Ensure at least 2 projects are discovered and displayed
2. Click on a project card that is not the currently active project
3. **Expected:**
   - The clicked project shows an active indicator (pulse dot)
   - The view switches to the dashboard
   - The browser network tab shows new API requests with `?project=<encoded-path>` parameter
   - The EventSource reconnects with `?project=<encoded-path>`

### 8. Background Store Preserves State

1. Open Project A — let it load dashboard data
2. Switch to Project B by clicking its card
3. Switch back to Project A
4. **Expected:** Project A's dashboard data appears immediately (from cached store state). The SSE reconnection triggers a soft refresh but existing data is visible without a blank flash.

### 9. Single-Project Backward Compatibility

1. Do NOT configure a dev root (ensure `/api/preferences` returns `{}` or no `devRoot`)
2. Open the web UI normally
3. **Expected:** The workspace functions exactly as before — dashboard, terminal, roadmap all work. No `?project=` parameters appear in network requests. The Projects tab shows an informational message about configuring a dev root.

## Edge Cases

### No Dev Root Configured

1. Clear preferences (or start fresh)
2. Navigate to Projects tab
3. **Expected:** Informational message displayed (not an error), suggesting configuration. No crash.

### Dev Root With No Subdirectories

1. Set dev root to an empty directory
2. Navigate to Projects tab
3. **Expected:** Message indicating no projects found, showing the scanned path

### Dev Root Path Becomes Invalid

1. Set dev root to a path, then delete that directory
2. Navigate to Projects tab
3. **Expected:** Empty project list displayed (not a crash or unhandled error)

### URL Encoding With Special Characters

1. Create a project directory with spaces or special characters (e.g., `my project`)
2. Switch to it
3. **Expected:** `?project=` parameter is properly URL-encoded in all network requests. No broken API calls.

## Failure Signals

- NavRail missing "Projects" entry → sidebar.tsx not updated
- Projects view shows blank/error instead of cards → `/api/projects` or `/api/preferences` route broken
- Network requests missing `?project=` parameter after switching → `buildUrl()` not threading correctly
- Old project's data showing after switch → store manager not swapping active store
- SSE events from wrong project after switch → EventSource URL not updated
- Build failures in `npm run build` or `npm run build:web-host` → TypeScript or Next.js compilation errors
- Test regression → existing functionality broken by new code

## Requirements Proved By This UAT

- R020 (multi-project workspace) — partially: proves discovery, store isolation, and UI switching work. Full end-to-end proof (onboarding + context-aware launch) deferred to S03.

## Not Proven By This UAT

- Onboarding wizard dev root step (S03)
- Context-aware launch detection — `gsd --web` from inside vs outside a project (S03)
- Full end-to-end assembled flow — first-time user onboarding through to project switching (S03)
- Bridge eviction under memory pressure (deferred, no policy implemented)
- Real multi-bridge concurrent agent sessions (requires two running agents, beyond S02 scope)

## Notes for Tester

- The contract test (`npm run test:unit -- --test-name-pattern "project-discovery"`) covers detection logic exhaustively — run it first as a quick sanity check.
- Test cases 5-8 require a running web mode instance with a configured dev root. The easiest way is to point the dev root at your actual `~/Projects` or `~/Documents/dev` directory.
- Background store state (test case 8) is best verified by watching the browser network tab — on switch-back, you should see SSE reconnect but dashboard data should be visible immediately from the cached store.
- The "Active" kind badge in the Projects view indicates a project with a `.gsd/` directory and at least one session — your current GSD project should show this.
