/**
 * Project list showing the current project with status badge, progress,
 * recent projects for quick re-opening, and Open Folder button.
 */
import { FolderOpen, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectState } from "@/server/types";
import type { RecentProject } from "@/server/fs-types";

interface ProjectListProps {
  projectState: ProjectState | null;
  recentProjects?: RecentProject[];
  onOpenBrowser?: () => void;
  onSwitchProject?: (path: string) => void;
}

const STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  completed: { dot: "bg-status-success", label: "Complete" },
  active: { dot: "bg-cyan-accent", label: "Active" },
  in_progress: { dot: "bg-cyan-accent", label: "Active" },
  paused: { dot: "bg-status-warning", label: "Paused" },
};

export function ProjectList({
  projectState,
  recentProjects = [],
  onOpenBrowser,
  onSwitchProject,
}: ProjectListProps) {
  const statusConfig = projectState
    ? STATUS_STYLES[projectState.status] ?? { dot: "bg-slate-400", label: projectState.status }
    : null;

  const projectName = projectState?.milestone_name || "Current Project";
  const percent = projectState?.progress.percent ?? 0;

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* Current project */}
      {projectState && statusConfig && (
        <>
          <div className="flex items-center gap-2">
            <span className={cn("inline-block h-2 w-2 rounded-full", statusConfig.dot)} />
            <span className="flex-1 truncate font-display text-xs text-slate-400">
              {projectName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-500">
              {statusConfig.label}
            </span>
            <span className="font-mono text-xs text-slate-500">{percent}%</span>
          </div>
          {/* Progress bar */}
          <div className="h-1 w-full overflow-hidden rounded-full bg-navy-700">
            <div
              className="h-full rounded-full bg-cyan-accent transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      )}

      {/* Open Folder button */}
      {onOpenBrowser && (
        <button
          type="button"
          onClick={onOpenBrowser}
          className={cn(
            "flex items-center gap-2 rounded px-2 py-1 mt-2",
            "text-xs text-slate-400 hover:text-cyan-accent hover:bg-navy-700 transition-colors"
          )}
        >
          <FolderOpen className="h-3 w-3" />
          Open Folder
        </button>
      )}

      {/* Recent projects */}
      {recentProjects.length > 0 && (
        <div className="mt-2 border-t border-navy-700 pt-2">
          <div className="flex items-center gap-1 mb-1">
            <Clock className="h-3 w-3 text-slate-500" />
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-500">
              Recent
            </span>
          </div>
          {recentProjects.slice(0, 5).map((project) => (
            <button
              key={project.path}
              type="button"
              onClick={() => onSwitchProject?.(project.path)}
              className={cn(
                "flex w-full items-center gap-2 rounded py-1 px-2 text-left",
                "text-xs font-mono text-slate-400 hover:bg-navy-700 hover:text-slate-300 transition-colors"
              )}
              title={project.path}
            >
              <span className="truncate flex-1">{project.name}</span>
              {project.isGsdProject && (
                <span className="shrink-0 rounded px-1 text-[10px] font-bold text-cyan-accent bg-cyan-accent/10">
                  GSD
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
