/**
 * ProjectCard — displays a single recent project with metadata and actions.
 *
 * Shows: name, relative last-active time, active milestone, progress bar,
 * Resume button, and a ··· button that opens ProjectCardMenu.
 */
import React, { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { RecentProject } from "@/server/fs-types";
import ProjectCardMenu from "./ProjectCardMenu";

interface ProjectCardProps {
  /** The project to display. */
  project: RecentProject;
  /** Called when Resume is clicked. */
  onResume?: (path: string) => void;
  /** Called when the project is archived — parent re-fetches list. */
  onRefresh?: () => void;
}

/**
 * Compute a human-readable relative time string from a Unix timestamp.
 */
function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH} hour${diffH === 1 ? "" : "s"} ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} day${diffD === 1 ? "" : "s"} ago`;
}

const cardStyle: React.CSSProperties = {
  background: "#131C2B",
  border: "1px solid #1E2D3D",
  borderRadius: 6,
  padding: 16,
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const nameStyle: React.CSSProperties = {
  fontFamily: "'Share Tech Mono', monospace",
  fontSize: 15,
  color: "#E2E8F0",
  margin: 0,
  paddingRight: 32, // space for ··· button
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const metaStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  color: "#64748B",
};

const milestoneStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  color: "#5BC8F0",
  background: "rgba(91,200,240,0.08)",
  borderRadius: 3,
  padding: "2px 6px",
  display: "inline-block",
};

const trackStyle: React.CSSProperties = {
  width: "100%",
  height: 6,
  background: "#1E2D3D",
  borderRadius: 3,
};

const resumeButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#5BC8F0",
  color: "#0F1419",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 16px",
  borderRadius: 4,
  border: "none",
  cursor: "pointer",
  alignSelf: "flex-start",
};

const menuButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  background: "transparent",
  border: "none",
  color: "#64748B",
  cursor: "pointer",
  padding: 2,
  borderRadius: 3,
  display: "flex",
  alignItems: "center",
};

export default function ProjectCard({
  project,
  onResume,
  onRefresh,
}: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const progressPercent = project.progressPercent ?? 0;

  return (
    <div style={cardStyle}>
      {/* ··· menu trigger */}
      <button
        style={menuButtonStyle}
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="More options"
      >
        <MoreHorizontal size={18} />
      </button>

      {/* Inline ··· menu */}
      {menuOpen && (
        <div style={{ position: "absolute", top: 36, right: 12, zIndex: 50 }}>
          <ProjectCardMenu
            project={project}
            onClose={() => setMenuOpen(false)}
            onRefresh={() => {
              setMenuOpen(false);
              onRefresh?.();
            }}
          />
        </div>
      )}

      {/* Project name */}
      <h3 style={nameStyle}>{project.name}</h3>

      {/* Relative time */}
      <span style={metaStyle}>{relativeTime(project.lastOpened)}</span>

      {/* Active milestone */}
      {project.activeMilestone && (
        <span style={milestoneStyle}>{project.activeMilestone}</span>
      )}

      {/* Progress bar */}
      <div style={trackStyle}>
        <div
          style={{
            width: `${progressPercent}%`,
            height: "100%",
            background: "#5BC8F0",
            borderRadius: 3,
          }}
        />
      </div>

      {/* Resume button */}
      <button
        style={resumeButtonStyle}
        onClick={() => onResume?.(project.path)}
      >
        Resume
      </button>
    </div>
  );
}
