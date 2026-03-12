# Phase 8: Discuss + Review Modes - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Two special UI modes that the chat panel enters during specific GSD command flows:

1. **Discuss mode** — triggered by `/gsd:discuss-phase`, renders structured question cards with button groups and free-text inputs, a progress indicator, and a slide-in decision log drawer
2. **Review mode** — triggered by `/gsd:ui-review` completion, renders a 6-pillar score table with count-up animation, expandable findings, and top-3 fix action cards

This phase adds rich UI rendering on top of the existing chat stream. No new commands or server capabilities outside of stream parsing and WebSocket event broadcasting.

</domain>

<decisions>
## Implementation Decisions

### Mode Activation Mechanism
- **Server-side stream interception**: Bun server parses Claude's stdout for XML-tagged blocks and broadcasts structured WebSocket events to the client
- **Marker format**: XML-tagged question blocks (consistent with GSD's existing AskUserQuestion output — `<question>`, `<options>`, `<decision>` tags). Server strips them from the chat stream and converts to structured events
- **Mode transition events**: Explicit `discuss_mode_start` / `discuss_mode_end` and `review_mode_start` / `review_mode_end` WebSocket events. Client enters mode on start event, exits on end event
- **Mid-stream handling**: Flush and complete the current streaming message before switching to question card rendering. No simultaneous streaming text + question card

### Discuss Layout
- **Question card placement**: Overlay over the dimmed chat message list — question card slides in over messages, which are visible but dimmed behind it
- **Chat input during discuss**: Replaced by the question's answer controls (button group or text field) while a question is active
- **Multiple-choice submission**: Select-then-confirm flow — clicking a button highlights it, a second "Confirm" click submits the answer and closes the card
- **Progress indicator**: "Question 2 of 5" label inside the question card header, alongside the area name (e.g., "Layout style")
- **Between questions**: Overlay dismisses after answer submitted, chat returns to normal view with a pulsing typing indicator while Claude processes. Overlay slides back in when next question arrives

### Decision Log
- **Placement**: Slide-in drawer from the right edge of the chat panel during discuss mode. Question card occupies the main area; drawer is the sidebar
- **Entry format**: Compact rows — question label (e.g., "✓ Layout style") on one line, answer ("Cards") below in cyan. Key-value style, fits 6-8 decisions without scrolling
- **Editing**: Decisions are locked — no editing during the session. If user wants to change a decision, they re-run `/gsd:discuss-phase`
- **Lifecycle**: Drawer slides away automatically when `discuss_mode_end` event is received. Final decisions persist in CONTEXT.md written by Claude — not stored in UI state

### Review Mode Presentation
- **Placement**: Dedicated `ReviewView` component replaces the chat panel (follows the same pattern as SettingsView). Full panel space for scores, expandable rows, and action cards. Chat accessible again after dismissing ReviewView
- **Score animation**: Count-up from 0 to final value on ReviewView mount. Scores color-coded: green (8.0–10), amber (5.0–7.9), red (<5.0). Score bar fills in sync with count-up. Matches existing budget color pattern in the codebase
- **Expanded pillar rows**: Accordion expansion reveals a bulleted list of specific findings parsed from Claude's structured review output (e.g., "- CTA button lacks sufficient contrast")
- **Fix quick-action**: Clicking "Fix" on a top-3 action card dismisses ReviewView, opens the chat panel, and sends a pre-drafted fix message (e.g., "Fix the spacing issues identified in the UI review"). User sees Claude's response stream immediately

### Claude's Discretion
- Exact XML tag schema for question/options/decision markers (researcher to verify against GSD skill output or propose schema)
- Animation duration and easing for card slide-in, drawer slide-in, and count-up
- Exact text of pre-drafted Fix messages
- How to handle malformed/partial XML in the stream (skip vs best-effort parse)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatPanel.tsx` / `ChatPanelView` — pure render component with messages list + ChatInput; discuss mode will conditionally replace ChatInput with question answer controls
- `ChatMessage.tsx` — role-based renderer; existing `isAssistant` / `isSystem` pattern can be extended or kept as-is for messages behind the overlay
- `SettingsView.tsx` — established pattern for a ViewType that replaces the chat area; ReviewView follows the same approach
- `useSessionManager.ts` — manages session state including Claude process; mode events should flow through this hook or a new `useChatMode` hook
- `useActivity.ts` — WebSocket event handler pattern to model for new mode events
- `tw-animate-css` — already used for micro-interactions (Phase 7); use for card slide-in and count-up animation

### Established Patterns
- **ViewType discriminated union** (set in Phase 6.2): routing between Chat, Milestones, Settings, etc. ReviewView gets its own ViewType
- **Pure render + stateful wrapper split**: `ChatPanelView` (pure) + `ChatPanel` (stateful). Discuss mode overlay sits inside `ChatPanelView` as a conditional layer
- **Budget color pattern**: `BUDGET_COLORS` lookup (`<50% green`, `50-70% amber`, `>70% red`) maps directly to review score coloring
- **WebSocket topic-based pub/sub**: server already uses topic routing; new mode events broadcast on existing `planning` topic or a new `chat` topic
- **Skeleton/loading states**: existing `skeleton.tsx` component; use for question card loading state between questions

### Integration Points
- Server stream parser (`packages/mission-control/src/server/`) — needs to intercept Claude stdout and detect XML question markers before forwarding to WebSocket
- WebSocket event types (`chat-types.ts` or equivalent) — needs new event variants: `discuss_mode_start`, `discuss_mode_end`, `question_card`, `decision_logged`, `review_mode_start`, `review_results`
- `ChatView.tsx` — top-level chat view that would conditionally render DiscussOverlay and DecisionLogDrawer on top of ChatPanel
- `AppShell` or `ChatView` — needs to handle `review_mode_start` to switch ViewType to ReviewView

</code_context>

<specifics>
## Specific Ideas

- Question card overlay: messages dimmed behind it, not hidden — user can see conversation context
- Decision log drawer slides in from right within the chat panel bounds (not the full dashboard)
- Review score table visual: bar-graph style per pillar (like the context budget bars in the codebase), not a number-only table
- "Fix" action cards should feel like clickable call-to-action chips, distinct from the score rows above them

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-discuss-review-modes*
*Context gathered: 2026-03-11*
