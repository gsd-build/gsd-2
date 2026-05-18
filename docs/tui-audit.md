# TUI Audit — Findings & Fix Plan

Audit date: 2026-05-18. Scope: `packages/pi-tui` (render engine) and
`packages/pi-coding-agent/src/modes/interactive` (components, theme, orchestration).
Assumption going in: everything is broken until proven otherwise.

---

## Executive summary

The TUI works, but it is not *one* TUI — it is three visual languages stacked
on two-and-a-half style frameworks, with a render engine that silently caches
stale output in two places. The most damaging issues are not crashes; they are
**stale-render bugs** (theme switch doesn't repaint), **width overflow** (lines
exceed the terminal and wrap, breaking borders), and **no shared design system**
(every component reinvents borders, padding, and keyboard hints).

Headline problems:

1. **No single design language.** Messages render in three incompatible
   container styles; two separate style frameworks (`style.ts`,
   `tui-style-kit.ts`) plus a third hand-rolled inline in `chat-frame.ts` /
   `transcript-design.ts`.
2. **Two stale-render bugs in the core** (`tui.ts`) — `Container.invalidate()`
   and the render short-circuit both serve cached output that is wrong.
3. **Width discipline is not enforced** — many `render()` paths emit lines that
   can exceed `width`; `compositeLineAt` papers over it with defensive
   truncation that silently drops content.
4. **Timer hygiene is inconsistent** — several `setInterval`/`setTimeout` have
   no cleanup path if a component is abandoned without `dispose()`.

---

## Part 1 — Findings

Severity: **P0** broken (visible corruption / crash) · **P1** risky (latent
bug, overflow, leak) · **P2** design smell / inconsistency · **P3** dead code.

### P0 — Broken

| # | Location | Problem |
|---|----------|---------|
| B1 | `pi-tui/src/components/select-list.ts:154,178` | Empty filtered list lets `selectedIndex` reach `-1`; `notifySelectionChange()` then reads `filteredItems[-1]` → `undefined`. In-flight key events corrupt state. |
| B2 | `pi-tui/src/tui.ts:212-232` | `Container.invalidate()` never clears `_prevRender`. Children that change after invalidate (theme switch, dynamic content) return the **stale cached array by reference** — updates silently dropped. |
| B3 | `pi-tui/src/tui.ts:654-659` | Render short-circuit skips `applyLineResets()` / cursor extraction. When overlays were shown last frame but hidden now, a stale `CURSOR_MARKER` corrupts cursor positioning. |
| B4 | `components/daxnuts.ts:34,37` | Hardcoded truecolor RGB escapes (`\x1b[38;2;…`). Renders garbage on 256/16-color terminals (containers, remote SSH, Apple Terminal). |
| B5 | `components/user-message.ts:9-10` | Raw OSC 133 shell-integration escapes injected into render output — bypasses theme, cannot be disabled for incompatible terminals. |
| B6 | `components/bash-execution.ts:221` | Inline component `{ render: () => visualLines }` ignores the `width` param — pre-rendered lines cannot reflow on resize. |
| B7 | `pi-tui/src/components/markdown.ts:543,556` | Nested-list detection regex hardcodes `\x1b[36m` (cyan bullet). Any theme with a different bullet color silently breaks nested-list formatting. |
| B8 | `pi-tui/src/components/input.ts:339` | `yankPop()` does `cursor -= prevText.length` with no floor — cursor goes negative, breaking subsequent edits. |
| B9 | `interactive-mode.ts:4298` | `onThemeChange(() => {})` *adds* an empty listener instead of calling the unsubscriber — leaks theme-change subscribers. |
| B10 | `pi-tui/src/fuzzy.ts:30-31` | String indexing (`textLower[i]`) uses UTF-16 code units, not graphemes — emoji/CJK matching is wrong. |
| B11 | `components/theme-selector.ts` | `SelectList` is built once with `getSelectListTheme()` in the constructor; its color fns never update, so the selector renders stale colors during live theme preview. |

### P1 — Risky: width overflow (line can exceed `width` → wrap → broken border)

- `components/session-selector.ts:855` — rename-dialog hint, hardcoded padding `(1,0)`, no truncate.
- `components/session-selector.ts:1017` — `cwd` line not truncated.
- `components/tree-selector.ts:1122` — `"  Session Tree"` header not truncated.
- `components/model-selector.ts:520,522` — group/item lines from `theme.fg()` chains, no truncate.
- `components/config-selector.ts:334,338,345` — group/subgroup headers + items, no truncate.
- `components/user-message-selector.ts:65-68,73-74` — metadata + scroll indicator, no truncate.
- `components/oauth-selector.ts:42,86,93` — `TruncatedText` created with no width param (defaults 0).
- `components/assistant-message.ts:177` / `user-message.ts:31` — metadata/timestamp never truncated.
- `components/adaptive-layout.ts:151` — `label.padEnd(8)` never truncates a long label → misaligned columns.
- `components/footer.ts:189-256` — multi-stage width math, no minimum guard; `pwdBudget` can collapse to 1 and silently eat the path.
- `pi-tui/src/components/box.ts:97` — adds `leftPad + line` without re-validating child width; a contract-violating child overflows the terminal.
- `pi-tui/src/components/markdown.ts:146-153` — wrap safety-net truncates lines that `wrapTextWithAnsi()` returned too wide; hides the wrap bug.
- `pi-tui/src/components/truncated-text.ts:52-54` — final padding assumes `truncateToWidth` never overshoots; no re-validation.
- `pi-tui/src/overlay-layout.ts:238-249` — `compositeLineAt` defensively truncates overlay content, **silently dropping characters** to mask upstream width drift.

### P1 — Risky: leaked / unguarded timers

- `components/session-selector.ts:59,121` — `statusTimeout` stored, never cleared in `dispose()`.
- `components/session-selector.ts:1140` — naked `setTimeout(onCancel, 100)` in constructor, no cleanup ref.
- `components/dynamic-border.ts:41` — `setInterval` cleared only in `stopSpinner()`; leaks if abandoned.
- `components/countdown-timer.ts:21` — `setInterval` cleared only in `dispose()`; no auto-cleanup fallback.
- `components/armin.ts:182` — `setInterval` cleared only in `dispose()`; also missing the `unref()` that `dynamic-border` has.
- `pi-tui/src/components/editor.ts:1026,2146` — debounce timers; `dispose()` clears only the last queued timer, no array tracking. Stale timer can fire on a replaced Editor instance.
- `pi-tui/src/terminal.ts:199` — Kitty-protocol fallback `setTimeout` fires unconditionally even after protocol is confirmed → double-initialization.

### P1 — Risky: input / paste

- `pi-tui/src/components/input.ts:436` — paste strips newlines but does no size validation; `pushUndo()` runs before any guard. A multi-megabyte single-line paste allocates unbounded and blocks the event loop.
- `pi-tui/src/components/editor.ts:1089-1099` — large-paste detection is a heuristic (>10 lines or >1000 chars); 9×200-char lines bypass it and can stall the render loop.

### P1 — Risky: other

- `pi-tui/src/components/markdown.ts:361` — replaces `\x1b[0m` with reset+quote-prefix; assumes all resets are `[0m`, can corrupt 256-color SGR state.
- `pi-tui/src/utils.ts:131-138` — `applyBackgroundToLine` pads *after* applying background; trailing wide char (emoji/CJK) misaligns the fill.
- `components/provider-manager.ts:207-212` — `authStorage.remove()` / `removeProvider()` / `refresh()` chain has no error handling — silent partial failure.
- `interactive-mode.ts:848-852,2336-2351` — `getMarkdownThemeWithSettings()` allocates a fresh theme object + closures per message render; should be cached per TUI instance.

### P2 — Design smell / inconsistency

**Three competing visual languages** a user sees in sequence:
- Rail-style — `assistant-message.ts` / `user-message.ts`, `┃` rail + bg fill (`transcript-design.ts:51`).
- Framed — `chat-frame.ts` / `transcript-design.ts`, rounded `╭╮╰╯` boxes.
- Box-background — `custom-message.ts` / `branch-summary-message.ts`, filled `Box`, no border.

**Two-and-a-half style frameworks:**
- `pi-tui/src/style.ts` — `TerminalStyle` builder.
- `components/tui-style-kit.ts` — `roundedPanel()` + `badge`/`keyValue`.
- Hand-rolled inline borders in `chat-frame.ts:16-88` and `transcript-design.ts:90-122` (third dialect, duplicated logic).

**No shared component patterns:**
- No `CollapsibleMessage` base — `custom-message`, `compaction-summary-message`, `skill-invocation-message`, `branch-summary-message` each re-implement `expanded` + `setExpanded()` + rebuild.
- No `AnimatedComponent` base — `armin.ts` and `daxnuts.ts` hand-roll identical `interval/tick/cachedLines/cachedVersion` machinery.
- Caching inconsistent — `armin`/`daxnuts` cache renders; `assistant-message`/`user-message`/`custom-message` rebuild every call.

**Keyboard / hints:**
- Convention drift — `scoped-models-selector.ts` mixes raw `Key.ctrl()` with `matchesKey()`; `extension-selector.ts:124,133,142` mixes `kb.matches()` with raw `keyData === "k"`; `extension-input.ts:78` raw `"\n"`; `custom-editor.ts:76` hardcoded `\x1b\r`.
- `tree-selector.ts:869` binds two key names to one action.
- Missing keyboard-hint footers — `theme-selector`, `thinking-selector`, `show-images-selector`, `oauth-selector`, `user-message-selector`.
- Hint styling invented per call-site — `keybinding-hints.ts` has a clean pattern; `footer.ts` ignores it.
- `tree-selector.ts:1125` hardcodes a `darwin` platform check for `⌥` vs `Alt`.
- `renderCursor()` helper (`tree-render-utils.ts:56`) exists but `oauth-selector.ts:56` / `user-message-selector.ts:56` duplicate it.

**Misc:**
- `login-dialog.ts:149` — hardcoded OSC 8 hyperlink escapes; bleed into output on no-color terminals.
- `theme-schema.ts:74-85` — semantic tokens optional with no validation that a fallback source exists.
- `themes.ts` — builtin themes hardcoded as JS objects; no JSON parity with custom themes.

### P3 — Dead code / cleanup

- `pi-tui/src/keys.ts:446,478` — `isKeyRepeat()` and `_lastEventType` set but never read.
- `pi-tui/src/tui.ts:995-1022` — `PI_TUI_DEBUG=1` writes full render state to `/tmp/tui/` every frame, no cleanup → fills disk.
- `components/timestamp.ts:4-11` — comment lists 4 formats, `TimestampFormat` exports 2; `usDate()` returns `MM-DD-YYYY` but comment claims `MM/DD/YYYY`.
- `components/tree-selector.ts:790-845` — `formatToolCall()` / `shortenPath()` duplicate helpers already in `tool-execution.ts`.
- `components/tool-execution.ts` (~1,500 lines) and `tree-selector.ts` (~1,100 lines) — monoliths, hard to navigate/test.

### Not covered (scope limits)

`kill-ring.ts`, `undo-stack.ts`, `autocomplete.ts` full lifecycle, `terminal-image.ts`
protocol matrix, and exhaustive width sweeps of every nested component. The
overflow list above is representative, not complete.

---

## Part 2 — Fix Plan

Five phases, ordered by risk-reduction per unit effort. Phases 0–1 are
independent bug fixes (ship piecemeal). Phases 2–3 are the structural work and
should be designed together before touching code.

### Phase 0 — Stop the bleeding (P0)

Independent, small, high-value fixes. Each is its own PR.

1. **B1** `select-list.ts` — clamp `selectedIndex` to `[0, len-1]`; guard
   `notifySelectionChange()` against empty list.
2. **B2** `tui.ts` `Container.invalidate()` — clear `_prevRender` (and
   `_prevWidth`) so children re-render. Add a regression test: theme switch
   repaints a `Container`.
3. **B3** `tui.ts` render short-circuit — always run `applyLineResets()` /
   cursor extraction, or invalidate the short-circuit when overlay state
   changed since last frame.
4. **B4** `daxnuts.ts` — replace RGB escapes with `theme.fg()` tokens.
5. **B5** `user-message.ts` — gate OSC 133 emission behind a terminal-capability
   check (or move it out of `render()` into a one-time terminal setup).
6. **B6** `bash-execution.ts:221` — make the inline component honor `width`
   (re-render `visualLines` from the `width` arg, not constructor-time).
7. **B7** `markdown.ts` — detect nested lists via parser metadata / an explicit
   depth flag, not an ANSI-color regex.
8. **B8** `input.ts:339` — `cursor = Math.max(0, cursor - prevText.length)`.
9. **B9** `interactive-mode.ts:4298` — store the `onThemeChange` unsubscriber
   and call it on shutdown.
10. **B10** `fuzzy.ts` — segment with `Intl.Segmenter` (or at minimum
    `Array.from(str)`) instead of code-unit indexing.
11. **B11** `theme-selector.ts` — rebuild / re-theme the `SelectList` on theme
    change (override `invalidate()`).

Exit criteria: theme switch fully repaints; no `undefined` selection crash;
no RGB-only output; markdown nested lists survive a non-cyan theme.

### Phase 1 — Width discipline & timer hygiene (P1)

12. **Width sweep.** Add a dev-mode assertion in `tui.ts`: in `PI_TUI_DEBUG`,
    warn (with component name + line) whenever a `render()` line exceeds
    `width`. Run it, then fix every hit — start with the listed offenders
    (`session-selector`, `tree-selector`, `model-selector`, `config-selector`,
    `user-message-selector`, `oauth-selector`, `assistant-message`,
    `user-message`, `adaptive-layout`, `footer`, `box.ts`). Rule:
    **every line returned from `render()` passes through `truncateToWidth`.**
13. **`markdown.ts` wrap bug.** Fix `wrapTextWithAnsi()` so the safety-net
    truncation at `146-153` is never needed; if it triggers, log loud.
14. **`compositeLineAt`** — keep the defensive truncation but log a warning
    when it fires, so masked width bugs surface instead of hiding.
15. **Timer hygiene pass.** Every `setInterval`/`setTimeout` gets a tracked
    handle, cleared in `dispose()`; `dispose()` is idempotent. Audit
    `session-selector`, `dynamic-border`, `countdown-timer`, `armin`,
    `editor` (track timers in a set), `terminal.ts` (cancel Kitty fallback
    once protocol confirmed). Add `unref()` consistently.
16. **Paste bounds.** `input.ts` / `editor.ts` — cap paste size, validate
    before `pushUndo()`, coalesce large pastes into a single undo entry.
17. **`provider-manager.ts:207-212`** — wrap the remove/refresh chain in
    try/catch with user-visible error reporting.
18. **`utils.ts` `applyBackgroundToLine`** — pad before applying background.
    Add CJK/emoji test cases.

### Phase 2 — One style system (the big one)

**Design before code.** Pick a winner and delete the rest.

19. Choose the canonical framework. Recommendation: keep **one** —
    `pi-tui/src/style.ts` `TerminalStyle` is lower-level and lives in the
    engine; `tui-style-kit.ts` is the app-level vocabulary. Either make
    `tui-style-kit` the only public surface (built on `style.ts`), or fold
    them. Do **not** keep both.
20. Delete the third dialect: route `chat-frame.ts` and
    `transcript-design.ts` border rendering through the chosen framework.
21. Commit to **one container style** for transcript messages (rail *or*
    frame *or* box — not all three). Document the decision in an ADR
    (`docs/adr/`), since CLAUDE.md asks for decision records on architectural
    changes.
22. Unify keyboard hints: one `keyHint()`-based footer helper, used by every
    selector and the footer. Add the missing hint footers (`theme-selector`,
    `thinking-selector`, `show-images-selector`, `oauth-selector`,
    `user-message-selector`).
23. Standardize keyboard handling on `matchesKey()` / `kb.matches()` — remove
    raw `keyData === "k"` / `"\n"` / `\x1b\r` comparisons.

### Phase 3 — Shared component patterns

24. Extract `CollapsibleMessage` base — `expanded` state, `setExpanded()`,
    rebuild + cache. Migrate `custom-message`, `compaction-summary-message`,
    `skill-invocation-message`, `branch-summary-message`.
25. Extract `AnimatedComponent` base — interval lifecycle, tick, cache,
    guaranteed `dispose()`. Migrate `armin`, `daxnuts`, and reuse for
    `dynamic-border` / `countdown-timer` spinners.
26. Make render caching uniform — message components cache like `armin`
    already does (`cachedLines`/`cachedWidth`/`cachedVersion`), rebuild only
    on state or width change.
27. Use `renderCursor()` from `tree-render-utils.ts` everywhere a cursor is
    drawn (`oauth-selector`, `user-message-selector`).

### Phase 4 — Cleanup

28. Delete dead code: `keys.ts` `isKeyRepeat()`/`_lastEventType`.
29. `tui.ts` debug logging — circular buffer or TTL on `/tmp/tui/` files.
30. `timestamp.ts` — fix the format/comment mismatch, drop unreachable types.
31. De-dup `formatToolCall()`/`shortenPath()` into one shared util.
32. Cache `getMarkdownThemeWithSettings()` per TUI instance.
33. (Optional) Split the `tool-execution.ts` / `tree-selector.ts` monoliths
    into focused modules.

### Suggested sequencing

- **Phases 0 + 1** can ship now, in parallel, as small PRs — no design needed.
- **Phase 2** needs a decision (the ADR) before any code. It is the single
  highest-leverage change for "feels crafted" and will touch many files —
  treat it as one focused effort, not drive-by edits.
- **Phase 3** depends on Phase 2's chosen style system.
- **Phase 4** anytime; lowest risk.

---

## Recommended first step

Ship **Phase 0** as ~11 small PRs (or one batched PR). B2 and B3 are the most
important — they are why theme switches and overlays leave stale pixels on
screen, and they affect every component regardless of later redesign work.
