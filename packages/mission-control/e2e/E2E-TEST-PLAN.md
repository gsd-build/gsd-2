# Mission Control — End-to-End Test Plan

**App:** GSD Mission Control (Bun + React + Tauri v2)
**Base URL:** `http://localhost:4000`
**Framework:** Playwright 1.58.2
**Last updated:** 2026-03-15

---

## Quick Start

```bash
# 1. Start the server (if not using auto-start)
bun run --cwd packages/mission-control dev

# 2. Run all E2E tests
npx playwright test

# 3. Run with visual UI
npx playwright test --ui

# 4. Run a single phase
npx playwright test e2e/specs/phase-17-permissions.spec.ts

# 5. Debug a failing test
npx playwright test e2e/specs/phase-11-stabilization.spec.ts --debug

# 6. View HTML report after run
npx playwright show-report e2e/reports/html
```

> Set `MC_NO_WEBSERVER=1` to skip Playwright's auto-start and use your own running server.

---

## Architecture

```
e2e/
├── fixtures/
│   └── auth.ts              — Tauri IPC mock + HTTP route stubs
├── specs/
│   ├── phase-11-stabilization.spec.ts
│   ├── phase-12-gsd2-compat.spec.ts
│   ├── phase-13-streaming.spec.ts
│   ├── phase-14-slice-integration.spec.ts
│   ├── phase-16-auth.spec.ts
│   ├── phase-17-permissions.spec.ts
│   ├── phase-18-builder-mode.spec.ts
│   ├── phase-19-workspace.spec.ts
│   └── phase-20-updater.spec.ts
├── reports/html/            — generated after run
└── E2E-TEST-PLAN.md         — this file

playwright.config.ts         — root config (webServer, baseURL, etc.)
```

### Auth Bypass Strategy

Mission Control guards every view behind Tauri IPC calls that only resolve
inside a real Tauri webview (`isTauri()` checks `"__TAURI__" in window`).

In Playwright we inject a mock **before** page scripts run:

```typescript
// e2e/fixtures/auth.ts
window.__TAURI__ = {};                          // makes isTauri() → true
window.__TAURI_INTERNALS__.invoke(cmd, ...) {   // handles Tauri IPC
  if (cmd === 'get_active_provider') return 'claude';
  if (cmd === 'check_and_refresh_token') return { needs_reauth: false, ... };
  if (cmd === 'check_for_updates') return null;
  ...
}
```

Additionally, `/api/trust-status` is route-stubbed to return `{ trusted: true }`,
so `TrustDialog` is skipped and the dashboard renders immediately.

**Three page fixtures are available:**

| Fixture              | Auth state       | Use for                              |
|----------------------|------------------|--------------------------------------|
| `authenticatedPage`  | Mocked Tauri     | Most tests — lands on dashboard      |
| `providerPickerPage` | No mock          | Phase 16 auth flow tests             |
| `builderPage`        | Mocked + builder | Phase 18 builder mode tests          |

---

## Phase Coverage

### Phase 11.1 — Pre-v2.0 Stabilization

**File:** `phase-11-stabilization.spec.ts`

| Req ID | Test Name | What it checks |
|--------|-----------|----------------|
| SC-1   | `page title and favicon link are present` | `<link rel="icon">` exists in DOM |
| SC-2   | `GSD logo SVG renders in sidebar` | `aside svg` visible |
| SC-2b  | `sidebar shows Projects label` | Text "Projects" in sidebar |
| SC-3   | `Settings view opens via sidebar gear icon` | Click gear → Settings heading visible |
| SC-4   | `WebSocket server is reachable on ws://localhost:4001` | Raw WS connect succeeds |
| SC-7   | `app mounts with no uncaught JS errors` | `page.on('pageerror')` finds no TypeErrors |

**Manual verification for SC-3 (skip_permissions):**
Open Settings, confirm there is NO "Skip permissions" toggle (that was a v1 feature).

---

### Phase 12 — GSD 2 Compatibility Pass

**File:** `phase-12-gsd2-compat.spec.ts`

| Req ID    | Test Name | What it checks |
|-----------|-----------|----------------|
| COMPAT-01 | `app loads without TypeError` | Zero TypeErrors on navigation |
| COMPAT-02 | `typing /gsd shows autocomplete without colon` | Dropdown items start with `/gsd` not `/gsd:` |
| COMPAT-03 | `Settings has model profile and budget fields` | Model profile label + budget number input |
| COMPAT-04 | `migration banner appears` | Soft assertion — banner shows for v1 projects |
| COMPAT-05 | `Settings does not show Skip permissions` | `getByText(/skip.?permissions/)` count = 0 |

**Manual verification for COMPAT-03:**
Settings → confirm selects for Research/Planning/Execution/Completion model, Budget ceiling input, and Skill discovery dropdown are present.

---

### Phase 13 — Session Streaming Hardening

**File:** `phase-13-streaming.spec.ts`

| Req ID    | Test Name | What it checks |
|-----------|-----------|----------------|
| STREAM-07 | `task status bar area present` | Chat view renders with input |
| STREAM-03 | `cost badge renders after WS cost_update` | Mock WS → badge appears |
| STREAM-04 | `sending a message renders it as a bubble` | Input → `getByText` sees message |
| STREAM-01 | `Escape key handled without crash` | Press Escape → app stays alive |
| STREAM-02 | `ConnectionStatus indicator visible` | Sidebar bottom area exists |

**Manual verification for STREAM-01 (full):**
Start `/gsd auto` in a real session → EXECUTING badge appears → press Escape → badge disappears, process stops, history intact.

**Manual verification for STREAM-03 (full):**
Let `/gsd auto` accumulate cost → badge turns cyan at any cost, amber at 80% budget, red at 95%.

---

### Phase 14 — Slice Integration

**File:** `phase-14-slice-integration.spec.ts`

| Req ID   | Test Name | What it checks |
|----------|-----------|----------------|
| SLICE-07 | `Milestone nav item is present` | Sidebar has "Milestone" text |
| SLICE-02 | `SliceAccordion renders with data-testid` | `[data-testid="slice-accordion"]` present |
| SLICE-01 | `four slice data-testids when data present` | Counts planned/in_progress/needs_review/complete |
| SLICE-05 | `InlineReadPanel opens with data-testid` | Click view_plan → `[data-testid="inline-read-panel"]` |

**Manual verification for SLICE-01 (full):**
Open a GSD project with all 4 slice states — all four cards are visible under the Milestone view.

**Manual verification for SLICE-03 (Steer input):**
Click the IN PROGRESS card Steer button → text input appears below the card → type a message → it sends to WebSocket.

**Manual verification for SLICE-04 (UAT merge gate):**
Click NEEDS REVIEW card → check all UAT items → "Merge to main" button becomes enabled.

---

### Phase 16 — OAuth + Keychain

**File:** `phase-16-auth.spec.ts`

> These tests use `providerPickerPage` — no Tauri mock, shows real auth screen.

| Req ID  | Test Name | What it checks |
|---------|-----------|----------------|
| AUTH-01 | `provider picker shows 4 cards` | Claude Max, GitHub Copilot, OpenRouter visible |
| AUTH-02 | `API key form has masked input` | `input[type="password"]` visible after selecting OpenRouter |
| AUTH-06 | (same test) | Input is type=password (masked) |
| AUTH-03 | `picker NOT shown with mocked provider` | `authenticatedPage` → no "Claude Max" provider card |
| AUTH-04 | `Settings shows Provider section` | "provider" or "API key" text in Settings |
| AUTH-05 | `OAuth provider click triggers flow UI` | Click Claude Max → no crash; spinner/pending state optional |

**Manual verification for AUTH-02 full flow:**
Click OpenRouter → paste API key → click Save → main dashboard loads.

**Manual verification for AUTH-04 full:**
Settings → Provider section shows: active provider name, green/red status dot, last-refreshed timestamp, Change provider button.

---

### Phase 17 — Permission Model

**File:** `phase-17-permissions.spec.ts`

| Req ID  | Test Name | What it checks |
|---------|-----------|----------------|
| PERM-01 | `TrustDialog appears when trusted=false` | `/api/trust-status → false` → dialog text visible |
| PERM-02 | `clicking confirm dismisses TrustDialog` | Click confirm → sidebar renders |
| PERM-03 | `boundary violation banner structure` | Soft: checks no crash; alert count logged |
| PERM-04 | `Advanced permissions: gitPush default=OFF` | Checkbox for gitPush is unchecked |

**Manual verification for PERM-03 (full):**
Send a WebSocket message `{ type: "boundary_violation", path: "/etc/passwd" }` →
red `role="alert"` banner appears at top of app with text "The operation was blocked." →
clicking Dismiss makes it disappear.

---

### Phase 18 — Builder Mode

**File:** `phase-18-builder-mode.spec.ts`

| Req ID     | Test Name | What it checks |
|------------|-----------|----------------|
| BUILDER-01 | `switching to Builder mode via settings` | Mode toggle found and changed |
| BUILDER-01b| `app renders correctly in Builder mode` | `builderPage` fixture → sidebar visible |
| BUILDER-03 | `chat input has Builder-mode placeholder` | Placeholder string is non-empty |
| BUILDER-03b| `/ does not show /gsd autocomplete in Builder` | Dropdown not visible after typing `/` |
| BUILDER-05 | `Ctrl+Shift+P blocked in Builder mode` | Command palette not visible after shortcut |
| BUILDER-04 | `routing badge appears after natural language send` | `/api/classify-intent` stubbed → badge shown |
| BUILDER-07 | `Builder mode persists after navigation` | Navigate away and back → no crash |

**Manual verification for BUILDER-02 (relabeling):**
Switch to Builder mode → Milestones view → verify: PLANNED→Backlog, IN PROGRESS→Building, NEEDS REVIEW→QA, COMPLETE→Shipped (or equivalent relabeling per implementation).

**Manual verification for BUILDER-06 (slice action labels):**
In Builder mode, slice card action buttons use Builder vocabulary (e.g. "Build" instead of "Start", "Review" instead of "Check").

---

### Phase 19 — Project Workspace

**File:** `phase-19-workspace.spec.ts`

| Req ID       | Test Name | What it checks |
|--------------|-----------|----------------|
| WORKSPACE-01 | `workspace path API returns path` | `GET /api/workspace/path` → non-empty string |
| WORKSPACE-02 | `home screen renders when no project` | App renders something (not blank) |
| WORKSPACE-02b| `Home button in sidebar` | `aria-label="Home"` button clickable |
| WORKSPACE-03 | `project cards render with Resume button` | Stub `/api/projects/recent` → card + Resume visible |
| WORKSPACE-04 | `tab bar hidden with <2 projects` | No tablist with 0-1 project open |
| WORKSPACE-05 | `PATCH /api/projects/recent/archive exists` | Returns 200/404/400 (not 405) |

**Manual verification for WORKSPACE-03 (full):**
Open 2+ projects → cards show: project name, "N hours ago" timestamp, active milestone name, progress bar, Resume button, ··· menu with Archive / Open in Finder / Remove from list.

**Manual verification for WORKSPACE-04 (full tab bar):**
Open 2+ projects → tab bar appears above the main content area → active tab has amber dot → clicking inactive tab switches project.

---

### Phase 20 — Installer + Distribution

**File:** `phase-20-updater.spec.ts`

| Req ID  | Test Name | What it checks |
|---------|-----------|----------------|
| DIST-01 | `release.yml has matrix strategy` | File exists with ubuntu/windows/macos + tauri-action |
| DIST-01b| `pages.yml exists` | File references docs + pages |
| DIST-02 | `useAppUpdater does not crash` | Sidebar renders after updater init |
| DIST-03 | `update banner renders when update ready` | Mock `check_for_updates` returns version → banner text |
| DIST-04 | `docs/index.html has download CTAs` | File contains GSD, windows/macos/linux references |
| DIST-04b| `Bun server returns HTML` | `GET /` → 200 text/html |

**Manual verification for DIST-03 (full):**
Run the real Tauri app → trigger an update check → "Update ready — restart to apply" appears in sidebar bottom in cyan → clicking it installs and restarts.

---

## Resuming After Interruption

If the test session is interrupted, resume from exactly where you left off:

```bash
# Check which tests failed last run
npx playwright show-report e2e/reports/html

# Re-run only failed tests
npx playwright test --last-failed

# Re-run a specific phase
npx playwright test e2e/specs/phase-17-permissions.spec.ts

# Re-run with full trace for debugging
npx playwright test --trace on
```

All test files are fully independent — each sets up its own mocks and page state.
No shared state between spec files.

---

## Known Limitations

| Constraint | Affected tests | Reason |
|-----------|----------------|--------|
| Phase 15 (Tauri Shell) | None written | Tauri native window lifecycle can't be tested in Playwright browser context |
| Streaming STREAM-01 full | Manual only | Requires live `gsd` process with SIGINT handling |
| Slice SLICE-03/04 | Manual only | Requires real `.gsd/` project with slice state |
| Phase 20 DIST-03 | Soft assertion | `useAppUpdater` may not fire `updateReady` without real Tauri plugin metadata |
| Phase 16 AUTH-05 | Soft assertion | OAuth URL open is system-level — can't be verified in headless browser |

---

## Adding New Tests

1. Add a new spec file to `e2e/specs/phase-NN-name.spec.ts`
2. Import fixtures: `import { test, expect } from "../fixtures/auth";`
3. Use `authenticatedPage` for most tests, `providerPickerPage` for auth screens
4. Add the new phase to this document under **Phase Coverage**
5. Run: `npx playwright test e2e/specs/phase-NN-name.spec.ts`
