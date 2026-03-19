/**
 * useCommandPalette hook — command palette open state and keyboard binding.
 *
 * Provides:
 * - open/setOpen state for the command palette
 * - Ctrl+Shift+P / Cmd+Shift+P keyboard binding to open the palette
 *
 * Pure function extraction: shouldOpenCommandPalette(e) exported for direct test
 * assertions without React renderer — same pattern as shouldTogglePreview.
 *
 * Design decision (documented in STATE.md):
 * - shouldTogglePreview uses lowercase "p" (no Shift held)
 * - shouldOpenCommandPalette uses uppercase "P" (Shift IS held — the key value
 *   changes to uppercase when Shift is pressed)
 * - Do NOT import cmdk here — this hook manages open state only.
 *   The CommandPalette component (plan 03) imports cmdk.
 */
import { useState, useEffect } from "react";

/**
 * Pure function: returns true if the keyboard event should open the command palette.
 * Exported for direct test assertions without mounting the hook.
 *
 * Matches: (ctrlKey || metaKey) && shiftKey && key === "P" (uppercase).
 * Key is uppercase "P" because Shift is held — the browser reports "P" not "p".
 */
export function shouldOpenCommandPalette(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P";
}

export interface UseCommandPaletteReturn {
  open: boolean;
  setOpen: (v: boolean) => void;
}

/**
 * useCommandPalette — command palette open state hook.
 *
 * Default state: open=false
 *
 * Keyboard: Ctrl+Shift+P / Cmd+Shift+P opens the palette, calls e.preventDefault()
 */
export function useCommandPalette(): UseCommandPaletteReturn {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (shouldOpenCommandPalette(e)) {
        e.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  return { open, setOpen };
}
