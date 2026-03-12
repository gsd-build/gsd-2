/**
 * usePanelFocus hook — keyboard-driven panel view switching with focus management.
 *
 * Provides:
 * - VIEW_SHORTCUTS: mapping of key "1"–"5" to ViewType kinds
 * - shouldSwitchPanel(e): pure predicate for direct testing
 * - usePanelFocus(onSwitchView): hook that wires up keydown listener and
 *   returns a headingRef for the caller to attach to the view h1
 *
 * Pure function extraction: shouldSwitchPanel(e) exported for direct test
 * assertions without React renderer — same pattern as shouldTogglePreview.
 *
 * Design decisions:
 * - Ctrl+1 through Ctrl+5 (without Shift) switch views
 * - Shift must NOT be held — distinguishes from Ctrl+Shift+P palette shortcut
 * - "review" is NOT in VIEW_SHORTCUTS — it activates via useChatMode, not keyboard shortcut
 * - Relative import path for view-types avoids @/ alias issues in bun test resolution
 */
import { useEffect, useRef, type RefObject } from "react";
import type { ViewType } from "../lib/view-types";

/**
 * Maps Ctrl+1–5 keys to ViewType kinds.
 * "review" is intentionally excluded — it activates automatically via useChatMode.
 */
export const VIEW_SHORTCUTS: Record<string, ViewType["kind"]> = {
  "1": "chat",
  "2": "milestone",
  "3": "history",
  "4": "settings",
  "5": "assets",
};

/**
 * Pure function: returns the key string ("1"–"5") if this event is a panel
 * switch shortcut, null otherwise.
 * Exported for direct test assertions without mounting the hook.
 *
 * Matches: (ctrlKey || metaKey) && !shiftKey && key in VIEW_SHORTCUTS.
 * Shift must NOT be held (distinguishes from Ctrl+Shift+P command palette).
 */
export function shouldSwitchPanel(e: KeyboardEvent): string | null {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key in VIEW_SHORTCUTS) {
    return e.key;
  }
  return null;
}

/**
 * usePanelFocus — panel keyboard switching + focus management hook.
 *
 * Attaches a keydown listener to window. When a panel shortcut fires,
 * calls onSwitchView with the corresponding ViewType kind.
 *
 * Returns headingRef for the caller to attach to the view's h1 element.
 * Focus is moved to the heading after view changes (via effect on onSwitchView identity).
 */
export function usePanelFocus(
  onSwitchView: (kind: ViewType["kind"]) => void
): { headingRef: RefObject<HTMLHeadingElement | null> } {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Keyboard binding: Ctrl+1–5 switches panels
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const key = shouldSwitchPanel(e);
      if (key !== null) {
        e.preventDefault();
        const kind = VIEW_SHORTCUTS[key];
        onSwitchView(kind);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onSwitchView]);

  // Move focus to the view heading after view changes
  // NOTE: this effect also runs on mount, which is acceptable
  useEffect(() => {
    headingRef.current?.focus();
  }, [onSwitchView]);

  return { headingRef };
}
