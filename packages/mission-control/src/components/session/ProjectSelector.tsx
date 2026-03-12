/**
 * ProjectSelector — project list sorted by recent activity.
 *
 * Fetches /api/projects/recent on mount, renders sorted list with
 * GSD badge for GSD-initialized projects.
 */
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface RecentProject {
  name: string;
  path: string;
  lastOpened: number;
  isGsdProject: boolean;
}

interface ProjectSelectorProps {
  onSelectProject: (path: string) => void;
  className?: string;
}

interface ProjectSelectorViewProps {
  projects: RecentProject[];
  onSelectProject: (path: string) => void;
  className?: string;
}

/**
 * Pure render function for testing (no hooks/fetch).
 */
export function ProjectSelectorView({
  projects,
  onSelectProject,
  className,
}: ProjectSelectorViewProps) {
  const sorted = [...projects].sort((a, b) => b.lastOpened - a.lastOpened);

  return (
    <div className={cn("space-y-1", className)}>
      {sorted.map((project) => (
        <button
          key={project.path}
          onClick={() => onSelectProject(project.path)}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-navy-700"
        >
          <div className="min-w-0 flex-1">
            <span className="block truncate font-display text-sm text-slate-200">
              {project.name}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {project.path}
            </span>
          </div>
          {project.isGsdProject && (
            <span className="shrink-0 rounded bg-cyan-accent/10 px-1.5 py-0.5 text-xs text-cyan-accent">
              GSD
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * ProjectSelector with fetch on mount.
 */
export function ProjectSelector({ onSelectProject, className }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<RecentProject[]>([]);

  useEffect(() => {
    fetch("/api/projects/recent")
      .then((res) => res.json())
      .then((data: { projects: RecentProject[] }) => {
        setProjects(data.projects ?? []);
      })
      .catch(() => {
        // Fetch failed — leave empty
      });
  }, []);

  return (
    <ProjectSelectorView
      projects={projects}
      onSelectProject={onSelectProject}
      className={className}
    />
  );
}
