/**
 * State management for sidebar-driven navigation.
 *
 * Tracks which view is currently active in the single-column layout.
 * Default: chat view (primary interaction surface).
 */
import { useState } from "react";
import type { ViewType } from "@/lib/view-types";

export interface UseSidebarNavResult {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
}

export function useSidebarNav(): UseSidebarNavResult {
  const [activeView, setActiveView] = useState<ViewType>({ kind: "chat" });
  return { activeView, setActiveView };
}
