# Phase 03.1: Layout Rewrite — Sidebar + Tab Navigation

## Why This Phase Exists

During Phase 03 visual verification, the five-panel horizontal resizable layout failed:
- Only one panel was visible at a time (viewport too narrow for 5 panels)
- `react-resizable-panels` v4 API broke the resize handles
- User feedback: manual expand/collapse of 5 panels is poor UX

**Decision:** Replace the 5-panel resizable layout with a sidebar + tabbed column layout.

## Wireframe

```
┌──────────┬──────────────────────────────────────────┐
│ + New    │ [Chat & Task]  [Milestone]  [Slice]       │
│──────────├──────────────────────────────────────────┤
│          │                                           │
│ project1 │                                           │
│ project2 │     Active tab content fills              │
│ project3 │     the full main area                    │
│          │                                           │
│          │                                           │
│          │                                           │
│          │                                           │
│          │                                           │
│ ● Claude │                                           │
│  Active  │                                           │
└──────────┴──────────────────────────────────────────┘
```

## Layout Structure

### Left Sidebar (fixed ~220px, collapsible)
- **Top:** "+" icon button for new project initialization (`/gsd:new-project`)
- **Body:** Project list — each entry shows project name, active/paused indicator
- **Bottom:** Claude Code connection status (pulsing cyan dot + ACTIVE/DISCONNECTED label)

### Main Area (flex, fills remaining space)
- **Tab Bar:** Horizontal tabs across the top
- **Tab Content:** Single active tab fills the entire main area

### Tabs

| Tab | Name | Content |
|-----|------|---------|
| 1 | **Chat & Task** | Combined GSD workflow execution view. Bottom: command input with `/gsd:` autocomplete. Middle: streaming Claude Code output. Top/inline: active task progress bar, context budget meter, must-haves checklist. This is the primary interaction surface. |
| 2 | **Milestone** | Milestone name + overall progress bar. Slice list with status icons (complete/active/pending), task progress segments, demo sentences. Committed history at bottom. |
| 3 | **Slice** | Current slice deep-dive. Context budget bar chart per task. Boundary map (PRODUCES/CONSUMES). UAT verification status. |

## What Changes

### Remove
- `PanelShell.tsx` — 5-panel ResizablePanelGroup layout
- `react-resizable-panels` dependency (or keep only if needed elsewhere)
- ResizableHandle styling for cyan accent on drag

### Rewrite
- `App.tsx` — render new Sidebar + TabLayout instead of PanelShell
- Panel state components may be reused inside tab content

### Create
- `Sidebar.tsx` — project list, new project button, connection status
- `TabLayout.tsx` — tab bar + tab content container
- Tab content placeholder components (empty states per tab)

### Keep As-Is
- Design tokens (colors, typography, spacing) — fully reusable
- `PanelWrapper` state routing (error/loading/empty/content) — reusable inside tabs
- `PanelEmpty`, `PanelError`, `PanelSkeleton` — reusable as tab empty states
- Font imports (Share Tech Mono, JetBrains Mono)
- Dark navy theme, cyan accent system

## Design Constraints

- Sidebar width: ~220px fixed, collapsible to icon-only (~48px)
- Tab bar height: 40px
- Active tab indicator: cyan accent bottom border (2px)
- Inactive tabs: slate-300 text, no border
- Tab hover: navy-600 background
- Follow existing 8-point spacing grid
- Share Tech Mono for tab labels, JetBrains Mono for tab content body text
- Dark navy base (#0F1419) background everywhere

## Impact on Future Phases

- **Phase 4 (Sidebar + Milestone View):** Now fills Sidebar component + Milestone tab instead of two separate panels
- **Phase 5 (Slice Detail + Active Task):** Fills Slice tab + Chat & Task tab instead of two separate panels
- **Phase 6 (Chat Panel):** Fills Chat & Task tab (already combined)
- **Phase 7-9:** No structural impact, just target different containers
