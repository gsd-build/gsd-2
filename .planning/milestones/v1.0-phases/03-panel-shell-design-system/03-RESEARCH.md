# Phase 3: Panel Shell + Design System - Research

**Researched:** 2026-03-10
**Domain:** React resizable panel layout, design tokens, typography, component states
**Confidence:** HIGH

## Summary

Phase 3 transforms the placeholder App.tsx into a five-panel resizable dashboard with a fully implemented design system. The project already has Tailwind CSS v4, shadcn/ui, and React 19 installed. The CSS already defines `--color-navy-base: #0F1419`, `--color-cyan-accent: #5BC8F0`, `--font-display: "Share Tech Mono"`, and `--font-mono: "JetBrains Mono"` as theme tokens. The core work is: (1) install react-resizable-panels and wire up a horizontal PanelGroup with five panels at specified default widths, (2) extend the design token system with the full 60/30/10 color palette and 8-point spacing grid, (3) self-host both fonts via Fontsource, and (4) build skeleton/empty/error state components for every panel.

The shadcn/ui Resizable component is a thin wrapper around react-resizable-panels. Since shadcn/ui is already configured in the project, use `npx shadcn@latest add resizable` to get the wrapper components (ResizablePanelGroup, ResizablePanel, ResizableHandle). For persistence, react-resizable-panels supports `autoSaveId` with built-in localStorage, but the requirements specify persistence to a session file (`.planning/.mission-control-session.json`). A custom `storage` prop on PanelGroup bridges this -- write to localStorage for immediate reads and sync to the session file via a WebSocket message or API call.

**Primary recommendation:** Use shadcn/ui's Resizable wrapper over react-resizable-panels v4 with percentage-based sizing (converting pixel specs to percentages at a reference width), Fontsource for font self-hosting, and shadcn/ui's Skeleton component for loading states.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PNLS-01 | Five-panel layout: Sidebar (200px), Milestone (flex), Slice Detail (280px), Active Task (300px), Chat (340px) | react-resizable-panels PanelGroup with horizontal direction, percentage-based defaultSize converted from pixel specs at ~1440px reference width |
| PNLS-02 | All panels resizable via drag handles using react-resizable-panels | shadcn/ui Resizable component wraps react-resizable-panels; ResizableHandle with withHandle prop |
| PNLS-03 | Panel layout preferences persist in session file across restarts | autoSaveId for localStorage + custom storage adapter syncing to session file via server API |
| PNLS-04 | Every panel has designed loading, empty, and error states (skeleton screens) | shadcn/ui Skeleton component + custom EmptyState and ErrorState components |
| PNLS-05 | Design system: dark navy base, cyan accent for active/CTAs only, 60/30/10 color rule | Extend Tailwind v4 @theme with full palette: navy-base 60%, mid-tones 30%, cyan-accent 10% |
| PNLS-06 | Typography: Share Tech Mono headers, JetBrains Mono data, 4 sizes, 2 weights | Fontsource npm packages for self-hosting; Tailwind @theme font tokens already partially defined |
| PNLS-07 | 8-point spacing grid enforced across all padding, margin, gap | Tailwind v4 spacing scale naturally aligns (space-1=4px, space-2=8px, etc.); enforce via convention |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-resizable-panels | ^4.7.2 | Resizable panel layout | De facto React panel library, 1600+ dependents, active maintenance by bvaughn |
| @fontsource/share-tech-mono | latest | Self-hosted Share Tech Mono font | Eliminates render-blocking Google Fonts request, npm-managed |
| @fontsource/jetbrains-mono | latest | Self-hosted JetBrains Mono font | Same benefit, supports 400/700 weights needed |

### Already Installed (no action needed)
| Library | Version | Purpose |
|---------|---------|---------|
| tailwindcss | ^4.2.1 | Utility CSS, design tokens via @theme |
| shadcn/ui | configured | Component primitives (Skeleton, Resizable wrappers) |
| class-variance-authority | ^0.7.1 | Variant-based component styling |
| clsx + tailwind-merge | installed | Conditional class composition |
| lucide-react | ^0.577.0 | Icon library |
| tw-animate-css | ^1.4.0 | Animation utilities |

### shadcn/ui Components to Add
| Component | Command | Purpose |
|-----------|---------|---------|
| resizable | `npx shadcn@latest add resizable` | Wrapper around react-resizable-panels |
| skeleton | `npx shadcn@latest add skeleton` | Loading state placeholder |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-resizable-panels | allotment | allotment has fewer users, less shadcn/ui integration |
| Fontsource | Google Fonts CDN | CDN adds render-blocking request, fails offline |
| shadcn/ui Skeleton | react-loading-skeleton | Extra dependency when shadcn/ui already provides one |

**Installation:**
```bash
cd packages/mission-control
bun add react-resizable-panels @fontsource/share-tech-mono @fontsource/jetbrains-mono
npx shadcn@latest add resizable skeleton
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  components/
    layout/
      PanelShell.tsx          # Top-level PanelGroup with 5 panels
      PanelWrapper.tsx        # Individual panel wrapper with header, states
    ui/
      skeleton.tsx            # shadcn/ui skeleton (auto-generated)
      resizable.tsx           # shadcn/ui resizable (auto-generated)
    states/
      PanelSkeleton.tsx       # Reusable skeleton loading per panel type
      PanelEmpty.tsx          # Empty state with icon + message
      PanelError.tsx          # Error state with retry action
  styles/
    globals.css               # Extended @theme tokens
    design-tokens.ts          # Exported constants for JS usage
  lib/
    layout-storage.ts         # Custom storage adapter for panel persistence
    utils.ts                  # Existing cn() utility
```

### Pattern 1: Panel Shell with Percentage-Based Sizing
**What:** Convert pixel default widths to percentages at a 1440px reference width
**When to use:** Always -- react-resizable-panels works natively with percentages
**Conversion math:**
- Total: 200 + flex + 280 + 300 + 340 = 1120px fixed + flex
- At 1440px viewport: flex = 320px
- Sidebar: 200/1440 = ~14%
- Milestone: ~22% (flex)
- Slice Detail: 280/1440 = ~19%
- Active Task: 300/1440 = ~21%
- Chat: 340/1440 = ~24%

**Example:**
```typescript
// Source: react-resizable-panels docs + shadcn/ui Resizable
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

export function PanelShell() {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId="gsd-panel-layout"
      className="h-screen"
    >
      <ResizablePanel defaultSize={14} minSize={10} maxSize={20}>
        <SidebarPanel />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={22} minSize={15}>
        <MilestonePanel />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={19} minSize={12} maxSize={30}>
        <SliceDetailPanel />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={21} minSize={15} maxSize={30}>
        <ActiveTaskPanel />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={24} minSize={15} maxSize={35}>
        <ChatPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
```

### Pattern 2: Panel Wrapper with State Management
**What:** Each panel uses a wrapper that handles loading/empty/error states uniformly
**When to use:** Every panel instance

```typescript
interface PanelContentProps {
  title: string;
  isLoading: boolean;
  isEmpty: boolean;
  error: Error | null;
  onRetry?: () => void;
  children: React.ReactNode;
}

function PanelContent({ title, isLoading, isEmpty, error, onRetry, children }: PanelContentProps) {
  return (
    <div className="flex h-full flex-col bg-navy-base">
      <div className="border-b border-navy-600 px-4 py-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-gray-400">
          {title}
        </h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {isLoading && <PanelSkeleton variant={title} />}
        {error && <PanelError error={error} onRetry={onRetry} />}
        {isEmpty && !isLoading && !error && <PanelEmpty panel={title} />}
        {!isLoading && !error && !isEmpty && children}
      </div>
    </div>
  );
}
```

### Pattern 3: Custom Storage Adapter for Session File Persistence
**What:** Bridge react-resizable-panels autoSave to the server session file
**When to use:** PNLS-03 persistence requirement

```typescript
// Custom storage that writes to localStorage immediately
// and syncs to session file via server endpoint
import type { PanelGroupStorage } from "react-resizable-panels";

export function createSessionStorage(): PanelGroupStorage {
  return {
    getItem(name: string): string | null {
      return localStorage.getItem(name);
    },
    setItem(name: string, value: string): void {
      localStorage.setItem(name, value);
      // Fire-and-forget sync to session file
      fetch("/api/session/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: name, value }),
      }).catch(() => { /* silent fail -- localStorage is primary */ });
    },
  };
}
```

### Pattern 4: 60/30/10 Color System
**What:** Enforce the color distribution rule through semantic token naming
**When to use:** All component styling

```
60% - Base layer: navy-base (#0F1419), navy-800, navy-700 for backgrounds/surfaces
30% - Content layer: gray-400, gray-500 for text, navy-600 for borders
10% - Accent layer: cyan-accent (#5BC8F0) ONLY for active states, CTAs, focus rings
```

### Anti-Patterns to Avoid
- **Using cyan-accent for non-interactive elements:** Cyan is reserved for active/CTA states only. Using it decoratively breaks the 60/30/10 rule and dilutes interactive affordance.
- **Hardcoding pixel values in Panel defaultSize:** react-resizable-panels uses percentages by default. Converting to percentages at reference width ensures responsive behavior.
- **Building custom resize logic:** react-resizable-panels handles all drag interaction, keyboard resize, and touch events. Never hand-roll resize handlers.
- **Using spinners instead of skeletons:** Requirements explicitly prohibit spinners. Every loading state must be a skeleton that matches the final layout shape.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Panel resizing | Custom drag handlers with mouse events | react-resizable-panels | Handles keyboard, touch, a11y, edge cases with constraints |
| Skeleton loading | Custom pulse div | shadcn/ui Skeleton component | Consistent styling, animate-pulse built in |
| Font loading | Manual @font-face declarations | Fontsource npm packages | Handles subsetting, formats, fallbacks |
| Class composition | String concatenation | cn() from lib/utils (clsx + tailwind-merge) | Handles conditional classes and merge conflicts |
| Layout persistence | Custom localStorage wrapper | react-resizable-panels autoSaveId + storage prop | Built-in serialization, handles panel ID changes |

**Key insight:** The entire layout engine is solved by react-resizable-panels. The design system is solved by extending the existing Tailwind v4 @theme tokens. Focus implementation effort on the panel state components (skeleton/empty/error) which are unique to this project.

## Common Pitfalls

### Pitfall 1: Panel Size Sum Not Equaling 100%
**What goes wrong:** PanelGroup requires all defaultSize values to sum to exactly 100. Off-by-one rounding causes runtime warnings or broken layout.
**Why it happens:** Converting pixel values to percentages introduces rounding errors.
**How to avoid:** Calculate all panels, let the flex panel (Milestone) absorb the remainder: `100 - 14 - 19 - 21 - 24 = 22`.
**Warning signs:** Console warning "Panel group has invalid layout" on mount.

### Pitfall 2: Fonts Not Loading (FOUT/FOIT)
**What goes wrong:** Share Tech Mono or JetBrains Mono flash as system font or invisible text.
**Why it happens:** Font files not imported in entry point, or CSS references font family before loaded.
**How to avoid:** Import Fontsource CSS in frontend.tsx entry point before App renders. Use `font-display: swap` (Fontsource default).
**Warning signs:** Headers render in default monospace, not Share Tech Mono.

### Pitfall 3: Cyan Accent Overuse
**What goes wrong:** Dashboard looks washed out or every element competes for attention.
**Why it happens:** Developers instinctively use the brand color everywhere.
**How to avoid:** Strict rule: cyan-accent only on active nav items, primary CTAs, focus rings, and status indicators. All other text uses gray scale. Lint via code review.
**Warning signs:** More than ~10% of visible surface area is cyan.

### Pitfall 4: 8-Point Grid Violations
**What goes wrong:** Inconsistent spacing creates visual noise.
**Why it happens:** Using arbitrary Tailwind values (p-3 = 12px, p-5 = 20px) instead of 8-point multiples.
**How to avoid:** Only use spacing values that are multiples of 8: p-1 (4px is half-grid, allowed for dense UI), p-2 (8px), p-3 (12px -- AVOID), p-4 (16px), p-6 (24px), p-8 (32px). Prefer p-2, p-4, p-6, p-8.
**Warning signs:** Spacing looks "off" between similar elements.

### Pitfall 5: shadcn/ui Resizable v4 Compatibility
**What goes wrong:** shadcn/ui's resizable wrapper may lag behind react-resizable-panels v4 API changes.
**Why it happens:** Known issue (GitHub #9136, #9197) -- shadcn/ui wrapper updated for v4 but verify on install.
**How to avoid:** After `npx shadcn@latest add resizable`, check the generated resizable.tsx imports match react-resizable-panels v4 exports. If mismatched, update the wrapper.
**Warning signs:** TypeScript errors in resizable.tsx after install.

## Code Examples

### Extending globals.css with Full Design System
```css
/* Source: Tailwind v4 @theme syntax, extending existing globals.css */
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme {
  /* Base palette - 60% */
  --color-navy-base: #0F1419;
  --color-navy-900: #131A21;
  --color-navy-800: #1A2332;
  --color-navy-700: #243044;
  --color-navy-600: #2D3B4E;

  /* Content - 30% */
  --color-slate-400: #8899AA;
  --color-slate-500: #6B7D8D;
  --color-slate-600: #4A5B6B;

  /* Accent - 10% (active/CTAs ONLY) */
  --color-cyan-accent: #5BC8F0;
  --color-cyan-hover: #7DD6F5;
  --color-cyan-muted: #2A5A6B;

  /* Status colors */
  --color-status-success: #4ADE80;
  --color-status-warning: #FBBF24;
  --color-status-error: #F87171;

  /* Typography */
  --font-display: "Share Tech Mono", monospace;
  --font-mono: "JetBrains Mono", monospace;

  /* Type scale (matching requirement: 10/12/14/18px) */
  --text-xs: 10px;
  --text-sm: 12px;
  --text-base: 14px;
  --text-lg: 18px;
}
```

### Font Import in Entry Point
```typescript
// Source: Fontsource docs
// In frontend.tsx, before App import
import "@fontsource/share-tech-mono/400.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
```

### Skeleton Loading State Component
```typescript
// Source: shadcn/ui Skeleton component pattern
import { Skeleton } from "@/components/ui/skeleton";

export function MilestoneSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-24 bg-navy-700" />
        <Skeleton className="h-2 flex-1 bg-navy-700" />
      </div>
      {/* Phase rows */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded bg-navy-800 p-3">
          <Skeleton className="h-3 w-3 rounded-full bg-navy-700" />
          <Skeleton className="h-3 w-16 bg-navy-700" />
          <Skeleton className="h-2 flex-1 bg-navy-700" />
        </div>
      ))}
    </div>
  );
}
```

### Empty State Component
```typescript
import { Inbox } from "lucide-react";

interface PanelEmptyProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
}

export function PanelEmpty({ icon, title, description }: PanelEmptyProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="text-slate-600">
        {icon || <Inbox className="h-8 w-8" />}
      </div>
      <h3 className="font-display text-sm font-bold uppercase text-slate-400">
        {title}
      </h3>
      <p className="max-w-48 font-mono text-xs text-slate-500">
        {description}
      </p>
    </div>
  );
}
```

### Error State Component
```typescript
import { AlertTriangle } from "lucide-react";

interface PanelErrorProps {
  error: Error;
  onRetry?: () => void;
}

export function PanelError({ error, onRetry }: PanelErrorProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <AlertTriangle className="h-8 w-8 text-status-error" />
      <h3 className="font-display text-sm font-bold uppercase text-slate-400">
        Something went wrong
      </h3>
      <p className="max-w-48 font-mono text-xs text-slate-500">
        {error.message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded bg-navy-700 px-4 py-2 font-mono text-xs text-cyan-accent hover:bg-navy-600"
        >
          Retry
        </button>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-resizable-panels v2 API | v4 API with mixed unit support | 2025 | Pixel+percentage mix available, but percentage remains simpler |
| Google Fonts CDN | Fontsource self-hosting | 2023+ standard | Eliminates render-blocking external request |
| Tailwind v3 theme.extend | Tailwind v4 @theme directive | 2024 | CSS-native tokens, no config file needed |
| CSS custom properties manually | @theme block auto-generates utilities | Tailwind v4 | Write `--color-navy-base` and get `bg-navy-base` automatically |

**Deprecated/outdated:**
- `typeface-share-tech-mono` npm package: deprecated, replaced by `@fontsource/share-tech-mono`
- Tailwind v3 `tailwind.config.js` theme extension: project uses v4 with CSS-based @theme

## Open Questions

1. **Session file write mechanism for PNLS-03**
   - What we know: Requirements mention `.planning/.mission-control-session.json` for persistence (SERV-07, Phase 9). react-resizable-panels has `autoSaveId` for localStorage and custom `storage` prop.
   - What's unclear: Whether to implement the session file API endpoint in this phase or defer to Phase 9 (where SERV-07 is assigned).
   - Recommendation: Use `autoSaveId` with localStorage in this phase for immediate persistence. The session file sync can be layered on in Phase 9 when SERV-07 is built. localStorage satisfies "persist across restarts" since the browser session persists.

2. **Resize handle styling**
   - What we know: shadcn/ui's ResizableHandle has a `withHandle` prop for visible drag handles.
   - What's unclear: Exact visual design for handles in the dark theme.
   - Recommendation: Use `withHandle` and style the handle grip to match navy-600 border with subtle hover state. Override shadcn defaults via className.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test runner (built-in) |
| Config file | none -- Bun test runs by convention from tests/ |
| Quick run command | `cd packages/mission-control && bun test` |
| Full suite command | `cd packages/mission-control && bun test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PNLS-01 | Five panels render at correct default sizes | unit | `bun test tests/panel-shell.test.tsx -t "default sizes"` | No -- Wave 0 |
| PNLS-02 | Panels are resizable via drag handles | manual-only | Visual verification -- drag interaction requires browser | N/A |
| PNLS-03 | Layout prefs persist across restarts | unit | `bun test tests/layout-storage.test.ts` | No -- Wave 0 |
| PNLS-04 | Every panel shows skeleton/empty/error states | unit | `bun test tests/panel-states.test.tsx` | No -- Wave 0 |
| PNLS-05 | Design tokens match spec (colors) | unit | `bun test tests/design-tokens.test.ts` | No -- Wave 0 |
| PNLS-06 | Font families and sizes configured | unit | `bun test tests/design-tokens.test.ts` | No -- Wave 0 |
| PNLS-07 | 8-point spacing grid | manual-only | Visual verification -- spacing review | N/A |

### Sampling Rate
- **Per task commit:** `cd packages/mission-control && bun test`
- **Per wave merge:** `cd packages/mission-control && bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/panel-shell.test.tsx` -- covers PNLS-01, PNLS-02 (render assertions)
- [ ] `tests/panel-states.test.tsx` -- covers PNLS-04 (loading/empty/error rendering)
- [ ] `tests/layout-storage.test.ts` -- covers PNLS-03 (storage adapter)
- [ ] `tests/design-tokens.test.ts` -- covers PNLS-05, PNLS-06 (CSS variable assertions)
- [ ] React test dependencies: may need `@testing-library/react` or `happy-dom` for component tests with Bun

## Sources

### Primary (HIGH confidence)
- [react-resizable-panels npm](https://www.npmjs.com/package/react-resizable-panels) - v4.7.2, API surface, autoSaveId, storage prop
- [react-resizable-panels GitHub](https://github.com/bvaughn/react-resizable-panels) - Panel props, PanelGroup props, percentage/pixel units
- [shadcn/ui Resizable](https://ui.shadcn.com/docs/components/radix/resizable) - Wrapper component API, withHandle prop
- [shadcn/ui Skeleton](https://ui.shadcn.com/docs/components/radix/skeleton) - Skeleton component usage
- [@fontsource/share-tech-mono npm](https://www.npmjs.com/package/@fontsource/share-tech-mono) - Self-hosting approach
- [@fontsource/jetbrains-mono npm](https://www.npmjs.com/package/@fontsource/jetbrains-mono) - Weight/style imports
- Project source: `packages/mission-control/src/styles/globals.css` - existing @theme tokens

### Secondary (MEDIUM confidence)
- [shadcn/ui v4 compat issues](https://github.com/shadcn-ui/ui/issues/9136) - Known issues with react-resizable-panels v4 wrapper
- [Fontsource docs](https://fontsource.org/fonts/jetbrains-mono/install) - Import patterns

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- react-resizable-panels is the established React panel library, shadcn/ui wraps it natively, Fontsource is standard for self-hosting
- Architecture: HIGH -- patterns derive from library APIs and existing project structure
- Pitfalls: HIGH -- documented issues (v4 compat, panel sum, font loading) verified from GitHub issues and library docs

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable libraries, low churn)
