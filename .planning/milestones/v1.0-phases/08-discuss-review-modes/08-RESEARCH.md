# Phase 8: Discuss + Review Modes - Research

**Researched:** 2026-03-11
**Domain:** React UI modes — chat panel overlays, server-side stream interception, WebSocket event protocol
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Mode Activation Mechanism**
- Server-side stream interception: Bun server parses Claude's stdout for XML-tagged blocks and broadcasts structured WebSocket events to the client
- Marker format: XML-tagged question blocks (`<question>`, `<options>`, `<decision>` tags). Server strips them from the chat stream and converts to structured events
- Mode transition events: Explicit `discuss_mode_start` / `discuss_mode_end` and `review_mode_start` / `review_mode_end` WebSocket events. Client enters mode on start event, exits on end event
- Mid-stream handling: Flush and complete the current streaming message before switching to question card rendering. No simultaneous streaming text + question card

**Discuss Layout**
- Question card placement: Overlay over the dimmed chat message list — slides in over messages, visible but dimmed behind it
- Chat input during discuss: Replaced by question's answer controls (button group or text field) while a question is active
- Multiple-choice submission: Select-then-confirm flow — clicking a button highlights it, a second "Confirm" click submits and closes the card
- Progress indicator: "Question 2 of 5" label inside the question card header, alongside the area name (e.g., "Layout style")
- Between questions: Overlay dismisses after answer submitted, chat returns to normal view with a pulsing typing indicator while Claude processes. Overlay slides back in when next question arrives

**Decision Log**
- Placement: Slide-in drawer from the right edge of the chat panel during discuss mode
- Entry format: Compact rows — question label (e.g., "✓ Layout style") on one line, answer ("Cards") below in cyan. Key-value style, fits 6-8 decisions without scrolling
- Editing: Decisions are locked — no editing during the session
- Lifecycle: Drawer slides away automatically when `discuss_mode_end` event is received. Final decisions persist in CONTEXT.md written by Claude — not stored in UI state

**Review Mode Presentation**
- Placement: Dedicated `ReviewView` component replaces the chat panel (follows SettingsView pattern). Full panel space for scores, expandable rows, and action cards
- Score animation: Count-up from 0 to final value on ReviewView mount. Scores color-coded: green (8.0–10), amber (5.0–7.9), red (<5.0). Score bar fills in sync with count-up
- Expanded pillar rows: Accordion expansion reveals a bulleted list of specific findings parsed from Claude's structured review output
- Fix quick-action: Clicking "Fix" on a top-3 action card dismisses ReviewView, opens the chat panel, and sends a pre-drafted fix message

### Claude's Discretion
- Exact XML tag schema for question/options/decision markers
- Animation duration and easing for card slide-in, drawer slide-in, and count-up
- Exact text of pre-drafted Fix messages
- How to handle malformed/partial XML in the stream (skip vs best-effort parse)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-01 | Activates during `/gsd:discuss-phase` with distinct visual treatment | Stream interceptor detects `discuss_mode_start` event; client switches `ChatPanelView` to overlay mode |
| DISC-02 | Agent questions render as cards with question text prominent | `QuestionCard` component inside `ChatPanelView` overlay layer; pure render for testability |
| DISC-03 | Multiple-choice options render as button groups | Button group inside `QuestionCard`; select-then-confirm two-step UX |
| DISC-04 | Free-text questions render as input fields | Conditional rendering in `QuestionCard` based on question type |
| DISC-05 | Progress indicator showing questions remaining | Header slot in `QuestionCard` with "Q N of M" label from structured event data |
| DISC-06 | Decision log sidebar showing locked answers | `DecisionLogDrawer` component; slide-in from right edge of chat panel; visible during discuss mode |
| REVW-01 | Activates after `/gsd:ui-review` completes | Stream interceptor detects `review_mode_start`; ViewType switches to `{ kind: "review" }` |
| REVW-02 | 6-pillar score table with count-up animation on reveal | `ReviewView` component; CSS counter-up via `useEffect` + `requestAnimationFrame` on mount |
| REVW-03 | Each pillar row expandable to show specific findings | Accordion pattern (existing in `SettingsView`); parsed findings from `review_results` event |
| REVW-04 | Top 3 priority fixes as action cards with Fix quick-action | `FixCard` sub-component; "Fix" click sends pre-drafted message via `onChatSend` and sets ViewType to chat |

</phase_requirements>

---

## Summary

Phase 8 adds two distinct UI modes on top of the existing chat infrastructure. Discuss mode intercepts Claude's stdout stream on the server to detect XML-tagged question blocks, broadcasts structured WebSocket events, and renders a question-card overlay on the client — replacing `ChatInput` with answer controls while chat history is dimmed behind the card. Review mode is triggered by `/gsd:ui-review` completion: it switches the `ViewType` to a new `ReviewView` (following the exact `SettingsView` pattern), displays 6 pillar scores with count-up animation, accordion-expanded findings, and fix action cards that dispatch pre-drafted messages.

The entire feature is additive — no existing components need rewiring beyond: (1) extending `chat-types.ts` with new event variants, (2) adding a stream-parsing layer in `pipeline.ts`'s `wireSessionEvents`, (3) adding `{ kind: "review" }` to `view-types.ts`, (4) extending `ChatPanelView` with an overlay slot, and (5) extending `SingleColumnView`/`AppShell` to handle the new ViewType.

The codebase already provides all necessary primitives: `BUDGET_COLORS` lookup for score coloring, `tw-animate-css` for slide-in animations, `skeleton.tsx` for loading state, the `SettingsView` accordion pattern for expandable rows, and the pure-function-extraction testing strategy used throughout Phase 7.

**Primary recommendation:** Build the stream interceptor as an injectable, testable pure function `parseStreamForModeEvents(text)` that returns structured events. Wire it inside `ClaudeProcessManager.sendMessage` stdout handler, before the NDJSON parser. All new UI components follow the established `FooView` (pure) + `Foo` (stateful) split.

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x (Bun bundled) | Component rendering | Project standard |
| tw-animate-css | installed Phase 7 | Slide-in, fade-in classes (`animate-in`, `slide-in-from-right`) | Used for micro-interactions Phase 7 |
| lucide-react | ^0.577.0 | Icons (ChevronDown, Check, X) | Project standard — already used throughout |
| Tailwind CSS | via bun-plugin-tailwind | Styling | Project standard |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `skeleton.tsx` | local | Loading skeleton UI | Between questions when Claude is processing |
| `bun:test` + direct function call pattern | Bun 1.3.10 | Unit tests | All new pure-function components |

### Not needed
- No new npm packages required. All animation primitives (`tw-animate-css`), icon sets (`lucide-react`), and UI patterns (accordion, overlay, drawer) exist in the codebase or via Tailwind utility classes.

**Count-up animation:** Implement with `useEffect` + `requestAnimationFrame` loop (no library needed — standard React pattern, well within 300ms at 16ms frames).

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── chat/
│   │   ├── ChatPanel.tsx          # EXTEND: add overlay slot to ChatPanelView
│   │   ├── QuestionCard.tsx       # NEW: pure render (QuestionCardView + QuestionCard)
│   │   └── DecisionLogDrawer.tsx  # NEW: pure render (DrawerView + DecisionLogDrawer)
│   └── views/
│       └── ReviewView.tsx         # NEW: pure render (ReviewView) — follows SettingsView
├── hooks/
│   └── useChatMode.ts             # NEW: manages discuss/review mode state from WS events
├── server/
│   └── mode-interceptor.ts        # NEW: pure XML parser for mode events from Claude stdout
└── lib/
    └── view-types.ts              # EXTEND: add { kind: "review" }
    └── chat-types.ts              # EXTEND: add new event variants
```

### Pattern 1: ViewType Extension for ReviewView
**What:** Add `{ kind: "review" }` to the discriminated union. `SingleColumnView` renders `ReviewView` in the new branch. `AppShell` or `useChatMode` toggles this when `review_mode_start` arrives.
**When to use:** Any view that replaces the chat panel entirely.

```typescript
// src/lib/view-types.ts — EXTEND
export type ViewType =
  | { kind: "chat" }
  | { kind: "milestone" }
  | { kind: "history" }
  | { kind: "settings" }
  | { kind: "assets" }
  | { kind: "review"; results: ReviewResults };  // NEW
```

```typescript
// src/components/layout/SingleColumnView.tsx — add branch
{activeView.kind === "review" && (
  <ReviewView results={activeView.results} onDismiss={() => setActiveView({ kind: "chat" })} onFix={handleFix} />
)}
```

### Pattern 2: Overlay Layer Inside ChatPanelView
**What:** `ChatPanelView` accepts an optional `overlay` slot. When `overlay` is non-null, it renders as an absolutely-positioned layer over the message list (messages visible but dimmed behind it).
**When to use:** Discuss mode — question card + decision log drawer both live inside this overlay layer.

```typescript
// ChatPanelView extended signature
interface ChatPanelViewProps {
  messages: ChatMessageType[];
  onSend: (message: string) => void;
  isProcessing: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  overlay?: React.ReactNode;   // NEW: renders over dimmed messages
}

// Inside ChatPanelView render:
<div className="flex flex-col h-full relative">
  <div className={cn("flex-1 overflow-y-auto", overlay && "opacity-30 pointer-events-none")} ref={scrollRef}>
    {/* messages */}
  </div>
  {overlay && (
    <div className="absolute inset-0 flex">
      {overlay}
    </div>
  )}
  {!overlay && <ChatInput onSend={onSend} disabled={isProcessing} />}
</div>
```

### Pattern 3: Stream Interceptor (Server-side Pure Function)
**What:** A pure function `parseStreamForModeEvents(text: string): ModeEvent[]` that scans a text chunk for XML mode markers. Called inside `ClaudeProcessManager`'s stdout handler before the NDJSON parser.
**When to use:** Detecting `<discuss_mode_start>`, `<question>`, `<decision>`, `<review_mode_start>`, and their closing tags.

Recommended XML schema (Claude's Discretion — proposed here):
```xml
<!-- Discuss mode start -->
<discuss_mode_start total="5" />

<!-- Question card event -->
<question id="1" area="Layout style" type="multiple_choice">
  Which layout do you prefer?
  <options>
    <option value="cards">Cards</option>
    <option value="list">List</option>
  </options>
</question>

<!-- Decision logged event -->
<decision question_id="1" area="Layout style" answer="cards" />

<!-- Discuss mode end -->
<discuss_mode_end />

<!-- Review mode start — review results embedded -->
<review_mode_start>
  <pillar name="Accessibility" score="7.2">
    <finding>CTA button lacks sufficient contrast</finding>
  </pillar>
  <!-- ... 5 more pillars ... -->
  <fix priority="1" pillar="Accessibility">Fix the contrast issues on CTA buttons</fix>
  <fix priority="2" pillar="Typography">Increase base font size to 16px</fix>
  <fix priority="3" pillar="Spacing">Add consistent 8pt grid padding to form elements</fix>
</review_mode_start>
```

```typescript
// src/server/mode-interceptor.ts
export interface ModeEvent {
  type:
    | "discuss_mode_start"
    | "question_card"
    | "decision_logged"
    | "discuss_mode_end"
    | "review_mode_start"
    | "review_mode_end";
  payload?: QuestionCardPayload | DecisionPayload | ReviewResults;
}

/** Pure function — testable without process mocking. */
export function parseStreamForModeEvents(text: string): {
  events: ModeEvent[];
  stripped: string;  // text with mode tags removed
} { /* ... */ }
```

### Pattern 4: useChatMode Hook
**What:** New hook that listens to WebSocket `mode_event` messages, maintains `discussState` and `reviewState`. Exposes `overlay` (React node to pass into `ChatPanelView`) and `reviewActive` flag.
**When to use:** `AppShell` (or `ChatView`) mounts this alongside `useSessionManager`.

```typescript
// src/hooks/useChatMode.ts
export interface ChatModeState {
  mode: "chat" | "discuss" | "review";
  currentQuestion: QuestionCardPayload | null;
  decisions: DecisionEntry[];
  reviewResults: ReviewResults | null;
}

export function useChatMode(ws: WebSocket | null): {
  chatModeState: ChatModeState;
  answerQuestion: (answer: string) => void;
  dismissReview: () => void;
}
```

### Pattern 5: Count-Up Animation (ReviewView)
**What:** `useEffect` + `requestAnimationFrame` loop interpolates from 0 to target score over ~600ms. Each pillar has its own animated value.
**When to use:** `ReviewView` mount only — fires once, no re-trigger needed.

```typescript
// Inside ReviewView component
function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const frame = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round(progress * target * 10) / 10);
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
```

### Pattern 6: Accordion for Pillar Row Expansion
**What:** Same accordion pattern as `SettingsView` Section component — ChevronDown/ChevronRight toggle, local `open` state per pillar.
**When to use:** Each of the 6 pillar rows in `ReviewView`.

### Anti-Patterns to Avoid
- **Storing decisions in UI state across sessions:** Decisions are ephemeral in UI; CONTEXT.md is the source of truth. Do not persist `DecisionEntry[]` to localStorage or session file.
- **Intercepting NDJSON before stripping mode tags:** Mode XML will appear inside `text_delta` events. The interceptor must scan raw stdout text, strip XML before the NDJSON parser sees it, or operate on the concatenated text content extracted from NDJSON. Strip mode tags from the forwarded chat stream so they never appear in the chat message list.
- **Simultaneous streaming + question card:** CONTEXT.md decision is clear — flush current streaming message to `streaming: false` before emitting the question card event.
- **Routing mode events through planning-state WebSocket topic:** Mode events are chat-scoped (per-session), not planning-state. Use the existing `chat` topic / `sendToClient` path, not `broadcast()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Score color thresholds | Custom color logic | `BUDGET_COLORS` pattern (new `SCORE_COLORS` lookup) | Established pattern avoids magic numbers, already tested |
| Slide-in animations | Custom CSS keyframes | `tw-animate-css` classes: `animate-in slide-in-from-right duration-200` | Already installed Phase 7, consistent with micro-interactions |
| Accordion expand/collapse | Custom animation | Tailwind conditional height + ChevronDown toggle (exact SettingsView pattern) | Already implemented, no new code |
| Loading state between questions | Custom skeleton | `skeleton.tsx` component | Existing, tested |
| XML parsing edge cases | Full XML parser library | Simple regex extraction for known fixed schema | The schema is controlled; a full XML parser (e.g., `fast-xml-parser`) adds weight for no benefit |

**Key insight:** The entire visual vocabulary already exists — navy overlay with opacity, cyan accent for active/answers, amber for processing, the accordion shape from SettingsView. This phase is primarily wiring known primitives into new compositions.

---

## Common Pitfalls

### Pitfall 1: Mode Tags Appearing in Chat History
**What goes wrong:** If XML mode markers are not stripped from the stream before forwarding to the client, they appear as raw text in the chat message list (e.g., `<question id="1"...>`).
**Why it happens:** The NDJSON parser extracts `text_delta` content from stream events, then forwards the assembled string to the client. Mode tags live inside `text_delta` deltas.
**How to avoid:** The interceptor must operate on raw stdout text chunks before the NDJSON parser, OR post-process the assembled `text_delta` content to strip mode-tag patterns. The cleanest approach: scan each `text_delta` chunk for mode tag patterns, strip them, emit mode events via `wsServer.sendToClient`, pass the cleaned text to the NDJSON pipeline.
**Warning signs:** Chat messages contain `<question` or `<review_mode_start` text.

### Pitfall 2: Session-ID Scoping for Mode Events
**What goes wrong:** Mode events broadcast to all clients (via `publishChat`) instead of only the session that triggered discuss/review mode. Another session's user sees a question card appearing.
**Why it happens:** Using `wsServer.publishChat()` sends to all clients on the `chat` topic.
**How to avoid:** Use `wsServer.sendToClient(session.activeClient, modeEvent)` — same pattern as `chat_event` forwarding in `wireSessionEvents`. Mode events are per-session, not global.
**Warning signs:** Question cards appear in sessions that didn't run `/gsd:discuss-phase`.

### Pitfall 3: ViewType Passing ReviewResults
**What goes wrong:** `ReviewResults` is a potentially large object. If stored in `ViewType` (which is in `AppShell` state), it may cause unnecessary re-renders of unrelated views.
**Why it happens:** `ViewType` is passed through `AppShell` → `SingleColumnView` → all view branches.
**How to avoid:** Store `reviewResults` in `useChatMode` state, not in `ViewType`. Pass them to `ReviewView` via direct prop from `AppShell`/`ChatView`. `ViewType` can be just `{ kind: "review" }` (no payload) — `ReviewView` reads results from the hook.
**Warning signs:** Milestone panel re-renders when review results update.

### Pitfall 4: Partial XML at Buffer Boundary
**What goes wrong:** A mode tag like `<question id="1" area="Layout` is split across two stdout chunks. The interceptor reads two incomplete chunks, misses the tag.
**Why it happens:** `proc.stdout.on("data", ...)` fires per chunk, not per complete XML element.
**How to avoid:** Maintain a running buffer string in the interceptor. Scan for opening `<` of known mode tags; if a potential match is open but not closed in the current buffer, defer processing until the next chunk (append to buffer, re-scan). This is the same buffering logic as the NDJSON parser (`createNdjsonParser` already does line-buffering).
**Warning signs:** Intermittent missing question cards or malformed event payloads.

### Pitfall 5: Count-Up Jank from requestAnimationFrame in Tests
**What goes wrong:** Tests that call `ReviewView` as a pure function get errors because `requestAnimationFrame` is not available in Bun's test environment.
**Why it happens:** `useCountUp` uses `requestAnimationFrame`, which is a browser API.
**How to avoid:** Extract `ReviewView` as a pure render function (`ReviewView(props)` — no hooks) and a stateful wrapper (`ReviewViewWithAnimation`) that owns the count-up logic. Test the pure render function directly (existing pattern). `requestAnimationFrame` only lives in the stateful wrapper.
**Warning signs:** Test failures with `requestAnimationFrame is not defined`.

### Pitfall 6: Discuss Overlay Blocking Keyboard Input
**What goes wrong:** The question card overlay has `pointer-events-none` in the wrong place, preventing the answer input/buttons from receiving clicks.
**Why it happens:** `opacity-30 pointer-events-none` should be on the message list (behind the overlay), NOT on the overlay container.
**How to avoid:** Only apply `pointer-events-none` to the dimmed messages div. The overlay div must have default pointer-events (clickable). Verify in manual test: clicking "Cards" button in question card registers a state change.
**Warning signs:** Button group clicks have no effect in discuss mode.

---

## Code Examples

### Extending chat-types.ts with Mode Events
```typescript
// Additions to src/server/chat-types.ts

export interface QuestionCardPayload {
  id: string;
  area: string;             // e.g., "Layout style"
  type: "multiple_choice" | "free_text";
  question: string;
  options?: Array<{ value: string; label: string }>;
  questionNumber: number;   // 1-based
  totalQuestions: number;
}

export interface DecisionEntry {
  questionId: string;
  area: string;
  answer: string;
}

export interface PillarScore {
  name: string;            // e.g., "Accessibility"
  score: number;           // 0–10
  findings: string[];
}

export interface FixAction {
  priority: number;        // 1, 2, 3
  pillar: string;
  description: string;
  draftMessage: string;   // pre-drafted message sent on "Fix" click
}

export interface ReviewResults {
  pillars: PillarScore[];
  topFixes: FixAction[];
}

export type ModeEventType =
  | "discuss_mode_start"
  | "question_card"
  | "decision_logged"
  | "discuss_mode_end"
  | "review_mode_start"
  | "review_mode_end";

export interface ModeEvent {
  type: ModeEventType;
  sessionId?: string;
  // Polymorphic payload
  question?: QuestionCardPayload;
  decision?: DecisionEntry;
  results?: ReviewResults;
}
```

### Score Color Lookup (new SCORE_COLORS)
```typescript
// Follows BUDGET_COLORS pattern from TaskExecuting.tsx
const SCORE_COLORS = {
  green: { bar: "bg-status-success", text: "text-status-success" },
  amber: { bar: "bg-status-warning", text: "text-status-warning" },
  red:   { bar: "bg-status-error",   text: "text-status-error" },
} as const;

function getScoreColor(score: number): keyof typeof SCORE_COLORS {
  if (score >= 8.0) return "green";
  if (score >= 5.0) return "amber";
  return "red";
}
```

### QuestionCard Pure Render
```typescript
// src/components/chat/QuestionCard.tsx (pure render portion)
interface QuestionCardViewProps {
  question: QuestionCardPayload;
  selectedAnswer: string | null;
  freeTextValue: string;
  confirming: boolean;
  onSelectOption: (value: string) => void;
  onConfirm: () => void;
  onFreeTextChange: (value: string) => void;
  onFreeTextSubmit: () => void;
}

export function QuestionCardView({ question, selectedAnswer, confirming, onSelectOption, onConfirm, freeTextValue, onFreeTextChange, onFreeTextSubmit }: QuestionCardViewProps) {
  return (
    <div className="animate-in slide-in-from-bottom duration-200 flex flex-col gap-4 rounded-xl bg-navy-800 border border-cyan-accent/30 p-6 m-4 shadow-lg">
      {/* Header: progress + area */}
      <div className="flex items-center justify-between">
        <span className="font-display text-xs uppercase tracking-wider text-slate-400">{question.area}</span>
        <span className="font-mono text-xs text-slate-500">Question {question.questionNumber} of {question.totalQuestions}</span>
      </div>
      {/* Question text */}
      <p className="font-mono text-sm text-slate-200">{question.question}</p>
      {/* Answer controls */}
      {question.type === "multiple_choice" && (
        <div className="flex flex-col gap-2">
          {question.options?.map((opt) => (
            <button key={opt.value} type="button"
              onClick={() => onSelectOption(opt.value)}
              className={cn("rounded-lg border px-4 py-2 text-sm font-mono text-left transition-colors",
                selectedAnswer === opt.value
                  ? "border-cyan-accent bg-cyan-accent/10 text-cyan-accent"
                  : "border-navy-600 text-slate-300 hover:border-cyan-accent/50"
              )}>
              {opt.label}
            </button>
          ))}
          {selectedAnswer && (
            <button type="button" onClick={onConfirm}
              className="mt-2 rounded-lg bg-cyan-accent px-4 py-2 text-sm font-mono text-navy-base font-bold">
              Confirm
            </button>
          )}
        </div>
      )}
      {question.type === "free_text" && (
        <div className="flex flex-col gap-2">
          <input type="text" value={freeTextValue} onChange={(e) => onFreeTextChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && freeTextValue.trim() && onFreeTextSubmit()}
            className="rounded-lg bg-navy-900 border border-navy-600 px-4 py-2 text-sm font-mono text-slate-200 focus:border-cyan-accent/50 outline-none" />
          <button type="button" disabled={!freeTextValue.trim()} onClick={onFreeTextSubmit}
            className="rounded-lg bg-cyan-accent px-4 py-2 text-sm font-mono text-navy-base font-bold disabled:opacity-40">
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
```

### Pipeline Wire-up (mode-interceptor integration point)
```typescript
// Inside wireSessionEvents in pipeline.ts — stream text delta interception
// (Pseudo-code showing where the interceptor hooks in)
session.processManager.onEvent((event: unknown) => {
  const ev = event as StreamEvent & { error?: string };

  // Intercept text_delta events for mode markers BEFORE forwarding
  if (ev.type === "stream_event" && ev.event?.type === "content_block_delta"
      && ev.event.delta?.type === "text_delta" && ev.event.delta.text) {
    const { events: modeEvents, stripped } = parseStreamForModeEvents(ev.event.delta.text);
    // Broadcast mode events to this session's client
    for (const modeEvent of modeEvents) {
      if (session.activeClient) {
        wsServer.sendToClient(session.activeClient, { ...modeEvent, sessionId: session.id });
      }
    }
    // Replace text with stripped version
    if (modeEvents.length > 0 && stripped.trim() === "") return; // suppress empty delta
    if (stripped !== ev.event.delta.text) {
      ev.event.delta.text = stripped;
    }
  }

  // ... rest of existing forwarding logic
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tab-based navigation | ViewType discriminated union + SingleColumnView | Phase 6.2 | ReviewView gets its own ViewType variant cleanly |
| Single-session chat | Multi-session SessionManager | Phase 6.3 | Mode events must be session-scoped via `sendToClient` |
| Custom scroll management | Pure render + stateful wrapper split | Phase 6 | QuestionCard and ReviewView follow this; hooks live in wrappers |
| Remotion for animations | tw-animate-css + CSS keyframes | Phase 7 | Slide-in/count-up uses this existing stack |

**Deprecated/outdated:**
- `useChat` hook: marked `@deprecated`, replaced by `useSessionManager`. `useChatMode` should NOT wrap `useChat`.

---

## Open Questions

1. **How does the stream interceptor know a question block is complete vs partial?**
   - What we know: Stdout arrives in chunks; XML may span multiple chunks
   - What's unclear: Whether the GSD discuss-phase workflow emits each question as a single complete XML block in one Claude output, or incrementally
   - Recommendation: Buffer approach (accumulate until closing tag found). The GSD `discuss-phase.md` uses `AskUserQuestion` tool — which emits complete structured output per call. The stream interceptor will likely see complete XML blocks in practice, but buffer defensively.

2. **Where exactly does `/gsd:ui-review` write its structured output?**
   - What we know: `ui-review` is a GSD command; no `ui-review.md` workflow file was found in the codebase
   - What's unclear: Whether it writes to a file (like CONTEXT.md) or emits XML to stdout
   - Recommendation: Design the review mode as if Claude emits `<review_mode_start>...</review_mode_start>` to stdout (consistent with discuss mode). If it instead writes a file, the server file watcher can trigger the event instead.

3. **Should `useChatMode` live in `AppShell` or inside `ChatView`?**
   - What we know: `AppShell` owns `ViewType` state; `ChatView` owns the chat-specific layout
   - What's unclear: Whether discuss mode overlay needs to affect anything outside `ChatView` bounds
   - Recommendation: `useChatMode` in `AppShell` (sibling to `useSessionManager`) because it needs to trigger `ViewType` switch for review mode, and the overlay needs `onChatSend` which also lives at `AppShell` level.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test 1.3.10 (built-in) |
| Config file | `bunfig.toml` — `[serve.static]` / `plugins = ["bun-plugin-tailwind"]` |
| Quick run command | `cd packages/mission-control && bun test tests/discuss-review.test.tsx --timeout 5000` |
| Full suite command | `cd packages/mission-control && bun test tests/ --timeout 10000` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-01 | `parseStreamForModeEvents` detects `<discuss_mode_start>` and strips from forwarded text | unit | `bun test tests/mode-interceptor.test.ts` | ❌ Wave 0 |
| DISC-02 | `QuestionCardView` renders question text prominently | unit | `bun test tests/discuss-review.test.tsx` | ❌ Wave 0 |
| DISC-03 | `QuestionCardView` renders button group for `type: "multiple_choice"` | unit | `bun test tests/discuss-review.test.tsx` | ❌ Wave 0 |
| DISC-04 | `QuestionCardView` renders text input for `type: "free_text"` | unit | `bun test tests/discuss-review.test.tsx` | ❌ Wave 0 |
| DISC-05 | `QuestionCardView` renders "Question N of M" label from payload | unit | `bun test tests/discuss-review.test.tsx` | ❌ Wave 0 |
| DISC-06 | `DecisionLogDrawer` renders decision entries in key-value format | unit | `bun test tests/discuss-review.test.tsx` | ❌ Wave 0 |
| REVW-01 | `view-types.ts` includes `{ kind: "review" }` variant | unit | `bun test tests/discuss-review.test.tsx` | ❌ Wave 0 |
| REVW-02 | `ReviewView` renders pillar scores with color-coded bars | unit | `bun test tests/discuss-review.test.tsx` | ❌ Wave 0 |
| REVW-03 | Pillar row toggles open/closed on click | unit | `bun test tests/discuss-review.test.tsx` | ❌ Wave 0 |
| REVW-04 | `FixCard` renders description and Fix button; click fires `onFix` callback | unit | `bun test tests/discuss-review.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/mission-control && bun test tests/discuss-review.test.tsx tests/mode-interceptor.test.ts --timeout 5000`
- **Per wave merge:** `cd packages/mission-control && bun test tests/ --timeout 10000`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/discuss-review.test.tsx` — covers DISC-02 through DISC-06, REVW-01 through REVW-04
- [ ] `tests/mode-interceptor.test.ts` — covers DISC-01 (pure function tests for `parseStreamForModeEvents`)
- Framework install: none needed — `bun test` already works

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read: `packages/mission-control/src/` — all referenced files verified by source inspection
  - `chat-types.ts` — existing event types confirmed
  - `view-types.ts` — ViewType discriminated union confirmed
  - `pipeline.ts` — `wireSessionEvents` hook point confirmed
  - `ws-server.ts` — `sendToClient` vs `publishChat` routing confirmed
  - `ChatPanel.tsx` — `ChatPanelView` pure render split confirmed
  - `TaskExecuting.tsx` — `BUDGET_COLORS` pattern confirmed
  - `animations.css` — `tw-animate-css` usage confirmed
  - `SettingsView.tsx` — accordion Section pattern confirmed
  - `SingleColumnView.tsx` — ViewType routing confirmed
  - `useSessionManager.ts` — session-scoped message routing confirmed
  - `claude-process.ts` — stdout `data` event handler location confirmed
- `commands/gsd/discuss-phase.md` — `AskUserQuestion` tool usage confirmed (structured output)
- `get-shit-done/workflows/discuss-phase.md` — XML tag format is Claude's discretion (confirmed by CONTEXT.md)

### Secondary (MEDIUM confidence)
- `tw-animate-css` slide-in class names: verified present in Phase 7 component code (`slide-in-from-bottom` in ChatMessage.tsx, `slide-in-from-right` pattern from tw-animate-css standard class list)
- Bun test 1.3.10 pure-function pattern: confirmed via `animations.test.tsx` and multiple other test files using `JSON.stringify(ComponentFn(props))` inspection

### Tertiary (LOW confidence)
- Count-up via `requestAnimationFrame` approach: standard React pattern, not project-specific. Confident this works in browser but not verified in this exact codebase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed installed and in use
- Architecture: HIGH — all patterns directly observed in source code
- Stream interceptor integration point: HIGH — `wireSessionEvents` in `pipeline.ts` is the exact hook point
- XML schema: MEDIUM — schema proposed (Claude's Discretion per CONTEXT.md), consistent with GSD's AskUserQuestion output format
- Pitfalls: HIGH — derived from observed code patterns and common React overlay anti-patterns

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (30 days — stable stack, no fast-moving dependencies)
