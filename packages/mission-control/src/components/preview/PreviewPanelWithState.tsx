/**
 * PreviewPanelWithState — stateful wrapper for PreviewPanel.
 *
 * Owns port and viewport state. Used by AppShell.
 * Pattern matches ReviewViewWithAnimation (stateful) over ReviewView (pure).
 *
 * Accepts optional initial port and viewport from outside (e.g., AppShell can pass
 * the port and viewport detected by usePreview hook). onClose is required.
 * onViewportChange is lifted to AppShell so viewport changes persist to session file.
 */
import { useState } from "react";
import { PreviewPanel } from "./PreviewPanel";
import type { Viewport } from "@/hooks/usePreview";

export interface PreviewPanelWithStateProps {
  initialPort?: number | null;
  initialViewport?: Viewport;
  onClose: () => void;
  onViewportChange?: (v: Viewport) => void;
  isNativeApp?: boolean;
}

export function PreviewPanelWithState({
  initialPort = null,
  initialViewport = "desktop",
  onClose,
  onViewportChange,
  isNativeApp = false,
}: PreviewPanelWithStateProps) {
  const [port, setPort] = useState<number | null>(initialPort);
  const [viewport, setViewport] = useState<Viewport>(initialViewport);

  const handleViewportChange = (v: Viewport) => {
    setViewport(v);
    onViewportChange?.(v);
  };

  return (
    <PreviewPanel
      port={port}
      viewport={viewport}
      onClose={onClose}
      onPortChange={setPort}
      onViewportChange={handleViewportChange}
      isNativeApp={isNativeApp}
    />
  );
}
