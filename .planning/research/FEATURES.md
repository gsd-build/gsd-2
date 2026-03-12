# Feature Research

**Domain:** Local developer dashboard with real-time state sync and AI chat integration
**Researched:** 2026-03-10
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Real-time state updates | Every modern dashboard (Grafana, Jira, Monday) updates live. Stale data = broken tool. | MEDIUM | WebSocket push from Bun file watcher. Diff-only updates critical for performance. |
| Resizable multi-panel layout | Cursor, Windsurf, VS Code DevTools all have resizable panels. Users expect to control their workspace. | MEDIUM | Use `react-resizable-panels` (shadcn wraps this). Keyboard resize support required for a11y. |
| AI chat with streaming responses | Cursor, Windsurf, Claude Code all stream responses token-by-token. Batch responses feel broken in 2026. | HIGH | Child process stdout streaming from Claude Code. Must handle partial output, errors, and cancellation. |
| Loading/empty/error states for every panel | Professional dashboards never show blank panels or spinners without context. | LOW | Design all three states per panel upfront. Skeleton screens preferred over spinners. |
| Keyboard shortcuts | VS Code, Cursor, Chrome DevTools all have extensive keyboard navigation. Power users expect it. | MEDIUM | Command palette pattern (Ctrl+Shift+P) is the standard. Panel focus switching via shortcuts. |
| Responsive layout | Developers work on laptops, external monitors, and increasingly tablets. | MEDIUM | Desktop-first with mobile bottom-tab nav. Three breakpoints: 1440px, 768px, 375px. |
| Session persistence / resume | Cursor and VS Code remember state across restarts. Losing context on reload = dealbreaker. | MEDIUM | Derive state from `.planning/` files (already file-based). No extra persistence layer needed since files ARE the state. |
| Dark theme | Developer tools are dark by default in 2026. Light-only = immediate rejection. | LOW | Already specified in PRD: dark navy base (#0F1419). Ship dark-only for V1. |
| Project detection and context awareness | Tools that require manual configuration lose to ones that auto-detect. | LOW | Scan for `.planning/` directory on startup. Show clear messaging when no project found. |
| Clear visual hierarchy for task/milestone status | Project dashboards must communicate status at a glance — active, blocked, complete. | LOW | Color-coded status indicators. Cyan for active (per design system), muted for complete, warm for blocked. |

### Differentiators (Competitive Advantage)

Features that set Mission Control apart from existing tools. These are where the product competes.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| File-based state with zero external services | No database, no cloud, no Docker. `bun run dev` and you're running. Cursor/Windsurf require accounts and API keys. | LOW | This is an architectural decision, not a feature to build. The simplicity IS the differentiator. |
| Unified build loop (chat -> code -> state update) | No other tool shows project state updating in real time as AI writes code. Cursor has chat but no project lifecycle view. | HIGH | The killer feature. Chat triggers Claude Code, code changes trigger file watcher, panels update. Full loop visible in one window. |
| Live preview iframe with viewport switching | Cursor and VS Code have preview extensions but not integrated with AI chat context. Seeing output alongside the build process is powerful. | MEDIUM | Bun proxy to localhost dev server. Viewport toggle (Desktop/Tablet/Mobile) adds real value for frontend work. |
| Hybrid intent classifier (local + API) | Most chat UIs send everything to the API. Detecting `/gsd:` commands locally avoids unnecessary API calls and latency. | MEDIUM | Local prefix matching for known commands, Claude API only for ambiguous natural language. Saves cost and time. |
| Discuss mode with structured question cards | No existing AI coding tool offers structured pre-planning discussion with decision logging. They all jump straight to code. | MEDIUM | Question cards with button groups reduce friction vs. typing. Decisions persist to `.planning/` for audit trail. |
| Review mode with 6-pillar scoring | Design quality enforcement is unique — no AI coding tool evaluates its own output against a design contract. | MEDIUM | Score display and action cards. Ties into design contract enforcement (UI-SPEC.md gating). |
| Milestone/phase lifecycle visualization | Project management tools show tasks; AI coding tools show code. Nothing shows the GSD lifecycle (research -> roadmap -> build -> review). | MEDIUM | Sidebar + milestone view panels. Derives from existing `.planning/` roadmap files. |
| Branded session start animation | First impression matters. A polished 600ms logo animation signals quality and intentionality. | LOW | Remotion-based pixel-art build animation. Reusable for V2 marketing materials. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Deliberately NOT building these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Direct file editing from dashboard | "I want to edit code right here" | Turns Mission Control into another IDE. Competes with Cursor/VS Code instead of complementing them. Massive scope expansion. | Route all mutations through Claude Code chat or `gsd-tools.cjs`. Dashboard is a viewer and command center, not an editor. |
| D3 force graph for architecture/boundary maps | Visual graphs look impressive in demos | HIGH complexity for V1 with poor ROI. Text lists convey the same information at 1/10th the cost. Force graphs are notoriously hard to make useful (not just pretty). | Text-based component/boundary lists. Add D3 visualization in V2 if users request it. |
| Multi-agent lane view | "Show me all agents working in parallel" | Requires GSD 2.0 parallel agent support that doesn't exist yet. Building UI for non-existent infrastructure wastes effort. | Single-agent task view for V1. Design data model to be extensible for multi-agent later. |
| Real-time diff viewer | "Show me what changed" | Complex to build well (syntax highlighting, line mapping, merge conflicts). VS Code already does this excellently. | Link to VS Code diff view or show changed file list with timestamps. |
| Cloud sync / collaboration | "Share my dashboard with my team" | Violates zero-external-services constraint. Adds authentication, conflict resolution, sync protocol — each is a project in itself. | Local-only for V1. File-based state means git handles sharing naturally. |
| Prompt library / template marketplace | "Let me save and share prompts" | Community feature that requires curation, moderation, versioning. Distracts from core build-loop value. | V2 consideration. For V1, chat history is sufficient. |
| Plugin/extension system | "Let me customize panels" | Extension APIs are extremely expensive to design well. Bad extension APIs are worse than none. | Ship opinionated defaults. Gather usage data before designing extensibility. |
| Telemetry / analytics dashboard | "Show me build metrics over time" | Requires data collection infrastructure, storage, and privacy considerations. Scope creep trap. | V2 feature. For V1, the `.planning/` files themselves are the audit trail. |
| Snapshot/replay timeline | "Let me rewind to see project state at any point" | Requires versioning of all `.planning/` state over time. Git already does this. Building a parallel versioning system is wasteful. | Users can `git log` and checkout historical state. Dashboard re-derives from files. |
| "Real-time everything" (character-by-character updates) | Feels responsive and modern | Creates massive WebSocket traffic, rendering overhead, and visual noise. Most state changes are discrete events, not streams. | Diff-based updates on file change events. Chat streaming is the only thing that benefits from character-level updates. |

## Feature Dependencies

```
[Bun Server + File Watcher]
    |
    +--produces--> [WebSocket State Push]
    |                  |
    |                  +--feeds--> [Sidebar Panel (project nav)]
    |                  +--feeds--> [Milestone View Panel]
    |                  +--feeds--> [Slice Detail Panel]
    |                  +--feeds--> [Active Task Panel]
    |
    +--enables--> [Dev Server Proxy]
                      |
                      +--feeds--> [Live Preview Panel]
                                      |
                                      +--enhanced-by--> [Viewport Switching]

[Chat Panel]
    |
    +--requires--> [Claude Code Child Process Spawning]
    |                  |
    |                  +--requires--> [stdout Streaming]
    |                  +--enhanced-by--> [Hybrid Intent Classifier]
    |
    +--enhanced-by--> [Discuss Mode (question cards)]
    +--enhanced-by--> [Review Mode (6-pillar scoring)]

[Session Start Flow]
    |
    +--requires--> [Project Detection (.planning/ scan)]
    +--enhanced-by--> [Remotion Logo Animation]

[Resizable Panel Layout]
    +--requires--> [react-resizable-panels]
    +--enhanced-by--> [Keyboard Shortcuts]
    +--enhanced-by--> [Responsive Breakpoints]

[Design Contract Enforcement]
    +--requires--> [UI-SPEC.md Detection]
    +--requires--> [Review Mode]
```

### Dependency Notes

- **All panels require Bun Server + File Watcher:** This is the foundation. Nothing works without file watching and WebSocket push. Must be built first.
- **Chat requires Claude Code child process:** The chat panel is useless without the ability to spawn and stream from Claude Code. This is the second critical dependency.
- **Live Preview requires Dev Server Proxy:** The preview iframe needs the Bun proxy to the user's localhost dev server. Independent of chat but depends on server infrastructure.
- **Discuss/Review modes enhance Chat:** These are layered on top of the basic chat panel. Chat must work first, then modes add structured interaction patterns.
- **Viewport Switching enhances Live Preview:** A nice addition but preview must work at default width first.
- **Design Contract requires Review Mode + UI-SPEC.md detection:** This is the most dependent feature — needs review scoring and file detection to function.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the "full build loop in one window" concept.

- [ ] Bun server with `.planning/` file watcher and WebSocket push -- foundation for everything
- [ ] Five-panel resizable layout with loading/empty/error states -- the visual shell
- [ ] Real-time state derivation from `.planning/` files -- panels show live project state
- [ ] Chat panel with Claude Code child process spawning and stdout streaming -- the core interaction model
- [ ] Session start flow with project detection -- users must be able to open and start using it
- [ ] Keyboard shortcuts for panel focus and command palette -- power user table stakes
- [ ] Dark theme with design system (already specified) -- non-negotiable for dev tools

### Add After Validation (v1.x)

Features to add once the core build loop is proven and users are engaged.

- [ ] Hybrid intent classifier -- add when users complain about latency on obvious `/gsd:` commands
- [ ] Live preview with dev server proxy -- add when frontend developers are the primary users
- [ ] Viewport switching -- add alongside live preview
- [ ] Discuss mode with question cards -- add when users want structured pre-planning
- [ ] Review mode with 6-pillar scoring -- add when design contract enforcement is needed
- [ ] Remotion logo animation -- polish item, add when core UX is solid
- [ ] Mobile/tablet responsive layout -- add when usage data shows non-desktop access

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] D3 force graph boundary maps -- defer until text lists prove insufficient
- [ ] Multi-agent lane view -- defer until GSD 2.0 parallel agent support exists
- [ ] Real-time diff viewer -- defer; VS Code does this well enough
- [ ] Snapshot/replay timeline -- defer; git history sufficient
- [ ] Prompt library -- defer; community feature needs community first
- [ ] Visual project analytics -- defer; needs data collection infrastructure
- [ ] Remotion marketing exports -- defer; nice-to-have after core is solid

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Bun server + file watcher + WebSocket | HIGH | MEDIUM | P1 |
| Five-panel resizable layout | HIGH | MEDIUM | P1 |
| Real-time state derivation | HIGH | MEDIUM | P1 |
| Chat with Claude Code streaming | HIGH | HIGH | P1 |
| Session start with project detection | HIGH | LOW | P1 |
| Loading/empty/error states | MEDIUM | LOW | P1 |
| Keyboard shortcuts | MEDIUM | LOW | P1 |
| Dark theme / design system | HIGH | LOW | P1 |
| Hybrid intent classifier | MEDIUM | MEDIUM | P2 |
| Live preview (dev server proxy) | HIGH | MEDIUM | P2 |
| Viewport switching | MEDIUM | LOW | P2 |
| Discuss mode (question cards) | MEDIUM | MEDIUM | P2 |
| Review mode (6-pillar scoring) | MEDIUM | MEDIUM | P2 |
| Remotion logo animation | LOW | LOW | P2 |
| Design contract enforcement | MEDIUM | MEDIUM | P2 |
| Responsive mobile layout | LOW | MEDIUM | P2 |
| D3 boundary maps | LOW | HIGH | P3 |
| Multi-agent lane view | LOW | HIGH | P3 |
| Diff viewer | LOW | HIGH | P3 |
| Snapshot/replay | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- validates the core "build loop in one window" concept
- P2: Should have, add in v1.x -- enhances the experience once core is proven
- P3: Nice to have, future consideration -- requires either GSD 2.0 or significant new infrastructure

## Competitor Feature Analysis

| Feature | Cursor/Windsurf | Claude Code (terminal) | VS Code + Extensions | Mission Control Approach |
|---------|-----------------|----------------------|---------------------|-------------------------|
| AI Chat | Inline + sidebar, multi-file aware | Terminal-native, full repo context | Copilot Chat sidebar | Dedicated panel with Claude Code child process, structured modes (discuss/review) |
| Project State View | None (file tree only) | None (reads on demand) | Extensions like Project Manager | Five panels derived from `.planning/` files in real time |
| Live Preview | Limited (extensions only) | None | Live Server extension | Integrated iframe with Bun proxy and viewport switching |
| Multi-file Editing | Composer/Cascade | Full agent capability | Copilot edits | Delegated to Claude Code; dashboard shows results |
| Real-time Updates | Editor updates on save | Terminal output only | Extension dependent | WebSocket push on file change, sub-100ms latency target |
| Keyboard Navigation | VS Code standard | Terminal standard | VS Code standard | Command palette + panel shortcuts + accessible resize |
| Onboarding | Account setup wizard | `claude` in terminal | Extension marketplace | Project detection + session start + branded animation |
| Lifecycle Tracking | None | None | None | Milestone/phase/task hierarchy from `.planning/` |
| Design Enforcement | None | None | None | 6-pillar review mode with UI-SPEC.md gating |
| Offline/Local | Needs API key | Needs API key | Fully local (without AI) | Fully local except Claude API calls for chat |

**Key insight:** Mission Control's competitive position is NOT as an IDE replacement. It is a **project lifecycle command center** that happens to have AI chat. No existing tool combines project state visualization with AI-driven code generation in a single real-time view. The closest competitors are Cursor/Windsurf for AI chat and Jira/Linear for project tracking -- Mission Control bridges the gap.

## Sources

- [Cursor vs Windsurf vs Claude Code 2026 comparison](https://dev.to/pockit_tools/cursor-vs-windsurf-vs-claude-code-in-2026-the-honest-comparison-after-using-all-three-3gof)
- [Windsurf vs Cursor comparison](https://windsurf.com/compare/windsurf-vs-cursor)
- [Claude Code overview](https://code.claude.com/docs/en/overview)
- [Claude Code dashboard TUI](https://github.com/Tpain166/claude-dashboard)
- [CloudCLI - Claude Code web UI](https://github.com/siteboon/claudecodeui)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
- [shadcn/ui Resizable component](https://ui.shadcn.com/docs/components/radix/resizable)
- [Real-time dashboard with WebSockets and React](https://levelup.gitconnected.com/how-i-built-a-real-time-dashboard-mvp-in-2-days-with-websockets-react-c083c7b7d935)
- [Iframe hot-reload system](https://github.com/cesarleaz/iframe-hotreload)
- [Onboarding UX study of 200+ flows](https://designerup.co/blog/i-studied-the-ux-ui-of-over-200-onboarding-flows-heres-everything-i-learned/)
- [Agentic IDEs - from assistants to autonomous agents](https://towardsagenticai.com/the-rise-of-agentic-ides-from-assistants-to-autonomous-agents/)

---
*Feature research for: Local developer dashboard with real-time state sync and AI chat integration*
*Researched: 2026-03-10*
