/**
 * usePreview hook — live preview panel state management.
 *
 * Provides:
 * - open/port/viewport state
 * - Cmd+P (or Ctrl+P on Windows) keyboard binding to toggle panel
 * - Raw WebSocket listener for preview_open events from server
 *
 * Pure function extraction: shouldTogglePreview(e) exported for direct test
 * assertions without React renderer — same pattern as shouldPulseOnTaskChange.
 */
import { useState, useEffect } from "react";

export type Viewport = "desktop" | "tablet" | "mobile" | "dual";

export interface UsePreviewReturn {
  open: boolean;
  port: number | null;
  viewport: Viewport;
  setOpen: (open: boolean) => void;
  setPort: (port: number | null) => void;
  setViewport: (viewport: Viewport) => void;
}

/**
 * Pure function: returns true if the keyboard event should toggle the preview panel.
 * Exported for direct test assertions without mounting the hook.
 *
 * Matches: (metaKey || ctrlKey) && key === "p" (lowercase only).
 */
export function shouldTogglePreview(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.key === "p";
}

/**
 * usePreview — preview panel state hook.
 *
 * Default state: open=false, port=null, viewport="desktop"
 *
 * Keyboard: Cmd+P / Ctrl+P toggles open, calls e.preventDefault()
 * WebSocket: listens on ws://localhost:4001 for { type: "preview_open", port: number }
 *            sets port and opens panel on receipt
 */
export function usePreview(): UsePreviewReturn {
  const [open, setOpen] = useState(false);
  const [port, setPort] = useState<number | null>(null);
  const [viewport, setViewport] = useState<Viewport>("desktop");

  // Keyboard binding: Cmd+P (macOS) / Ctrl+P (Windows) toggles preview
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (shouldTogglePreview(e)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  // WebSocket: listen for preview_open broadcast from server (pipeline.ts)
  // Uses raw WebSocket (not useReconnectingWebSocket — ws ref not exposed)
  // Pattern follows useChatMode.tsx exactly
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:4001");

    ws.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string);
        if (data.type === "preview_open" && typeof data.port === "number") {
          setPort(data.port);
          setOpen(true);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    return () => ws.close();
  }, []);

  return {
    open,
    port,
    viewport,
    setOpen,
    setPort,
    setViewport,
  };
}
