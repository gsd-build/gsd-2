# GSD Mission Control — Milestone 2 Execution Prompt
## For: /gsd new-milestone or paste at session start

---

## Project Context

You are continuing development of **GSD Mission Control**, a Bun-powered dashboard UI layer for the GSD 2 (`gsd-pi`) CLI tool. Milestone 1 (Phases 1–11) is fully complete. The web app runs on `localhost:4000` and includes:

- Sidebar + tabbed single-column layout (Chat, Milestones, History, Assets, Settings)
- Bun file watcher + WebSocket diff pipeline for real-time state
- Child process integration streaming to a `gsd` process
- Discuss mode (XML stream interceptor + question cards)
- Review mode (6-pillar scoring)
- Live preview panel (Bun reverse proxy, 4 viewports)
- Multi-session support with git worktrees (4 parallel)
- Settings panel with skills, sub-agents, model profiles, plugins
- Assets panel with drag-and-drop upload
- History panel showing git log
- Command palette + keyboard shortcuts
- Native OS file picker with GSD project detection (shows GSD badge on projects with `.gsd/` directory)

**Current state of GSD compatibility:** The app was built targeting GSD v1 (`.planning/` directory, Claude Code slash command syntax `/gsd:discuss-phase` etc.). GSD 2 has shipped and uses a different directory (`.gsd/`), different CLI (`gsd` not `claude`), different command syntax (`/gsd`, `/gsd auto`, `/gsd discuss`), and different state file schema. These must be corrected before new features are built.

**Design system (established, do not change):**
- Background: `#0F1419` (dark navy)
- Surface: `#131C2B`
- Elevated: `#1A2332`
- Border: `#1E2D3D`
- Accent cyan: `#5BC8F0` — active states, CTAs, logo only
- Green: `#22C55E` — complete/verified
- Amber: `#F59E0B` — active/executing
- Red: `#EF4444` — error/blocked
- Purple: `#A78BFA` — COMMAND tier badges
- Fonts: Share Tech Mono (display), JetBrains Mono (body)
- Spacing: 8-point grid strictly

---

## Milestone 2 Phases

### PHASE 12: GSD 2 Compatibility Pass
**Goal:** Update all M1 code that references GSD v1 conventions to GSD 2.

**Must-haves:**

FILE WATCHER — update directory target:
- All Bun.watch() calls must watch `.gsd/` not `.planning/`
- State deriver must read GSD 2 file schema:
  - `.gsd/STATE.md` → active milestone, slice, task, auto mode status, cost, tokens
  - `.gsd/M001-ROADMAP.md` → milestone structure, slice checkboxes, risk levels
  - `.gsd/S01-PLAN.md` → slice task decomposition, must-haves, cost estimate
  - `.gsd/T01-SUMMARY.md` → completed task output, YAML frontmatter
  - `.gsd/DECISIONS.md` → architectural decision register
  - `.gsd/preferences.md` → model config, budget ceiling, skill_discovery setting
  - `.gsd/PROJECT.md` → living project description
  - `.gsd/M001-CONTEXT.md` → user decisions from discuss phase
- File naming patterns are dynamic: `M001`, `M002` for milestones; `S01`, `S02` for slices; `T01`, `T02` for tasks
- State deriver must handle all milestone/slice/task indices dynamically, not hardcoded

COMMAND AUTOCOMPLETE — update to GSD 2 command registry:
```
/gsd              Guided mode — reads project state, shows what's next
/gsd auto         Autonomous mode — research, plan, execute, commit, repeat
/gsd stop         Stop auto mode gracefully
/gsd discuss      Discuss architecture and decisions
/gsd status       Progress dashboard
/gsd queue        Queue future milestones
/gsd prefs        Model selection, timeouts, budget ceiling
/gsd migrate      Migrate v1 .planning/ directory to .gsd/ format
/gsd doctor       Validate .gsd/ integrity, find and fix issues
```
Remove all `/gsd:` prefixed v1 commands from autocomplete and command palette.

COMMAND PALETTE — update all GSD command entries to GSD 2 syntax. Remove v1 entries. Update descriptions to match GSD 2 behaviour.

PROCESS SPAWNING — update child process target:
- Spawn `gsd` not `claude` or `claude-code`
- GSD 2 interactive session starts with `gsd` command
- Streaming stdout from `gsd` process, same architecture as M1 but correct binary
- GSD 2 uses Pi SDK which outputs structured stream — ensure parser handles this

MIGRATION HELPER — surface in UI:
- If file watcher detects `.planning/` directory but no `.gsd/` directory, show an inline banner:
  ```
  This project uses GSD v1. Run /gsd migrate to upgrade it.
  [ Run migration ]
  ```
- "Run migration" sends `/gsd migrate` to the active `gsd` session

SETTINGS PANEL — update:
- Model options to reflect GSD 2's per-phase model selection (research, planning, execution, completion)
- Remove any v1-specific settings
- Add budget ceiling field (maps to `budget_ceiling` in `~/.gsd/preferences.md`)
- Add skill_discovery toggle (auto / suggest / off)

---

### PHASE 13: Session Streaming Hardening
**Goal:** Make the streaming connection between Mission Control and the `gsd` process production-quality. This is the most critical integration layer — everything else depends on it.

**Must-haves:**

STREAM PARSER — GSD 2 / Pi SDK output handling:
- Pi SDK outputs structured events. Parser must handle:
  - Plain text output (display in chat as assistant message)
  - Tool use blocks (display as structured event cards, not raw JSON)
  - Tool result blocks (display as result cards)
  - Phase transition markers (Research → Plan → Execute → Complete)
  - Cost/token updates (update the cost display in real time)
  - Stuck detection messages (surface as warning card)
  - Timeout messages (surface as amber warning with action)
  - Auto mode phase announcements (update the milestone/slice progress display)
- Parser must be resilient: malformed chunks must not crash the stream, log and continue

PROCESS LIFECYCLE:
- Clean spawn with correct working directory (the open project root)
- Graceful shutdown: send interrupt signal, wait for process to finish current operation, then kill
- Crash recovery: if `gsd` process dies unexpectedly, show reconnect option, preserve chat history, attempt restart with session recovery
- Orphan prevention: process registry must track all spawned `gsd` processes and kill on app close
- Multi-session: each chat tab has its own `gsd` process (already architected in Phase 6.3, verify this works correctly with GSD 2)

RECONNECTION:
- WebSocket disconnect: exponential backoff reconnect, 1s → 2s → 4s → 8s → max 30s
- On reconnect: re-derive full state from `.gsd/` files, do not rely on in-memory state
- Stale state detection: if `.gsd/STATE.md` modified time is newer than last WebSocket message, force full re-derive

COST + TOKEN DISPLAY:
- GSD 2 tracks per-unit cost. Surface in UI:
  - Active session: running cost badge in chat header (e.g. `$0.18`)
  - Per-slice: total cost on slice card
  - Milestone total: sum across all slices in the milestone view
- Budget ceiling: if `budget_ceiling` is set in preferences and running cost approaches it, show amber warning at 80%, red at 95%

AUTO MODE INDICATORS:
- When `/gsd auto` is running, show a persistent EXECUTING indicator in the chat header
- Phase announcements from GSD 2 (Research / Plan / Execute / Complete) update the active slice card in the Milestones view in real time
- Pressing Escape in the chat input while auto is running sends the escape signal to the `gsd` process (GSD 2 supports this — conversation preserved, auto mode paused)

---

### PHASE 14: Slice Integration in Milestones View
**Goal:** Convert the Milestones view from a read-only progress display into an interactive control surface. Slices are the atomic unit of project control — the right granularity for human decisions.

**Design principle:** Slices live inside the Milestones view as an accordion, not as a separate navigation item. The currently executing slice is auto-expanded. Each slice card has state-specific actions. This is what gives slices meaningful function rather than being decorative progress indicators.

**Must-haves:**

FOUR SLICE STATES — each renders a different card:

State 1 — PLANNED (not started):
```
S03  User Authentication                           PLANNED
─────────────────────────────────────────────────────────
3 tasks planned · est. ~$0.40 · branch: gsd/M001/S03

Depends on: S01 Data model ✓, S02 API layer ✓

[ Review plan ]                    [ Start this slice ]
```
- "Review plan" opens `S03-PLAN.md` inline as a readable panel (task list, must-haves, file targets)
- "Start this slice" sends `/gsd auto` to the active session with this slice targeted
- Dependencies shown with completion status — "Start this slice" is disabled if dependencies are incomplete

State 2 — IN PROGRESS (currently executing):
```
S03  User Authentication                        ● EXECUTING
─────────────────────────────────────────────────────────
Task 2 of 4: JWT refresh token handler
████████░░░░░░░░░░░░  50%

Branch: gsd/M001/S03 · 3 commits · $0.18 so far

[ Pause ]          [ View task ]          [ Steer ]
```
- Progress bar shows task position within slice
- "Pause" sends escape signal to `gsd` process
- "View task" opens current `T02-PLAN.md` inline
- "Steer" opens a focused chat input that injects a mid-slice direction message without stopping auto mode
- This card auto-expands and pulses amber when execution is active

State 3 — NEEDS REVIEW (complete, UAT pending):
```
S03  User Authentication               ⚠ NEEDS YOUR REVIEW
─────────────────────────────────────────────────────────
4 tasks complete · Total cost: $0.43
Branch ready: gsd/M001/S03 · squash merge pending

UAT checklist: 0 of 5 verified

[ Run UAT checklist ]                   [ Merge to main ]
```
- "Run UAT checklist" expands the UAT items from `S03-UAT.md` as an interactive checklist
- Each UAT item is a checkbox the user ticks after manually verifying
- "Merge to main" is disabled until all UAT items are checked
- When enabled, "Merge to main" sends the git squash merge command through the `gsd` session
- This is the human checkpoint — the moment the non-technical user verifies before code lands on main

State 4 — COMPLETE (merged):
```
S03  User Authentication                          ✓ COMPLETE
─────────────────────────────────────────────────────────
Merged · 1 commit on main · $0.43 total
feat(M001/S03): user authentication and session management

[ View diff ]                         [ View UAT results ]
```
- "View diff" opens the squash commit diff inline
- "View UAT results" shows the completed checklist

UAT CHECKLIST INTERACTION:
- Each item from `S03-UAT.md` renders as a checkbox row
- Item text is the plain-language test description from the UAT script
- User checks each item as they manually verify in the running preview
- Progress shown: "3 of 5 verified"
- Merge button activates only at 5 of 5
- Checked state persists in `.gsd/` (write a `.gsd/S03-UAT-RESULTS.md` file on completion)

DATA READS REQUIRED:
- `S03-PLAN.md` — task list and cost estimate (already partially wired in Phase 5, extend)
- `S03-UAT.md` — UAT checklist items (new read)
- `STATE.md` — which slice is currently executing (already wired)
- Git branch list — `git branch --list 'gsd/M001/*'` to detect branches and commit counts
- Git log on slice branch — commit count and latest commit message

MILESTONE HEADER:
- Total cost across all slices in the milestone
- Budget ceiling indicator if set
- "Start next slice" shortcut button if no slice is currently executing

---

### PHASE 15: Tauri Shell + Process Management
**Goal:** Wrap the M1 web app in a Tauri 2 native window. No changes to React app. Rust backend is intentionally thin — spawn Bun, handle OAuth callback URL scheme, manage window lifecycle.

**Must-haves:**

TAURI 2 SETUP:
- `src-tauri/` directory alongside existing `apps/web/`
- `tauri.conf.json` configured with:
  - `productName: "GSD Mission Control"`
  - `identifier: "com.mzansiagentive.gsd-mission-control"`
  - Window: `width: 1280, height: 800, minWidth: 1024, minHeight: 640`
  - Custom protocol: `gsd://` registered for OAuth callbacks
  - `devUrl: "http://localhost:4000"` for development
  - CSP configured to allow localhost WebSocket connections

BUN PROCESS MANAGEMENT (Rust):
```rust
// On app start: spawn Bun server
// Store handle in managed state
// On window close: kill Bun process cleanly
// On Bun crash: emit event to frontend, show reconnect UI
```

DEPENDENCY CHECKS (on startup, before showing any UI):
- Check `which bun` (macOS/Linux) or `where bun` (Windows)
- Check `which gsd` (macOS/Linux) or `where gsd` (Windows)  
- If either missing: show pre-dashboard dependency screen with install instructions
- Dependency screen is NOT the main app — it is a separate simple HTML page served by Tauri directly
- Install instructions are plain language, one-click links, no terminal instructions shown to non-technical users (developer mode can show the commands)

WINDOW BEHAVIOUR:
- `window-state` plugin: remember and restore last window size and position
- Frameless: false for M2 (use OS native title bar). Custom title bar is M3.
- Single window only in M2
- macOS: `titleBarStyle: "overlay"` optional, keep native for M2
- Windows: standard window chrome

TAURI IPC COMMANDS (TypeScript → Rust):
```
open_folder_dialog()     → native folder picker (replaces the custom React file browser)
get_credential(key)      → read from OS keychain
set_credential(key, val) → write to OS keychain  
delete_credential(key)   → remove from OS keychain
open_external(url)       → open URL in system browser (for OAuth)
get_platform()           → "macos" | "windows" | "linux"
restart_bun()            → kill and respawn Bun process
```

BUILD PIPELINE:
- `package.json` script: `"tauri:dev": "tauri dev"`, `"tauri:build": "tauri build"`
- Tauri dev starts Bun server first, then opens the native window
- `tauri build` produces platform-appropriate installer

---

### PHASE 16: OAuth + Keychain + Provider Picker
**Goal:** Replace manual API key configuration with a first-launch provider picker that handles OAuth for Claude Max and GitHub Copilot, and secure keychain storage for all credentials.

**Must-haves:**

FIRST-LAUNCH DETECTION:
- On startup, check OS keychain for `gsd-mission-control/active_provider`
- If absent: show provider picker screen before any project UI
- If present: skip directly to project home screen
- Provider picker only shown once, ever (unless user clicks "Change provider" in Settings)

PROVIDER PICKER SCREEN:
- Four options: Claude Max / Anthropic, GitHub Copilot, OpenRouter, API Key (any provider)
- Selected option highlighted in GSD cyan
- "Connect and start building" CTA
- No "skip" option — a provider is required to use the app

OAUTH FLOW (Claude Max + GitHub Copilot):
1. User selects provider, clicks Connect
2. Call Tauri IPC `open_external(authUrl)` — opens system browser
3. User authenticates in browser (existing sessions work automatically)
4. Provider redirects to `gsd://oauth/callback?code=...&state=...`
5. Tauri intercepts via custom URL scheme handler
6. Rust backend: PKCE exchange, get access token + refresh token
7. Store in OS keychain:
   - `gsd-mission-control/anthropic_access_token`
   - `gsd-mission-control/anthropic_refresh_token`  
   - `gsd-mission-control/active_provider` = "anthropic"
8. Write `~/.gsd/auth.json` in GSD 2 format so `gsd` CLI picks up credentials
9. Dismiss provider picker, show project home screen

API KEY FLOW (OpenRouter + direct keys):
1. User selects API Key option
2. Masked text input appears: provider name dropdown + key field
3. On confirm: store in keychain as `gsd-mission-control/{provider}_api_key`
4. Write `~/.gsd/auth.json` accordingly
5. Proceed to project home screen

TOKEN REFRESH (background, Rust):
- On app start: check token expiry from keychain metadata
- If expires within 5 minutes: refresh silently before showing project UI
- If refresh fails: show re-auth prompt with the OAuth flow
- User never sees a mid-session auth failure

SETTINGS INTEGRATION:
- Settings panel "Provider" section shows current active provider
- "Change provider" button clears keychain and shows provider picker
- Individual provider entries show connection status and last-refreshed timestamp

GSD 2 AUTH.JSON FORMAT:
```json
{
  "provider": "anthropic",
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": "2026-03-12T18:00:00Z"
}
```
Write this file whenever credentials change so `gsd` CLI works independently of Mission Control.

---

### PHASE 17: Permission Model + Trust Dialog
**Goal:** Replace the raw `skip permissions` toggle in Settings with a principled permission model that is honest with users about what they are granting, grounded in GSD 2's planning layer as the real safeguard.

**Design principle:** GSD's planning layer IS the permission system. Every task declares its target files upfront. Boundary contracts define what each slice produces and consumes. The project directory is set at session init. Every task has a git checkpoint. These structural safeguards substitute for runtime permission prompts. The trust dialog communicates this to users in plain language rather than exposing `--dangerously-skip-permissions` as a raw toggle.

**Must-haves:**

REMOVE FROM SETTINGS:
- Remove the raw "Skip permissions" toggle that currently exists in the Settings panel Claude Code Options section
- Replace with a link: "Manage build permissions →" that opens the trust dialog

TRUST DIALOG — shown once per new project, not per app launch:
- Triggered when a project is opened for the first time in Mission Control
- Store "trust granted" flag in `.gsd/.mission-control-trust` file
- Dialog content (plain language, not technical):

```
Before we start building

Mission Control works by letting the AI build automatically
inside your project. Here is exactly what that means.

The AI will:
✓  Work only inside your project folder
   Files outside this folder are never touched.

✓  Create and edit files automatically  
   Your code is written without interruption.
   You review when each task finishes.

✓  Install packages when your project needs them
   npm, pip, and similar tools run automatically.

✓  Save your progress automatically
   Every task creates a checkpoint you can roll back to.

The AI will never:
✗  Access files outside your project folder
✗  Push to GitHub without your confirmation
✗  Delete your project or git history

[ I understand, start building ]

Advanced permission settings →
```

HARD BOUNDARY ENFORCEMENT (Bun process layer):
- Intercept stdout from `gsd` process before it reaches the UI
- Parse for file operation patterns targeting paths outside the project root
- If detected: block the operation, emit a `BOUNDARY_VIOLATION` event to the frontend
- Frontend shows: "The AI tried to access a file outside your project. This has been blocked."
- Log the attempted path for user inspection
- This runs regardless of permission settings — it is not a toggle

ADVANCED PERMISSION SETTINGS (for developers):
Plain-language toggles mapping to GSD 2 / Pi SDK flags:

| Toggle | Default | Note |
|--------|---------|------|
| File operations inside project | ON (locked) | Cannot be disabled |
| Package installation | ON | npm, pip, cargo etc. |
| Shell and build commands | ON | Test runners, build scripts |
| Git commits and checkpoints | ON | Automatic per-task |
| Git push to remote | OFF | Always requires explicit action |
| Ask before each operation | OFF | Debug mode — disables auto flow |

Toggling "Ask before each operation" ON shows a warning:
"This will pause GSD after every file operation. Auto mode will not work correctly. Use this for debugging only."

---

### PHASE 18: Lovable-User Abstraction Layer
**Goal:** Add a Builder mode on top of all existing Developer mode UI. Non-technical users never see GSD command syntax, slash commands, slice/task terminology, or context budget numbers. The underlying system is identical — only the surface changes.

**Design principle:** Two modes, one toggle in Settings. Developer mode is what exists today. Builder mode is a vocabulary and routing layer on top. No features are removed or disabled — they are re-labelled and re-routed.

**Must-haves:**

MODE TOGGLE:
- Settings panel: "Interface mode" — Developer / Builder
- Default: Developer (preserves all existing M1 behaviour for current users)
- Switching modes does not restart the session

BUILDER MODE — VOCABULARY CHANGES:
| Developer mode term | Builder mode term |
|---------------------|-------------------|
| Milestone | Version |
| Slice | Feature |
| Task | Step |
| Must-haves | Goals |
| UAT | Testing |
| Boundary map | (hidden entirely) |
| Context budget | (hidden entirely) |
| Token count | (hidden entirely) |
| Model name | (hidden entirely) |
| Branch name | (shown as "Feature branch: Authentication") |

BUILDER MODE — CHAT INPUT:
- Placeholder changes from "Type / for commands..." to "What do you want to build or change?"
- Slash command autocomplete is hidden (not removed — developer mode still works)
- Command palette keyboard shortcut is hidden

INTENT CLASSIFIER:
- Every Builder mode message passes through a lightweight Claude API call (same credentials already stored)
- System prompt: current GSD state from STATE.md injected as context
- Returns one of: `GSD_COMMAND`, `PHASE_QUESTION`, `GENERAL_CODING`, `UI_PHASE_GATE`
- Routing:
  - `GSD_COMMAND` → inject appropriate `/gsd` command, send to process
  - `PHASE_QUESTION` → inject DECISIONS.md + CONTEXT.md, send to process
  - `GENERAL_CODING` → send directly to process with task context
  - `UI_PHASE_GATE` → intercept, show design contract prompt
- Small badge shown after routing: "Sent as: /gsd auto  ×" — × allows override

BUILDER MODE — DISCUSS CARDS:
- When GSD 2 enters discuss phase, questions render as structured cards (already built in Phase 8)
- In Builder mode: question card labels are plain language, no GSD terminology
- Progress indicator: "Question 3 of 6" not internal phase names
- Decision log sidebar: visible and labelled "Your decisions so far"

BUILDER MODE — PHASE GATE:
When user attempts to build frontend without design contract:
```
One step first

Before building the interface, Mission Control needs to 
know how it should look. This takes about 5 minutes 
and prevents a lot of rework later.

[ Set up the design ]          [ Skip for now ]
```
"Set up the design" triggers the ui-phase flow invisibly.
"Skip for now" routes the original message with a proceed flag.

BUILDER MODE — SLICE CARDS (from Phase 14):
State labels change:
- PLANNED → "Ready to build"
- EXECUTING → "Building now..."  
- NEEDS REVIEW → "Ready for your review"
- COMPLETE → "Done"
Action labels change:
- "Review plan" → "See what will be built"
- "Start this slice" → "Build this feature"
- "Steer" → "Give direction"
- "Merge to main" → "Ship it"

---

### PHASE 19: Project Workspace Management
**Goal:** Add managed workspace for Lovable users (they never see a file picker) while preserving the developer file picker flow from Phase 6.1/6.2. Surface multi-session capability from Phase 6.3 properly.

**Must-haves:**

MANAGED WORKSPACE:
- Default workspace path: `~/GSD Projects/` (macOS/Linux), `%USERPROFILE%\GSD Projects\` (Windows)
- Configurable in Settings → Workspace
- When Lovable user creates a new project: Mission Control creates the directory, runs `git init`, runs `gsd` setup, opens project — no file picker shown
- Developer user: existing Open Folder flow from Phase 6.1/6.2 unchanged

PROJECT HOME SCREEN (shown when no project is open):
- Grid of project cards
- Each card shows: project name, last active timestamp, active milestone name, progress bar, Resume button
- Empty state: "Create your first project" with a brief-taking input (Builder mode) or "Open Folder" (Developer mode)
- Archived projects: accessible via "Show archived" link at bottom

PROJECT CARD:
```
┌─────────────────────────────────────────────────────────┐
│  Spaza Inventory Bot                                    │
│  Last active 2 hours ago                                │
│                                                         │
│  Milestone 1 · Feature 3 of 7                           │
│  ████████████░░░░░░░░  43%                              │
│                                                         │
│  [ Resume ]                                   [ ··· ]   │
└─────────────────────────────────────────────────────────┘
```
`···` menu: Archive, Open in Finder/Explorer, Remove from list (does not delete files)

MULTI-SESSION TABS:
- Multiple projects open simultaneously: each gets a tab in the tab bar
- Tab bar appears automatically when more than one project is active
- Each tab has its own `gsd` process, its own WebSocket connection, its own state
- Tab shows: project name + active indicator (amber dot if executing)
- Already architected in Phase 6.3 — this phase surfaces it from the home screen and makes it discoverable

PROJECT ARCHIVING:
- Archive moves project out of main grid into "Archived" section
- Does not touch files, does not close git repo
- Restore from archive returns to main grid

---

### PHASE 20: Installer + Distribution
**Goal:** Produce signed, distributable installers for macOS and Windows. Land a working download link. This is the minimum viable demo asset for the Lex Christopherson outreach.

**Must-haves:**

GITHUB ACTIONS PIPELINE:
`.github/workflows/release.yml`:
- Trigger: push to `release/*` branch or manual dispatch
- Matrix: `[macos-latest, windows-latest, ubuntu-latest]`
- Steps: checkout → install Rust → install Node → bun install → tauri build → upload artifacts
- Artifacts: `.dmg` (macOS), `.msi` + `.exe` (Windows), `.AppImage` + `.deb` (Linux)
- Draft GitHub Release created automatically with all artifacts attached

CODE SIGNING:
- macOS: Apple Developer ID certificate via GitHub secret `APPLE_CERTIFICATE`
- Windows: self-signed for M2 (acceptable for demo). Production signing in M3.
- Linux: GPG signed AppImage

AUTO-UPDATE:
- Tauri updater plugin configured
- Update check on every launch
- Background download, install on next restart
- Non-intrusive "Update ready — restart to apply" notification in sidebar footer
- Update server: GitHub Releases JSON endpoint (zero infrastructure cost)

LANDING PAGE (static, for the demo):
Single HTML file deployed to GitHub Pages or Vercel.

Content:
- GSD branding: dark navy `#0F1419`, binary matrix SVG texture, pixel-art GSD logo
- Headline: "Build real software without the noise."
- Subheadline: "GSD Mission Control brings the discipline of the GSD workflow to a native desktop app. Plan, build, and ship — without touching the terminal."
- Demo GIF or screenshot (record after build)
- Download buttons: macOS, Windows, Linux — link to latest GitHub Release
- "Powered by GSD 2" with link to gsd-build/gsd-2
- Footer: "Built by Bantuson · Mzansi Agentive"

Design quality contract for landing page:
- Share Tech Mono for headlines
- JetBrains Mono for body and code
- Binary matrix pattern at 3% opacity on `#0F1419` background
- GSD cyan `#5BC8F0` for CTAs and accent only
- One page, no navigation, no fluff
- Mobile responsive

---

## Cross-cutting constraints for all phases

**GSD 2 state file compatibility:**
- Never hardcode `M001`, `S01`, `T01` — always derive indices dynamically from STATE.md
- File naming pattern: `{milestone_id}-ROADMAP.md`, `{slice_id}-PLAN.md`, `{task_id}-SUMMARY.md`
- Milestone IDs are zero-padded three digits: `M001`, `M002`
- Slice IDs are zero-padded two digits within milestone context: `S01`, `S02`
- Task IDs are zero-padded two digits within slice context: `T01`, `T02`
- All file reads are non-blocking — missing files render as empty states, never errors

**Design system enforcement:**
- No new colour values introduced — only tokens from the established palette
- No new font families — Share Tech Mono and JetBrains Mono only
- All spacing from 8-point grid
- Motion: state change only, never decorative
- Every new UI state needs: empty state, loading state, error state

**Lovable-user principle:**
- Every GSD concept that surfaces in Builder mode must be translatable to plain English
- If a concept cannot be explained without using GSD terminology, it is hidden in Builder mode entirely
- The underlying capability is never removed — only the surface presentation changes

**Tauri IPC discipline:**
- All OS-level operations go through Tauri IPC commands (keychain, file picker, external URLs)
- No direct Node.js `fs` calls for OS-sensitive operations in the Tauri context
- Bun server runs as a child process — its file operations are unrestricted within the project boundary

**Testing:**
- Phase 12 (compatibility pass) requires a regression test: open a GSD 2 project, verify STATE.md is read correctly, verify autocomplete shows GSD 2 commands, verify `/gsd auto` spawns and streams correctly
- Phase 14 (slice integration) requires human verification of all four slice state transitions before milestone completion
- Phase 17 (permission model) requires human verification that boundary enforcement blocks an out-of-project file operation
- Phase 20 (installer) requires a clean install on a machine with no prior dependencies installed

---

## What is explicitly out of scope for M2

These are documented so GSD 2 does not add them:

- Remotion marketing export compositions (M3)
- GSD Teams hosted sync server and real-time presence (M3)
- Bundling Bun and gsd-pi inside the installer (M3 — M2 uses install prompts)
- Custom native title bar (M3 — M2 uses OS native chrome)
- Semantic version control UI / boundary map graph (M3)
- Multi-window support (M3)
- Visual project analytics dashboard (M3)
