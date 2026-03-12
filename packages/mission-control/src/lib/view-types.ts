/**
 * ViewType discriminated union for sidebar-driven navigation.
 *
 * Each variant maps to a sidebar tree item. The SingleColumnView router
 * switches on `kind` to render the appropriate full-width view component.
 */
export type ViewType =
  | { kind: "chat" }
  | { kind: "milestone" }
  | { kind: "history" }
  | { kind: "settings" }
  | { kind: "assets" }
  | { kind: "review" };
