# Phase 7: Session Flow + Animation - Research

**Researched:** 2026-03-11
**Domain:** React session flow, CSS animations, SVG animation, performance optimization
**Confidence:** HIGH

## Summary

Phase 7 requires two distinct capabilities: (1) session flow logic that detects project state on launch and routes to the appropriate screen (onboarding vs. resume vs. dashboard), and (2) branded animations including a pixel-art logo build, panel staggered fade-ins, and micro-interactions. Both can be implemented with zero additional dependencies.

The original stack research recommended Remotion for the logo animation, but investigation reveals this is massive overkill: `remotion` (848KB, 317 deps) plus `@remotion/player` (297KB) for a 600ms one-shot SVG animation. Remotion also uses Webpack internally, which conflicts with the project's Bun-only constraint. The existing GsdLogo SVG component and `tw-animate-css` (already installed) provide everything needed.

**Primary recommendation:** Use pure CSS @keyframes for the logo animation and `tw-animate-css` utilities for all micro-animations. No new dependencies required. Session flow is a React state machine in AppShell that reads from the existing PlanningState and a new `/api/session/status` endpoint.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SESS-01 | New project (no `.planning/`): onboarding screen with logo animation, guided `/gsd:new-project` chat | Session state machine detects null/empty PlanningState, renders OnboardingScreen component with logo animation and pre-filled chat |
| SESS-02 | Existing project: dashboard loads current state, resume card if continue-here file exists | State deriver already builds full state; new API endpoint checks for `.continue-here.md` files in phase dirs; ResumeCard component overlays dashboard |
| SESS-03 | Project selector for multiple GSD projects sorted by most recent activity | Recent projects API already exists at `/api/projects/recent`; ProjectSelector component sorts by `lastOpened` descending |
| SESS-04 | First render under 800ms on warm Bun process | Performance budget enforced by lazy imports, no Remotion dependency bloat, CSS-only animations (compositor thread), and existing async state derivation |
| ANIM-01 | Remotion logo animation: pixel-art build 600ms, plays once on session start | Pure CSS @keyframes on existing GsdLogo SVG rects; sequential opacity reveals timed to 600ms total; `animation-fill-mode: forwards` for one-shot |
| ANIM-02 | Loading state: single pixel row scans left-to-right across logo outline (200ms loop) | CSS @keyframes translateX animation on a thin rect overlay, 200ms infinite loop |
| ANIM-03 | Panel load: staggered fade-in, 40ms delay between panels, 200ms duration | tw-animate-css `animate-in fade-in` with CSS custom property `--delay` or inline `animation-delay` per panel index |
| ANIM-04 | Task advance: brief amber pulse on affected element, 150ms | CSS @keyframes pulse using `box-shadow` or `background-color` amber flash, 150ms duration |
| ANIM-05 | Chat message arrival: slide-up 80ms, opacity 0->1 | tw-animate-css `animate-in fade-in slide-in-from-bottom` with `duration-75` (close to 80ms) |
</phase_requirements>

## Standard Stack

### Core (Already Installed -- No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tw-animate-css | ^1.4.0 | Animate-in/out utilities, fade, slide, stagger | Already in package.json. TailwindCSS v4 compatible. Provides `animate-in`, `fade-in`, `slide-in-from-*`, `duration-*`, `delay-*` classes. |
| CSS @keyframes | N/A | Logo pixel-art build animation, loading scan, amber pulse | Zero bundle cost. GPU-composited (opacity, transform). 600ms one-shot animation is trivially expressible. |
| React 19 | ^19.2.4 | Session state machine, conditional rendering | Already installed. `useState`/`useEffect` for session flow state. |

### NOT Using (Decision Reversal from Original Research)

| Library | Why NOT | What Instead |
|---------|---------|--------------|
| Remotion + @remotion/player | 1.1MB+ combined bundle for a 600ms one-shot animation. Remotion uses Webpack internally, incompatible with Bun-only constraint. `lazyComponent` broken on Bun. | Pure CSS @keyframes on existing GsdLogo SVG. Zero deps, zero bundle cost. |
| Framer Motion / Motion | 34KB minimum even with tree-shaking. Overkill for 5 simple animations that CSS handles natively. | tw-animate-css (already installed) + custom @keyframes for logo. |

**Installation:**
```bash
# No installation needed -- all tools already in the project
```

## Architecture Patterns

### Session State Machine

The core session flow is a state machine in the AppShell component:

```
                    +------------------+
                    |  INITIALIZING    |  (WebSocket connecting, state loading)
                    +--------+---------+
                             |
                    state received from WS
                             |
              +--------------+--------------+
              |                             |
    state is null/empty              state has data
    (no .planning/)                  (.planning/ exists)
              |                             |
    +---------v---------+         +---------v---------+
    |   ONBOARDING      |         | check continue-   |
    | (logo anim + chat)|         | here files         |
    +-------------------+         +---------+----------+
                                            |
                                  +---------+---------+
                                  |                   |
                          has continue-here    no continue-here
                                  |                   |
                         +--------v--------+  +-------v-------+
                         |  RESUME_CARD    |  |   DASHBOARD   |
                         | (overlay card)  |  |  (normal UI)  |
                         +-----------------+  +---------------+
```

### Recommended File Structure

```
src/
  components/
    session/                    # NEW directory
      OnboardingScreen.tsx      # Full-screen onboarding with logo animation
      ResumeCard.tsx            # Overlay card showing continue-here context
      ProjectSelector.tsx       # Project list sorted by recent activity
      LogoAnimation.tsx         # Animated GsdLogo with CSS @keyframes
      LoadingLogo.tsx           # Logo with scanning pixel row
    layout/
      AppShell.tsx              # MODIFIED: add session state machine
      SingleColumnView.tsx      # MODIFIED: wrap with animation classes
  hooks/
    useSessionFlow.ts           # NEW: session state machine hook
  styles/
    animations.css              # NEW: @keyframes for logo build, pulse, scan
    globals.css                 # MODIFIED: import animations.css
  server/
    session-status-api.ts       # NEW: /api/session/status endpoint
    state-deriver.ts            # UNMODIFIED: already builds full state
```

### Pattern 1: Session Flow Hook

**What:** A custom hook that derives the current session mode from PlanningState and continue-here file status.
**When to use:** AppShell component, to decide what to render.

```typescript
// src/hooks/useSessionFlow.ts
type SessionMode = "initializing" | "onboarding" | "resume" | "dashboard";

interface SessionFlowState {
  mode: SessionMode;
  continueHere: ContinueHereData | null;
  animationComplete: boolean;
  setAnimationComplete: () => void;
}

export function useSessionFlow(
  planningState: PlanningState | null,
  wsStatus: ConnectionStatus
): SessionFlowState {
  // 1. "initializing" until WS connects and first state arrives
  // 2. If state is null/empty (no phases, no roadmap) -> "onboarding"
  // 3. If continue-here file exists -> "resume"
  // 4. Otherwise -> "dashboard"
}
```

### Pattern 2: CSS @keyframes Logo Build Animation

**What:** Sequential opacity reveals on the SVG rects in GsdLogo, timed across 600ms.
**When to use:** OnboardingScreen, first session start.

```css
/* src/styles/animations.css */
@keyframes logo-build {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

.logo-build-frame    { animation: logo-build 100ms ease-out forwards; opacity: 0; }
.logo-build-titlebar { animation: logo-build 100ms ease-out 100ms forwards; opacity: 0; }
.logo-build-chevron  { animation: logo-build 150ms ease-out 250ms forwards; opacity: 0; }
.logo-build-cursor   { animation: logo-build 150ms ease-out 400ms forwards; opacity: 0; }
/* Total: ~550ms, leaving 50ms gap before settling = 600ms perceived */
```

### Pattern 3: Staggered Panel Fade-In with tw-animate-css

**What:** Each panel fades in with a 40ms delay offset.
**When to use:** Dashboard initial load, project switch.

```tsx
// Use inline style for dynamic delay, tw-animate-css classes for animation
<div
  className="animate-in fade-in duration-200"
  style={{ animationDelay: `${index * 40}ms` }}
>
  {panelContent}
</div>
```

### Anti-Patterns to Avoid

- **JavaScript-driven animation loops:** Never use `requestAnimationFrame` or `setInterval` for simple opacity/transform animations. CSS compositor thread handles these without main-thread blocking.
- **Remotion for one-shot animations:** Remotion's value is timeline-based video composition and export. For DOM animations, it adds massive overhead (Webpack bundler, 1MB+ deps).
- **Animating layout properties:** Never animate `width`, `height`, `top`, `left`, `margin`, or `padding`. These trigger layout recalculation. Use `transform` and `opacity` only for 60fps animations.
- **Blocking state derivation on animation:** The logo animation (600ms) should run concurrently with state loading, not sequentially. The dashboard should appear immediately when state is ready, even if animation is still playing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fade/slide animations | Custom JS animation system | tw-animate-css `animate-in fade-in slide-in-from-*` | Already installed, GPU-composited, declarative CSS classes |
| Animation delays | Manual setTimeout chains | CSS `animation-delay` with inline styles or CSS custom properties | Browser handles timing, no JS event loop overhead |
| Session persistence | Custom file-based session store | Existing `~/.gsd/recent-projects.json` + `.planning/` detection | Recent projects API already exists (Phase 6.1) |
| Continue-here parsing | Custom YAML parser | Existing `gray-matter` (already a dep) | Frontmatter parsing already used by state-deriver |
| Project detection | Manual filesystem scanning | Existing `handleFsRequest` + `isGsdProject` field | FS API already returns GSD project detection (Phase 6.1) |

**Key insight:** Every "session flow" data source already exists in the codebase. The gap is purely UI: rendering different screens based on existing state data.

## Common Pitfalls

### Pitfall 1: Animation Blocks First Render

**What goes wrong:** Logo animation delays showing the dashboard, pushing first render past 800ms.
**Why it happens:** Sequential flow: wait for animation complete, then load state, then render dashboard.
**How to avoid:** Run animation and state loading in parallel. Dashboard renders immediately when state arrives. Animation plays as an overlay that fades away.
**Warning signs:** Performance test measures time-to-interactive including animation duration.

### Pitfall 2: Flash of Wrong Screen

**What goes wrong:** User sees onboarding screen briefly before WebSocket delivers existing project state.
**Why it happens:** State is null during WebSocket connection, which matches "onboarding" condition.
**How to avoid:** Use "initializing" as a distinct state that shows the loading logo (ANIM-02) until WebSocket connects AND first state message arrives. Only then decide onboarding vs. dashboard.
**Warning signs:** Flickering between screens on page load.

### Pitfall 3: Continue-Here File Race Condition

**What goes wrong:** State shows dashboard, then resume card pops in a moment later.
**Why it happens:** Continue-here check is async and completes after initial state render.
**How to avoid:** Include continue-here status in the initial session status API response, fetched before first render decision. Or include it in the state derivation itself.
**Warning signs:** Resume card appearing with a visible delay after dashboard loads.

### Pitfall 4: Animation Jank from Layout Thrashing

**What goes wrong:** Staggered panel animations stutter or lag.
**Why it happens:** Animating properties that trigger layout (padding, height, width) forces browser to recalculate geometry on every frame.
**How to avoid:** Only animate `opacity` and `transform` (translateY for slide-up). These run on the compositor thread, separate from main thread.
**Warning signs:** Animations look smooth on powerful machines but jank on slower ones.

### Pitfall 5: Remotion Webpack Conflict

**What goes wrong:** Installing Remotion pulls in Webpack, babel-loader, and 300+ transitive deps. Bun bundler conflicts.
**Why it happens:** Remotion's architecture assumes Webpack for bundling compositions.
**How to avoid:** Do not install Remotion. Use CSS @keyframes for the logo animation. If V2 video export is needed later, Remotion can be added as a standalone tool, not embedded in the dashboard.
**Warning signs:** `bun install` warnings about peer deps, build failures, massive node_modules growth.

## Code Examples

### Logo Build Animation (CSS @keyframes)

```css
/* src/styles/animations.css */

/* Pixel-art logo build: rects appear sequentially over 600ms */
@keyframes gsd-build-in {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}

/* Individual rect group timings */
.logo-anim-frame {
  opacity: 0;
  animation: gsd-build-in 120ms ease-out forwards;
  animation-delay: 0ms;
}
.logo-anim-titlebar {
  opacity: 0;
  animation: gsd-build-in 100ms ease-out forwards;
  animation-delay: 120ms;
}
.logo-anim-dots {
  opacity: 0;
  animation: gsd-build-in 80ms ease-out forwards;
  animation-delay: 220ms;
}
.logo-anim-chevron {
  opacity: 0;
  animation: gsd-build-in 150ms ease-out forwards;
  animation-delay: 300ms;
}
.logo-anim-cursor {
  opacity: 0;
  animation: gsd-build-in 150ms ease-out forwards;
  animation-delay: 450ms;
}
/* 450ms + 150ms = 600ms total */

/* Loading scan line */
@keyframes logo-scan {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}
.logo-scan-line {
  animation: logo-scan 200ms linear infinite;
}

/* Amber pulse for task advance */
@keyframes amber-pulse {
  0% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.6); }
  100% { box-shadow: 0 0 0 8px rgba(251, 191, 36, 0); }
}
.task-advance-pulse {
  animation: amber-pulse 150ms ease-out;
}
```

### Session Flow Hook

```typescript
// src/hooks/useSessionFlow.ts
import { useState, useEffect } from "react";
import type { PlanningState } from "@/server/types";
import type { ConnectionStatus } from "./useReconnectingWebSocket";

export type SessionMode = "initializing" | "onboarding" | "resume" | "dashboard";

export interface ContinueHereData {
  phase: string;
  task: number;
  totalTasks: number;
  status: string;
  currentState: string;
  nextAction: string;
}

export function useSessionFlow(
  state: PlanningState | null,
  wsStatus: ConnectionStatus
) {
  const [mode, setMode] = useState<SessionMode>("initializing");
  const [continueHere, setContinueHere] = useState<ContinueHereData | null>(null);
  const [animComplete, setAnimComplete] = useState(false);

  useEffect(() => {
    if (wsStatus !== "connected") {
      setMode("initializing");
      return;
    }
    if (!state || (state.phases.length === 0 && state.roadmap.phases.length === 0)) {
      setMode("onboarding");
      return;
    }
    // Check for continue-here file
    fetch("/api/session/status")
      .then(r => r.json())
      .then(data => {
        if (data.continueHere) {
          setContinueHere(data.continueHere);
          setMode("resume");
        } else {
          setMode("dashboard");
        }
      })
      .catch(() => setMode("dashboard"));
  }, [state, wsStatus]);

  return { mode, continueHere, animComplete, setAnimComplete: () => setAnimComplete(true) };
}
```

### Session Status API Endpoint

```typescript
// src/server/session-status-api.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

export async function handleSessionStatusRequest(
  req: Request,
  url: URL,
  planningDir: string
): Promise<Response | null> {
  if (url.pathname !== "/api/session/status" || req.method !== "GET") return null;

  // Scan for .continue-here.md in phase directories
  const phasesDir = join(planningDir, "phases");
  let continueHere = null;

  try {
    const phaseDirs = readdirSync(phasesDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dir of phaseDirs) {
      const files = readdirSync(join(phasesDir, dir.name));
      const chFile = files.find(f => f.includes("continue-here"));
      if (chFile) {
        const content = readFileSync(join(phasesDir, dir.name, chFile), "utf-8");
        const parsed = matter(content);
        continueHere = {
          phase: parsed.data.phase || dir.name,
          task: parsed.data.task || 0,
          totalTasks: parsed.data.total_tasks || 0,
          status: parsed.data.status || "in_progress",
          currentState: extractSection(parsed.content, "current_state"),
          nextAction: extractSection(parsed.content, "next_action"),
        };
        break; // Use first found
      }
    }
  } catch {
    // No phases dir = new project
  }

  return Response.json({ continueHere });
}

function extractSection(content: string, tag: string): string {
  const regex = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`);
  const match = content.match(regex);
  return match ? match[1].trim() : "";
}
```

### Staggered Panel Fade-In Wrapper

```tsx
// Utility component for staggered animation
interface AnimatedPanelProps {
  index: number;
  children: React.ReactNode;
  className?: string;
}

export function AnimatedPanel({ index, children, className }: AnimatedPanelProps) {
  return (
    <div
      className={cn(
        "animate-in fade-in duration-200",
        className
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {children}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Remotion for all animation | CSS @keyframes + tw-animate-css | Phase 7 research (reversal) | Eliminates 1.1MB+ deps, avoids Webpack conflict with Bun |
| JavaScript requestAnimationFrame | CSS compositor-thread animations | CSS animations spec matured | opacity + transform animations run at 60fps without JS |
| Separate animation library | Tailwind animation utilities | tw-animate-css v1.4 | Already installed, zero additional bundle cost |

**Deprecated/outdated:**
- **Remotion for logo animation:** Overkill for this use case. Reserved for V2 video export feature if needed.
- **tailwindcss-animate:** Replaced by tw-animate-css for Tailwind v4 compatibility (already done in this project).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bun test runner (built-in, Jest-compatible API) |
| Config file | bunfig.toml (minimal, serves static plugin) |
| Quick run command | `bun test --filter session` |
| Full suite command | `cd packages/mission-control && bun test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-01 | Null/empty state renders onboarding screen | unit | `bun test tests/session-flow.test.tsx -t "onboarding"` | No - Wave 0 |
| SESS-02 | Existing state + continue-here shows resume card | unit | `bun test tests/session-flow.test.tsx -t "resume"` | No - Wave 0 |
| SESS-03 | Project selector sorts by most recent | unit | `bun test tests/session-flow.test.tsx -t "selector"` | No - Wave 0 |
| SESS-04 | First render under 800ms | unit | `bun test tests/session-perf.test.ts -t "800ms"` | No - Wave 0 |
| ANIM-01 | Logo animation has correct CSS classes and 600ms duration | unit | `bun test tests/animations.test.tsx -t "logo"` | No - Wave 0 |
| ANIM-02 | Loading logo has scan line animation | unit | `bun test tests/animations.test.tsx -t "loading"` | No - Wave 0 |
| ANIM-03 | Panels have staggered delay (40ms * index) and 200ms duration | unit | `bun test tests/animations.test.tsx -t "stagger"` | No - Wave 0 |
| ANIM-04 | Task advance triggers amber pulse class | unit | `bun test tests/animations.test.tsx -t "pulse"` | No - Wave 0 |
| ANIM-05 | Chat message has slide-up + fade-in classes | unit | `bun test tests/animations.test.tsx -t "slide"` | No - Wave 0 |

### Sampling Rate

- **Per task commit:** `bun test tests/session-flow.test.tsx tests/animations.test.tsx`
- **Per wave merge:** `cd packages/mission-control && bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/session-flow.test.tsx` -- covers SESS-01, SESS-02, SESS-03
- [ ] `tests/session-perf.test.ts` -- covers SESS-04
- [ ] `tests/animations.test.tsx` -- covers ANIM-01 through ANIM-05
- [ ] `tests/session-status-api.test.ts` -- covers server-side continue-here detection
- [ ] `src/styles/animations.css` -- custom @keyframes (no framework needed)

## Open Questions

1. **Should continue-here data be part of PlanningState?**
   - What we know: Currently `.continue-here.md` is not parsed by state-deriver. A separate API endpoint is simpler to implement.
   - What's unclear: Should the watcher trigger re-checks when continue-here files change?
   - Recommendation: Separate `/api/session/status` endpoint, fetched once on load. Simpler, avoids coupling animation state to the file watcher diff pipeline.

2. **Logo animation replay on project switch?**
   - What we know: ANIM-01 says "plays once on session start." SESS-01 says "onboarding screen with logo animation."
   - What's unclear: Does switching to a new project (no `.planning/`) replay the animation?
   - Recommendation: Yes, treat each project switch to a new (non-GSD) project as a fresh onboarding session.

3. **800ms performance budget measurement point**
   - What we know: SESS-04 says "first render under 800ms on warm Bun process."
   - What's unclear: Is this time-to-first-paint, time-to-interactive, or time-to-content-visible?
   - Recommendation: Measure time from `Bun.serve()` start to React root `.render()` completing (DOM exists). Use `performance.now()` in frontend.tsx and a Bun test that measures the build-state + serve cycle.

## Sources

### Primary (HIGH confidence)
- Project codebase analysis: package.json, AppShell.tsx, GsdLogo.tsx, pipeline.ts, state-deriver.ts, recent-projects.ts
- [Remotion Bun support docs](https://www.remotion.dev/docs/bun) - confirms Webpack dependency, lazyComponent broken on Bun
- [tw-animate-css npm](https://www.npmjs.com/package/tw-animate-css) - confirms fade-in, slide-in utilities available

### Secondary (MEDIUM confidence)
- [Remotion Player docs](https://www.remotion.dev/docs/player/) - confirms @remotion/player requires Webpack for code sharing
- [@remotion/player Package Phobia](https://packagephobia.com/result?p=@remotion/player) - 297KB install size
- [Motion bundle size docs](https://motion.dev/docs/react-reduce-bundle-size) - 34KB minimum even with tree-shaking

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all tools already installed, no new deps needed
- Architecture: HIGH - session flow pattern is straightforward state machine on existing data
- Pitfalls: HIGH - animation performance is well-understood CSS domain, Remotion conflict verified with official docs
- Animations: HIGH - CSS @keyframes for specified durations/delays are trivially implementable

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable domain, no fast-moving dependencies)
