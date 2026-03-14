/**
 * ProjectCardMenu — ··· dropdown menu for a project card.
 * Actions: Archive, Open in Finder/Explorer, Remove from list.
 */
import React, { useState } from "react";
import { Archive, FolderOpen, Trash2 } from "lucide-react";
import type { RecentProject } from "@/server/fs-types";

interface ProjectCardMenuProps {
  /** The project this menu is for. */
  project: RecentProject;
  /** Called when the menu should close (parent toggles visibility). */
  onClose?: () => void;
  /** Called after archive succeeds — parent re-fetches project list. */
  onRefresh?: () => void;
}

const menuStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  zIndex: 50,
  minWidth: 180,
  background: "#1A2332",
  border: "1px solid #1E2D3D",
  borderRadius: 4,
  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  overflow: "hidden",
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  color: "#CBD5E1",
  cursor: "pointer",
  background: "transparent",
  border: "none",
  width: "100%",
  textAlign: "left",
};

/**
 * Reveal a path in Finder/Explorer via Tauri IPC.
 * No-op when not in a Tauri context.
 */
async function revealInFinder(path: string): Promise<void> {
  try {
    // Dynamic import so it does not throw at module load in non-Tauri environments.
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("reveal_path", { path });
  } catch {
    // Not in Tauri context — silently ignore.
  }
}

/**
 * ProjectCardMenu — absolute-positioned dropdown, inline pattern (no library).
 * Rendered always-visible when open; parent controls visibility via `show` state.
 * When used as a standalone component (e.g. in tests), it renders its items directly.
 */
export default function ProjectCardMenu({
  project,
  onClose,
  onRefresh,
}: ProjectCardMenuProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const getItemStyle = (key: string): React.CSSProperties => ({
    ...itemStyle,
    background: hovered === key ? "#1E2D3D" : "transparent",
  });

  async function handleArchive() {
    try {
      await fetch("/api/projects/recent/archive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: project.path, archived: true }),
      });
    } catch {
      // Best effort
    }
    onRefresh?.();
    onClose?.();
  }

  async function handleOpenInFinder() {
    await revealInFinder(project.path);
    onClose?.();
  }

  async function handleRemove() {
    try {
      await fetch("/api/projects/recent", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: project.path }),
      });
    } catch {
      // Best effort
    }
    onRefresh?.();
    onClose?.();
  }

  return (
    <div style={menuStyle} role="menu">
      <button
        style={getItemStyle("archive")}
        onMouseEnter={() => setHovered("archive")}
        onMouseLeave={() => setHovered(null)}
        onClick={handleArchive}
        role="menuitem"
      >
        <Archive size={16} />
        Archive
      </button>

      <button
        style={getItemStyle("finder")}
        onMouseEnter={() => setHovered("finder")}
        onMouseLeave={() => setHovered(null)}
        onClick={handleOpenInFinder}
        role="menuitem"
      >
        <FolderOpen size={16} />
        Open in Finder/Explorer
      </button>

      <button
        style={getItemStyle("remove")}
        onMouseEnter={() => setHovered("remove")}
        onMouseLeave={() => setHovered(null)}
        onClick={handleRemove}
        role="menuitem"
      >
        <Trash2 size={16} />
        Remove from list
      </button>
    </div>
  );
}
