# Phase 10: Keyboard Shortcuts + Accessibility - Research

**Researched:** 2026-03-12
**Domain:** React accessibility, keyboard navigation, command palette, WCAG 2.1
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KEYS-01 | Command palette via Ctrl+Shift+P with GSD command search | cmdk library + keydown listener on window; GSD_COMMANDS already in slash-commands.ts |
| KEYS-02 | Panel focus switching via keyboard shortcuts with visible focus indicators | useKeyboardNav hook + CSS focus-visible ring; ViewType discriminated union already switchable |
| KEYS-03 | One h1 per view, logical heading hierarchy throughout | Audit current views (none have h1 except OnboardingScreen x2); promote per-view headings; demote h2→h3 in sub-components |
| KEYS-04 | All interactive elements have accessible names | aria-label / aria-labelledby audit; icon-only buttons currently missing labels in Sidebar |
| KEYS-05 | Minimum 44px touch targets on all interactive elements | min-h-[44px] min-w-[44px] or padding audit; Tailwind utilities sufficient, no new library needed |
| KEYS-06 | Focus managed on panel transitions (no focus traps, no lost focus) | useRef + focus() call after ViewType switch in SingleColumnView; modal close restores trigger focus |
</phase_requirements>

---

## Summary

Phase 10 is a polish/compliance phase that adds keyboard navigation infrastructure and corrects accessibility deficits across the existing component tree. The codebase is already in React 19 with Tailwind CSS 4 and has no third-party accessibility helpers. The work splits into three distinct tracks: (1) command palette — a new modal UI component driven by the existing `GSD_COMMANDS` / `getAllCommands()` registry; (2) heading hierarchy and ARIA name audit — fixing missing `h1` elements per view and unlabelled icon buttons; and (3) focus management — ensuring keyboard focus moves correctly on panel transitions and modal open/close.

The standard library for command palette in React is `cmdk` (pacocoursey), which provides unstyled, ARIA-complete combobox primitives and integrates cleanly with Tailwind. It depends on Radix UI Dialog for elevated rendering. The project already uses `lucide-react` and Tailwind so no surprising new surface area is introduced. All interactive elements can meet the 44px touch target rule with Tailwind utilities alone — no additional library is needed.

The most common pitfall is incorrect heading level promotion. Currently `OnboardingScreen` has two `h1` elements and all main views use `h2` for their primary title. Each rendered view must have exactly one `h1`; sub-panel headings should cascade from `h2` down.

**Primary recommendation:** Install `cmdk` for the command palette. Write a `useCommandPalette` hook that handles the Ctrl+Shift+P binding. Fix heading hierarchy view-by-view. Patch icon-only buttons with `aria-label`. Add focus management to `SingleColumnView` view transitions and all modal open/close sequences.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| cmdk | ^1.x (latest) | Headless command palette primitives — ARIA combobox, keyboard nav, fuzzy filter | De-facto React command palette; used by Vercel, Linear, shadcn/ui |
| @radix-ui/react-dialog | ^1.x (peer via cmdk) | Portal + focus trap for Command.Dialog | Already used transitively if cmdk Dialog variant chosen |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | Touch targets, heading levels, aria-label, focus management | All achievable with Tailwind + native React; no additional runtime lib needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cmdk | hand-rolled combobox | ARIA combobox is notoriously complex (expanded, activedescendant, listbox roles). cmdk solves it correctly. Don't hand-roll. |
| cmdk | react-command-palette | Older library, less maintained, heavier. cmdk is the community standard. |
| Radix Dialog (via cmdk) | native `<dialog>` | Native dialog has inconsistent focus trap across browsers. Radix is safer. |

**Installation:**
```bash
cd packages/mission-control && bun add cmdk
```

Note: cmdk pulls in `@radix-ui/react-dialog` as a peer dependency. Verify it installs automatically; if not: `bun add @radix-ui/react-dialog`.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   └── command-palette/
│       ├── CommandPalette.tsx          # cmdk Command.Dialog wrapper, styled
│       └── CommandPaletteItem.tsx      # Single result row (optional extract)
├── hooks/
│   └── useCommandPalette.ts           # open state + Ctrl+Shift+P binding
└── lib/
    └── slash-commands.ts              # EXISTING — getAllCommands() already defined
```

### Pattern 1: Command Palette Hook (pure function extraction)

**What:** Extract the keyboard binding predicate as a testable pure function, matching the project's established pattern (`shouldTogglePreview`, `shouldPulseOnTaskChange`).
**When to use:** Every keyboard binding in this project uses this pattern.
**Example:**
```typescript
// src/hooks/useCommandPalette.ts
export function shouldOpenCommandPalette(e: KeyboardEvent): boolean {
  // Ctrl+Shift+P on Windows/Linux; Cmd+Shift+P on macOS
  return (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P";
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (shouldOpenCommandPalette(e)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  return { open, setOpen };
}
```

**Key note on key value:** `e.key === "P"` (uppercase) because Shift is held. Contrast with `usePreview` which checks `e.key === "p"` (lowercase, no Shift). The existing decision log warns: "shouldTogglePreview checks e.key === 'p' lowercase only — Cmd+Shift+P with uppercase P does not trigger" — this is exactly the inverse case for KEYS-01.

### Pattern 2: CommandPalette Component with cmdk

**What:** Wrap `cmdk`'s `Command.Dialog` + `Command.Input` + `Command.List` with project styling.
**When to use:** `open` from `useCommandPalette` is true.
**Example:**
```typescript
// src/components/command-palette/CommandPalette.tsx
import { Command } from "cmdk";
import { getAllCommands } from "@/lib/slash-commands";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const commands = getAllCommands();
  return (
    <Command.Dialog open={open} onOpenChange={(v) => !v && onClose()}
      label="GSD Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
    >
      <div className="w-full max-w-lg rounded border border-navy-600 bg-navy-900 shadow-2xl">
        <Command.Input
          placeholder="Search GSD commands..."
          className="w-full border-b border-navy-600 bg-transparent px-4 py-3 font-mono text-sm text-slate-200 outline-none placeholder:text-slate-500"
        />
        <Command.List className="max-h-72 overflow-y-auto py-2">
          <Command.Empty className="px-4 py-3 text-sm text-slate-500">
            No commands found.
          </Command.Empty>
          {commands.map((cmd) => (
            <Command.Item
              key={cmd.command}
              value={cmd.command}
              onSelect={() => { /* inject into chat input or run */ onClose(); }}
              className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm text-slate-300
                         data-[selected=true]:bg-navy-700 data-[selected=true]:text-cyan-accent"
            >
              <span className="font-mono text-cyan-accent">{cmd.command}</span>
              <span className="text-slate-500">{cmd.description}</span>
            </Command.Item>
          ))}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
```

### Pattern 3: Heading Hierarchy Fix (per view)

**What:** Each `ViewType` variant must have exactly one `h1`. Sub-panel headings cascade `h2 → h3 → h4`.
**Current state audit:**
- `OnboardingScreen`: TWO `h1` elements — one must become `h2`
- `ChatView`: no heading element at all — needs `h1` (visually hidden acceptable)
- `MilestoneView` / `HistoryView` / `SettingsView` / `AssetsView` / `ReviewView`: all use `h2` as primary title — must be promoted to `h1`
- `PanelWrapper`: uses `h2` — must become `h3` after views get `h1`
- `MilestoneHeader`: uses `h2` for milestone name — must become `h2` under a view-level `h1`
- Sub-components (`MustHavesList`, `TargetFiles`, `BoundaryMap`, `ContextBudgetChart`, `UatStatus`, `CommittedHistory`): all use `h3` — remains correct if view gets `h1` and panels get `h2`

**Safe approach for "invisible" h1 in ChatView:**
```tsx
<h1 className="sr-only">GSD Mission Control — Chat</h1>
```

### Pattern 4: Focus Management on View Transitions

**What:** When `activeView.kind` changes in `SingleColumnView`, move focus to the view's primary heading.
**When to use:** Every `ViewType` switch.
**Example:**
```typescript
// In SingleColumnView or a new usePanelFocus hook
const headingRef = useRef<HTMLHeadingElement>(null);
useEffect(() => {
  headingRef.current?.focus();
}, [activeView.kind]);

// In each view's h1:
<h1 ref={headingRef} tabIndex={-1} className="sr-only">Chat</h1>
```

`tabIndex={-1}` allows programmatic focus without adding the element to the natural tab order.

### Pattern 5: Touch Target Enforcement

**What:** All buttons must have `min-h-[44px] min-w-[44px]`. The canonical approach in Tailwind is to ensure padding achieves this.
**Current gaps (from code audit):**
- Sidebar collapse toggle button: `p-2` on a small button — likely under 44px
- ProjectTree nav items: text items, need height check
- Session tab close buttons: compact, need `min-h-[44px]`
- Preview panel close button
- Viewport switcher buttons

**Fix pattern:**
```tsx
// Before
<button className="rounded p-2 text-slate-400 ...">

// After
<button className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 text-slate-400 ...">
```

### Pattern 6: Accessible Names for Icon-Only Buttons

**What:** Every icon-only button needs `aria-label`.
**Current gaps:**
- Sidebar collapse toggle has `title` but not `aria-label` — `title` is not announced by all screen readers
- Session tab close "×" buttons
- Preview panel close button (has `aria-label="Close preview"` — OK)
- Settings gear (has `title="Settings"` — needs `aria-label`)

**Fix:**
```tsx
<button aria-label="Collapse sidebar" title="Collapse sidebar" ...>
```

### Anti-Patterns to Avoid
- **Using Shift+key without checking uppercase key value:** `e.key` with Shift held returns the shifted character (e.g., `"P"` not `"p"`). The project's existing `shouldTogglePreview` decision log documents this exact pitfall.
- **Using `title` as the sole accessible name:** `title` is not reliably announced by screen readers. Always pair with `aria-label`.
- **Multiple `h1` on a single view:** Already happening in `OnboardingScreen` — must fix.
- **Skipping heading levels:** Do not jump from `h1` to `h3`. The fix must maintain h1→h2→h3 cascade.
- **Focus trapping in non-modal panels:** Only modals (`CommandPalette`, `PermissionModal`, `FolderPickerModal`) should trap focus. Panel transitions must not trap.
- **Losing focus on modal close:** When `CommandPalette` closes, focus must return to the triggering element (cmdk's `Command.Dialog` via Radix handles this automatically when `open` goes false).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Command menu ARIA | Custom combobox with listbox/option roles | cmdk | ARIA combobox requires aria-expanded, aria-activedescendant, aria-selected, keyboard nav — 200+ lines of correct implementation |
| Focus trap in command palette | tabindex juggling | cmdk + Radix Dialog | Radix Dialog handles focus trap, escape key, aria-modal, scroll lock |
| Fuzzy search | Custom string matching | cmdk built-in | cmdk scores and ranks by relevance automatically |

**Key insight:** The command palette is the only net-new component this phase. Everything else is retrofitting existing markup and adding CSS classes / attributes.

---

## Common Pitfalls

### Pitfall 1: Key Value With Shift Modifier
**What goes wrong:** Checking `e.key === "P"` vs `"p"` — Ctrl+Shift+P produces `e.key === "P"` (uppercase).
**Why it happens:** The `key` property reflects the character after modifier application. Shift converts `p` to `P`.
**How to avoid:** For Ctrl+Shift+P: `e.ctrlKey && e.shiftKey && e.key === "P"`. For Ctrl+P (no shift): `e.ctrlKey && e.key === "p"`.
**Warning signs:** The shortcut does nothing when tested in browser, but the pure function test passes when written incorrectly.
**Project precedent:** Decision log entry: "shouldTogglePreview checks e.key === 'p' lowercase only — Cmd+Shift+P with uppercase P does not trigger."

### Pitfall 2: cmdk Radix Peer Dependency
**What goes wrong:** cmdk's `Command.Dialog` fails to render if `@radix-ui/react-dialog` is not installed.
**Why it happens:** cmdk lists it as a peer dependency; Bun may not install peers automatically.
**How to avoid:** Run `bun add cmdk @radix-ui/react-dialog` together.
**Warning signs:** `Cannot find module '@radix-ui/react-dialog'` at runtime.

### Pitfall 3: Two h1 Elements in OnboardingScreen
**What goes wrong:** OnboardingScreen already has two `h1` elements (one per conditional branch, lines 38 and 78). Both branches are rendered via JSX conditional, but at runtime only one shows — however the `sr-only` technique means both might exist in DOM simultaneously if the conditional is wrong.
**How to avoid:** Verify the conditional is truly exclusive (one `h1` per DOM state). Confirm with a DOM snapshot test.

### Pitfall 4: PanelWrapper h2 Cascade Breaks
**What goes wrong:** If views get `h1` and `PanelWrapper` stays at `h2`, that is correct. But if sub-components like `MustHavesList` (currently `h3`) are promoted incorrectly, headings skip levels.
**How to avoid:** Assign heading levels top-down: view `h1` → panel section `h2` → sub-section `h3`. Do not change `h3` sub-components unless their parent changes.

### Pitfall 5: Focus Lost After View Switch Without tabIndex={-1}
**What goes wrong:** Calling `.focus()` on an element without `tabIndex={-1}` silently fails if the element is not natively focusable.
**How to avoid:** Add `tabIndex={-1}` to the `h1` in each view, or focus a visible interactive element (e.g., the chat input).

### Pitfall 6: cmdk In Bun Test Environment
**What goes wrong:** cmdk imports Radix Dialog which may use browser APIs not available in `happy-dom`.
**How to avoid:** Test `useCommandPalette` via pure function extraction only (`shouldOpenCommandPalette`). Do NOT render `CommandPalette` in bun test — test the hook's exported predicates and import shape only. This matches the pattern used for `usePreview`, `useChatMode`, `useSessionFlow`.

---

## Code Examples

### shouldOpenCommandPalette — Pure Function (testable)
```typescript
// Source: project pattern from usePreview.ts
export function shouldOpenCommandPalette(e: KeyboardEvent): boolean {
  // Ctrl+Shift+P on Windows/Linux, Cmd+Shift+P on macOS
  // e.key is "P" (uppercase) because Shift is held
  return (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P";
}
```

### Panel Keyboard Shortcuts — View Switching
```typescript
// Ctrl+1 through Ctrl+6 for view switching (or assign per view)
// Panel views: chat, milestone, history, settings, assets, review
const VIEW_SHORTCUTS: Record<string, ViewType> = {
  "1": { kind: "chat" },
  "2": { kind: "milestone" },
  "3": { kind: "history" },
  "4": { kind: "settings" },
  "5": { kind: "assets" },
};

export function shouldSwitchPanel(e: KeyboardEvent): string | null {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key in VIEW_SHORTCUTS) {
    return e.key;
  }
  return null;
}
```

### sr-only h1 Pattern (visually hidden but announced)
```tsx
// Tailwind's sr-only: position absolute, 1px size, overflow hidden, clip
<h1 className="sr-only" tabIndex={-1} ref={headingRef}>
  GSD Mission Control — Chat
</h1>
```

### Focus-visible Ring (Tailwind — already works with project stack)
```css
/* No extra CSS needed — Tailwind 4 generates focus-visible:ring-* by default */
/* Add to all interactive elements: */
className="... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-accent focus-visible:ring-offset-1 focus-visible:ring-offset-navy-900"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `title` attribute for button names | `aria-label` + `title` pair | WCAG 2.1 (2018) | `title` tooltip only; screen readers inconsistent |
| 44px minimum touch target (WCAG 2.5.5 AAA) | 24px minimum with spacing (WCAG 2.5.8 AA, 2023) | WCAG 2.2 (Sept 2023) | 24x24 CSS px with 16px spacing also valid; 44px remains best practice |
| Custom command palette | cmdk + Radix | 2022 | cmdk is now the ecosystem standard, used by shadcn/ui |
| Focus management per-route | Focus on h1 or first interactive element | Current best practice | WCAG 2.4.3 Focus Order |

**Deprecated/outdated:**
- `title`-only accessible names: replaced by `aria-label`
- Outline-0 (removing focus ring entirely): now a WCAG violation; use `focus-visible:` instead

---

## Open Questions

1. **Which key binding for KEYS-02 panel focus switching?**
   - What we know: No binding specified in requirements beyond "keyboard shortcuts"
   - What's unclear: `Ctrl+1-6`? `Alt+1-6`? Something else?
   - Recommendation: Use `Ctrl+1` through `Ctrl+5` for the 5 main views (chat, milestone, history, settings, assets). Document in a visible tooltip or help screen. Alt+N is reserved by browsers on Windows.

2. **Command palette onSelect behavior**
   - What we know: KEYS-01 says "searchable GSD command list" — does selecting a command inject into chat input or execute immediately?
   - What's unclear: The requirement says "search" not "execute" — injection into chat input is safer (user sees what will run)
   - Recommendation: On select, inject the command string into the active chat input and close the palette.

3. **cmdk version compatibility with React 19**
   - What we know: cmdk 1.x targets React 18+; React 19 is installed
   - What's unclear: Whether cmdk 1.x is fully tested with React 19's concurrent features
   - Recommendation: Install latest cmdk, run quick smoke test; if there are issues, wrap in `Suspense` boundary.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in Bun test runner) |
| Config file | bunfig.toml (exists at packages/mission-control/bunfig.toml) |
| Quick run command | `cd packages/mission-control && bun test tests/keyboard-accessibility.test.ts` |
| Full suite command | `cd packages/mission-control && bun test tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KEYS-01 | `shouldOpenCommandPalette` returns true for Ctrl+Shift+P | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ Wave 0 |
| KEYS-01 | `shouldOpenCommandPalette` returns false for Ctrl+P (no shift) | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ Wave 0 |
| KEYS-01 | `CommandPalette` module exports a function component | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ Wave 0 |
| KEYS-01 | getAllCommands() returns non-empty array (command list available) | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ Wave 0 |
| KEYS-02 | `shouldSwitchPanel` returns correct ViewType key for Ctrl+1 | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ Wave 0 |
| KEYS-02 | `shouldSwitchPanel` returns null for unrelated key | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ Wave 0 |
| KEYS-03 | Each view component renders exactly one h1 (DOM snapshot via JSON.stringify) | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ Wave 0 |
| KEYS-04 | All icon-only buttons have aria-label attribute (import + stringify inspection) | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ Wave 0 |
| KEYS-05 | Button classes include min-h-[44px] or equivalent padding (string check) | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ Wave 0 |
| KEYS-06 | `usePanelFocus` / focus management logic: headingRef.focus called after view change (pure fn test) | unit | `bun test tests/keyboard-accessibility.test.ts` | ❌ Wave 0 |

**Note on testing strategy:** Following the project pattern established in `usePreview.test.ts`, `discuss-review.test.tsx`, and `animations.test.tsx` — test pure functions directly (no React renderer, no happy-dom mounting of complex components). For structural checks (heading hierarchy, aria-label presence), use `JSON.stringify` inspection of the component's JSX return value, consistent with `panel-states.test.tsx` and `layout.test.tsx`.

### Sampling Rate
- **Per task commit:** `cd packages/mission-control && bun test tests/keyboard-accessibility.test.ts`
- **Per wave merge:** `cd packages/mission-control && bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/keyboard-accessibility.test.ts` — covers KEYS-01 through KEYS-06 (all gaps above)

*(All tests are new — no existing test file covers keyboard/accessibility requirements)*

---

## Sources

### Primary (HIGH confidence)
- [pacocoursey/cmdk GitHub](https://github.com/pacocoursey/cmdk) — API, ARIA roles, Dialog integration, keyboard shortcut pattern
- Project codebase audit — `usePreview.ts`, `slash-commands.ts`, `AppShell.tsx`, `SingleColumnView.tsx`, `Sidebar.tsx` — current heading and ARIA state

### Secondary (MEDIUM confidence)
- [W3C WCAG 2.1 — Target Size (2.5.5)](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html) — 44x44px minimum requirement
- [MDN — ARIA heading role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/heading_role) — one h1 per view principle
- [WCAG 2.5.8 Target Size Minimum](https://wcag.dock.codes/documentation/wcag258/) — WCAG 2.2 AA relaxation to 24px with spacing

### Tertiary (LOW confidence — verify before implementing)
- [cmdk + React 19 compatibility](https://github.com/pacocoursey/cmdk) — not explicitly documented; assume compatible but test

---

## Metadata

**Confidence breakdown:**
- Standard stack (cmdk): HIGH — verified via official GitHub and npm ecosystem research
- Architecture patterns: HIGH — derived directly from project codebase audit + established patterns
- ARIA/WCAG requirements: HIGH — verified via official W3C documentation
- Pitfalls: HIGH — most derived from existing project decision log entries
- cmdk + React 19 compatibility: LOW — not explicitly confirmed, flagged as open question

**Research date:** 2026-03-12
**Valid until:** 2026-06-12 (stable libraries; WCAG 2.2 is finalized)
