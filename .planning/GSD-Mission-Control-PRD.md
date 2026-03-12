# GSD Mission Control
## Product Requirements Document
### Bun-Powered UI Layer for Get Shit Done

| | |
|---|---|
| **Version** | 1.0 Draft |
| **Author** | Mfanafuthi Mhlanga (Bantuson) |
| **GitHub** | github.com/Bantuson |
| **Status** | Pre-Development |
| **Stack** | Bun · React 19 · TypeScript · Tailwind CSS · shadcn/ui |
| **Date** | March 2026 |

---

## 1. Vision

GSD is the most disciplined AI development workflow available. The terminal is its only interface. Mission Control gives it a face.

The product is a locally-run Bun-powered dashboard that reads GSD's existing `.planning/` state files in real time, renders the full project lifecycle visually, provides a context-aware chat layer for issuing commands, and closes the loop with a live preview panel and ui-review audit integration.

No database. No external service. No cloud sync. Bun reads the files GSD already writes, pushes state over WebSocket, and React renders them.

**Primary users:** Non-technical and technical GSD builders who want visual project state, solo developers managing multiple active milestones, and small teams needing shared visibility into a single GSD project.

**Secondary audience:** Lex Christopherson (TACHES) and the GSD Foundation. Mission Control represents a potential commercial distribution layer on top of the open-source GSD core.

---

## 2. Design System

All design decisions trace back to two official GSD brand assets: the terminal pixel-art logo and the X/Twitter profile banner. The aesthetic is retro-futuristic terminal elevated to a product interface.

### 2.1 Color Palette

The 60/30/10 rule is enforced. GSD cyan is reserved exclusively for active state indicators, primary CTAs, and the logo. It never appears on borders, backgrounds, or decorative elements.

| Token | Hex | Usage |
|---|---|---|
| `--gsd-bg-base` | `#0F1419` | Primary background. Dark navy. 60% dominant. |
| `--gsd-bg-surface` | `#131C2B` | Cards, panels, elevated surfaces. 30% secondary. |
| `--gsd-bg-elevated` | `#1A2332` | Modals, dropdowns, hover states. |
| `--gsd-border` | `#1E2D3D` | All borders and dividers. |
| `--gsd-cyan` | `#5BC8F0` | Primary brand accent. GSD logo color. Active states and CTAs only. 10% accent. |
| `--gsd-cyan-dim` | `#2A6B8A` | Secondary cyan. Borders and background tints within accent elements. |
| `--gsd-green` | `#22C55E` | Complete, verified, success states. |
| `--gsd-amber` | `#F59E0B` | Active, executing, warning states. |
| `--gsd-red` | `#EF4444` | Error, blocked, destructive states. |
| `--gsd-purple` | `#A78BFA` | COMMAND tier must-have badges only. |
| `--gsd-text-primary` | `#E8F0FE` | Primary readable text. |
| `--gsd-text-secondary` | `#6B8099` | Supporting labels, metadata. |
| `--gsd-text-muted` | `#2D3F52` | Disabled, placeholder, empty states. |

### 2.2 Typography

Two fonts only. Four sizes only. Two weights only. These constraints are enforced as a design contract, not a preference.

**Display font: Share Tech Mono** (Google Fonts)
Used for milestone names, section headers, logo wordmark, command output. Matches the pixel-art terminal identity of GSD branding precisely.

**Body font: JetBrains Mono**
Used for all data, file paths, code, labels, metadata, state values. Developer-first monospace, legible at 10px, with tabular figures for data alignment.

| Size | Token | Usage |
|---|---|---|
| 10px | `--text-xs` | Metadata, badges, timestamps |
| 12px | `--text-sm` | File paths, secondary labels, descriptions |
| 14px | `--text-base` | Primary readable content, chat messages |
| 18px | `--text-lg` | Section headings, milestone names |

Weights: 400 (regular) and 700 (bold) only. Line height 1.5 for body, 1.2 for headings.

### 2.3 Spacing Scale

8-point grid. No exceptions. All padding, margin, and gap values come from this scale exclusively.

```
4px  /  8px  /  16px  /  24px  /  32px  /  48px  /  64px
```

Panel inner padding: 24px horizontal, 16px vertical. List item gap: 8px within group, 16px between groups.

### 2.4 Motion Principles

One rule: motion communicates state change, never decorates. No looping animations except the active-session pulse indicator (2s cycle, subtle opacity).

| Trigger | Behaviour |
|---|---|
| Panel load | Staggered fade-in. 40ms delay between panels. 200ms duration. |
| Slice completes or task advances | Brief amber pulse on affected element. 150ms. |
| Context budget bar | Smooth width transition. 500ms ease-out. |
| Chat message arrival | Slide-up 80ms, opacity 0 to 1. |
| Audit score reveal | Count-up animation on each pillar score. |
| Session start | Remotion sequence: GSD logo pixel-art build animation. 600ms. Plays once. |

### 2.5 Visual Texture

The binary matrix pattern from the GSD X/Twitter banner renders as a subtle SVG background on the base layer at 3% opacity. It gives the interface depth and ties it to the brand identity without competing with content.

The GSD pixel-art logo is reproduced in SVG matching the terminal screenshot. Used in the sidebar header and loading states. The Remotion animated variant drives the same SVG via a composition (see section 4.10).

---

## 3. Architecture

### 3.1 Runtime: Bun

Bun handles the entire server layer. No Node, no separate API server, no Vite config. One command starts everything.

```bash
bun run dev
  # Serves dashboard on :4000
  # WebSocket server on :4001
  # File watcher on .planning/
  # Proxy to project dev server on :3000 (configurable)
```

Bun is chosen because its native file watching API, built-in WebSocket support, and zero-config HTTP server eliminate the dependency overhead that Node would require for the same functionality.

### 3.2 File Watcher

`Bun.watch()` monitors `.planning/` recursively. On any file change:

1. Derive current GSD state from the changed files.
2. Compute diff against last known state.
3. Push diff over WebSocket to all connected clients.
4. React renders the diff only, not a full re-render.

State is always derivable from files on disk. No in-memory state exists that can drift from the file system. If the Bun process restarts, state is fully reconstructed from `.planning/` on next launch.

### 3.3 Dev Server Proxy

`Bun.serve()` proxies the project's dev server through a `/preview` path, eliminating CORS. The preview iframe renders same-origin content.

```typescript
Bun.serve({
  port: 4000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/preview")) {
      const target = url.pathname.replace("/preview", "") || "/";
      return fetch(`http://localhost:${PROJECT_PORT}${target}`, req);
    }
    return new Response(Bun.file("./dist/index.html"));
  }
});
```

Project port is read from `.planning/config.json` or defaults to 3000.

### 3.4 Intent Classifier

Every chat message passes through a lightweight Claude API call before routing to Claude Code. The classifier injects the current GSD state as context and returns one of four routing decisions:

| Classification | Action |
|---|---|
| `GSD_COMMAND` | Route to Claude Code with the appropriate `/gsd:` prefix injected automatically |
| `PHASE_QUESTION` | Route with `CONTEXT.md` and `REQUIREMENTS.md` injected as context |
| `GENERAL_CODING` | Route with no GSD overhead |
| `UI_PHASE_GATE` | Intercept, surface design contract warning inline |

GSD enforcement becomes invisible. Developers type naturally. When a prefix is injected, a small badge shows which command was used so the developer knows what happened.

### 3.5 Session Management

Session state is a single JSON file Bun writes alongside `.planning/`:

```
.planning/.mission-control-session.json
```

Contains: active project path, last viewed slice, panel layout preferences, chat history (last 50 messages). Nothing Mission Control cannot reconstruct from GSD's own files. Pure UI convenience state.

---

## 4. V1 Scope — Core Mission Control

### 4.1 Session Start Flow

**New project** — no `.planning/` detected. Onboarding screen loads with the GSD logo Remotion animation, then a guided `/gsd:new-project` conversation in the chat panel. Discuss-phase questions appear as structured cards. Multiple-choice options render as button groups. Text questions render as single-line inputs.

**Existing project** — `.planning/config.json` detected. Dashboard loads current state. If a continue-here file is present, it renders as a Resume card showing: last task completed, what remains, and the exact first action to take. One-click resume.

**Project selector** — if multiple GSD projects exist in configured workspace paths, a picker appears on launch showing project name, active milestone, and last activity timestamp. Sorted by most recent.

### 4.2 Five-Panel Layout

```
┌──────────┬────────────────────┬────────────┬───────────┬──────────┐
│ SIDEBAR  │  MILESTONE VIEW    │   SLICE    │  ACTIVE   │  CHAT    │
│ 200px    │  flex grow         │   DETAIL   │  TASK     │  340px   │
│          │                    │   280px    │  300px    │          │
└──────────┴────────────────────┴────────────┴───────────┴──────────┘
```

Panels are resizable via drag handles. Layout preference persists in the session file. Mobile renders as a single panel with bottom tab navigation.

### 4.3 Sidebar Panel

- GSD pixel-art logo in SVG, matching the terminal screenshot exactly
- Project list with active/paused status indicators per project
- Navigation: Projects, Activity, Verify, History
- Claude Code connection indicator: pulsing cyan dot with `CLAUDE CODE ACTIVE` or `DISCONNECTED` label
- Current model profile from `.planning/config.json`

### 4.4 Milestone View Panel

**Header:** Git branch name (monospace, muted), milestone name (Share Tech Mono, large), overall progress bar with one segment per task and amber fill with glow on leading edge, and a tasks complete/total count.

**Slice list** — each row shows:
- Status icon with appropriate color (complete, active, pending)
- Slice ID in cyan monospace
- Task progress bar, segments per task
- Demo sentence in italics: the "After this, user can..." statement
- Committed slices show their squash commit message

**Committed history** — all squash merge commits for the milestone shown as monospace lines at the panel bottom, mirroring the changelog format GSD 2.0 produces.

### 4.5 Slice Detail Panel

**Context usage:** Bar chart with one bar per task in the slice, colour-coded by budget (green under 50%, amber 50-70%, red over 70%). Anchor-pruning note confirms earlier tasks are not in the current window.

**Boundary map:**
- PRODUCES: green-bordered list of exported functions, types, and handlers
- CONSUMES: blue-bordered list of upstream dependencies
- Leaf node state displayed if no dependencies exist

**UAT status:** One row per completed slice with test count and verification bars. Status badges: `VERIFIED`, `PARTIAL`, `PENDING`.

### 4.6 Active Task Panel

**Executing state:**
- Pulsing amber dot with `EXECUTING` label, task ID, and wave number
- Context budget meter with colour shift at 50% and 70%, anchor-pruning note below
- Must-haves list with completion state, tier badge (`BEHAVIORAL`, `STATIC`, `COMMAND`, `HUMAN`), strikethrough on done items
- Target files list with FileCode icons
- Checkpoint reference showing the git checkpoint before the task started

**Waiting state:** Last completed task summary, next task name and estimated context cost, and a run-next-task prompt linking to the chat command input.

### 4.7 Chat Panel

The chat panel operates in three distinct modes driven by the current GSD workflow state.

**Command mode (default)**
- Input at bottom with `/` prefix hint and autocomplete for all GSD slash commands
- Streaming Claude Code output renders in real time
- Agent responses visually distinguished from system messages
- State panels animate as files land on disk during execution
- Command history recalled with up arrow

**Discuss mode** — activates during `/gsd:discuss-phase`
- Agent questions render as distinct cards with the question text prominent
- Multiple-choice options render as button groups, not raw text
- Free-text questions render as input fields
- Progress indicator showing questions remaining
- Decision log sidebar showing answers already locked
- `CONTEXT.md` accumulates decisions visibly as the discussion progresses

**Review mode** — activates after `/gsd:ui-review` completes
- 6-pillar score table with count-up animation on reveal
- Each pillar row expandable to show specific findings
- Top 3 priority fixes as action cards with a Fix quick-action that pre-populates the command input
- Overall score as a circular progress indicator

**Intent classification:** When the classifier injects a GSD prefix, a small badge shows which command was routed. The developer can override at any time.

**Phase gate interception:** If a user attempts implementation work without a `UI-SPEC.md` for a frontend phase, an inline warning card appears:

```
No design contract for this phase.
Run /gsd:ui-phase first?

[ PROCEED ANYWAY ]  [ RUN UI PHASE ]
```

### 4.8 Preview Panel

Toggled via `Cmd+P` or the preview button in the toolbar. Slides in from the right, overlaying the Active Task panel.

- Viewport switcher: Desktop (1440px), Tablet (768px), Mobile (375px)
- Live iframe proxied through Bun to the project dev server
- Dev server offline: clean empty state, not a broken iframe

**Audit comparison** — when `UI-REVIEW.md` exists:
- Left: live iframe. Right: last audit screenshot from `.planning/ui-reviews/`
- 6-pillar score badges overlaid on the audit screenshot
- Timestamp of last audit
- Run Audit button triggers `/gsd:ui-review` in the chat panel

### 4.9 Design Contract Enforcement

**When `UI-SPEC.md` exists and is approved:**
- Sidebar shows a Design Contract section with the shadcn preset string
- Active Task panel shows relevant UI-SPEC fields as context: accent colour, spacing scale, active CTA copy
- Persistent `Design Contract Active` indicator in chat panel header

**When `UI-SPEC.md` is missing for a frontend phase:**
- Persistent amber warning bar at top of chat panel
- Phase gate interception fires on implementation commands (see 4.7)

### 4.10 Remotion Logo Animation

**Session start (600ms, plays once):** GSD pixel-art logo builds pixel by pixel from bottom-left. Cyan colour fills in. `GET SHIT DONE` fades in above. Binary matrix pattern fades into background. Signals that the session is fully initialised.

**Loading state (200ms loop):** A single row of pixels scans left-to-right across the logo outline. Used while Bun reads project state on launch.

Built as a Remotion composition exported as a React component accepting playback props. The same composition is extended for marketing exports in V2 without additional tooling.

---

## 5. V2 Scope — Beyond Current Architecture

V2 features require GSD 2.0 compatibility or significant additional infrastructure. All are additive and non-breaking for V1 users.

### 5.1 Boundary Map as Interactive Graph

V1 renders produces/consumes as text lists. V2 renders them as a D3 force graph where slices are nodes and dependency arrows represent interface contracts.

- Hover a node: highlight all downstream dependents
- Click a node: show full boundary map detail in a side panel
- Cycle detection: circular dependencies highlighted in red before planning begins
- "What breaks if I change this?" query: select any produces item, see all consuming slices highlighted

### 5.2 Multi-Agent Lane View

GSD 2.0 spawns parallel agents for independent wave tasks. V2 makes this visible as a CI-pipeline lanes view replacing the single Active Task panel.

- Each active agent gets a lane: task ID, context budget meter, must-have progress, current file being modified
- Wave structure visually clear: Wave 1 completes before Wave 2 lanes appear
- Sequential tasks shown as queued
- Full execution graph visible rather than one task at a time

### 5.3 Real-Time Diff Viewer

Every atomic commit GSD makes is visible as an expandable diff card in the Milestone View panel.

- File name, change type (created, modified, deleted), link to the producing task
- Line-level diff with syntax highlighting
- Revert button triggers `git reset` to the checkpoint for that task

### 5.4 Snapshot and Replay Timeline

Since all GSD state is files, any moment in a project's history can be captured and restored.

- Snapshots at each slice completion and milestone boundary
- Full `.planning/` directory state captured at each point
- Replay: read-only view of project state at any historical moment
- Undo project decision flow: restore to snapshot, branch from that point, GSD handles the git operations

### 5.5 Team Presence Layer

Multiple contributors on one GSD project currently have no visibility into each other's sessions. V2 adds lightweight presence via WebSocket broadcast.

- Each contributor running Mission Control against the same project appears as an avatar in the sidebar
- Shows which slice they are active on, last activity timestamp, current task if executing
- No conflict resolution, no locking. Visibility only. Prevents two contributors accidentally planning the same slice.

Requires a shared Bun server against a shared project directory, or a lightweight sync mechanism to be designed separately.

### 5.6 Prompt Library

Power users accumulate effective patterns: strong discuss-phase answers, precise task descriptions, well-formed must-haves. V2 surfaces these as a reusable library.

- User-saved snippets from chat history
- Auto-detected high-quality discuss-phase answer patterns
- Community-contributed patterns via GSD Foundation (opt-in)
- Type `/` in chat, see library suggestions filtered by current phase

### 5.7 Visual Project Analytics

| Metric | Description |
|---|---|
| Velocity | Average tasks per slice, slices per milestone |
| Context usage | Which task types burn the most context budget |
| UAT pass rate | How often tests pass on first verification |
| Phase gate rate | How often UI phase is skipped vs completed |
| Failure modes | Most common must-have failure patterns |

Insight example: "Your last 3 milestones averaged 72% context usage by task 4. Consider smaller task decomposition."

### 5.8 Remotion Marketing Export

| Composition | Duration | Description |
|---|---|---|
| Milestone Complete | 15s | Slice bars fill in, final commit scrolls, logo pulses. Shareable on social media. |
| Build Montage | 30s | Timelapse of tasks completing across a milestone. Shows development velocity. |
| Feature Demo | 60s | Configurable. Takes project name, milestone, UAT steps. Produces a narrated walkthrough. Usable as contributor developer branding or GSD Foundation social proof. |

### 5.9 GSD 2.0 Deterministic Tool Visibility

GSD 2.0 exposes two tools: `gsd_manage` (18 actions) and `gsd_verify` (4 actions). V2 renders every tool call as a structured event card in the chat panel rather than raw terminal output.

- `gsd_manage` card: action name, parameters, result, duration
- `gsd_verify` card: check type, files inspected, pass/fail with specific findings
- Makes the LLM/deterministic split visually legible. Developer sees which parts are judgment calls vs deterministic operations. Builds trust and debuggability.

---

## 6. V1 Development Milestones

| Milestone | Name | Scope |
|---|---|---|
| M1 | Foundation | Bun server, WebSocket, file watcher, state derivation from `.planning/`, static dashboard shell. Session start flow. Sidebar and Milestone View panels only. No chat, no preview. |
| M2 | Command Surface | Chat panel in command mode. Claude Code process spawning and stdout streaming. Intent classifier. Active Task panel with must-have tracking and context budget visualization. |
| M3 | Discuss and Audit | Chat panel discuss mode with structured question cards. Review mode with pillar score reveal. UI-SPEC enforcement. Phase gate interception. |
| M4 | Preview and Polish | Dev server proxy. Preview panel with viewport switching. Audit comparison split view. Remotion logo animations. Full 6-pillar design audit against UI-SPEC. |
| M5 | Demo Ready | Responsive layout. Full empty, loading, and error states. Keyboard shortcuts. Accessibility audit. Performance validation. Demo recording for outreach. |

---

## 7. Design Quality Contract

Mission Control enforces the same 6-pillar design standards it exposes through `/gsd:ui-phase`. The product is subject to those standards.

| Pillar | Contract |
|---|---|
| Copywriting | Primary CTA: "Start Building" (new project), "Resume Session" (existing). Empty states guide to next action, never just describe absence. Error states include problem and solution path. All badges describe state ("EXECUTING" not "STATUS"). |
| Visuals | One focal point per panel. GSD cyan reserved for active states, CTAs, and the logo only. No decorative elements competing with state information. |
| Color | 60/30/10 enforced strictly. Semantic colors consistent across all contexts. Color never the sole state indicator. |
| Typography | 4 sizes: 10/12/14/18px. 2 weights: 400/700. All numeric and state data in JetBrains Mono for tabular alignment. |
| Spacing | All values from 8-point scale. Panel inner padding 24px horizontal, 16px vertical. No exceptions. |
| Experience Design | Every state is designed: empty, loading, error, active, complete. Remotion animation replaces spinners. Destructive actions require proportional confirmation. |

---

## 8. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| Launch to first render | Under 800ms on a warm Bun process |
| File event to panel update | Under 100ms |
| Chat to Claude Code route | Under 200ms, excluding model latency |
| Preview iframe load | Matches underlying dev server performance |
| Security | No data leaves the local machine in V1. Preview proxy strips credentials. No telemetry without explicit opt-in. |
| Reliability | WebSocket reconnects with exponential backoff. Claude Code crash does not crash the Bun server or lose chat history. |
| Accessibility | One `h1` per view, logical heading hierarchy. All interactive elements have accessible names. Minimum 44px touch targets. Focus managed on panel transitions. |

---

## 9. Open Questions

1. Does the intent classifier require a separate Claude API key or should it piggyback on the user's existing Claude Code credentials?
2. Should Mission Control install via the existing `npx get-shit-done-cc` installer or as a separate package `npx gsd-mission-control`?
3. For V2 team presence, is a shared filesystem the right assumption or should a lightweight sync protocol be designed separately?
4. Should the Remotion marketing export be a separate package to keep the core dashboard dependency footprint minimal?
5. How does Mission Control handle GSD 2.0's `gsd_manage` and `gsd_verify` tool API? Requires coordination with Lex on V2 API stability before V2 development begins.

---

*GSD Mission Control — PRD v1.0 Draft — March 2026*
*Mfanafuthi Mhlanga · Bantuson · Mzansi Agentive (Pty) Ltd*
