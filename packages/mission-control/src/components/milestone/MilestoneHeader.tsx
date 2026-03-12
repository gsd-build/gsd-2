import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/shared/ProgressBar";
import type { ProjectState, RoadmapState } from "@/server/types";

interface MilestoneHeaderProps {
  projectState: ProjectState | null;
  roadmap: RoadmapState | null;
}

export function MilestoneHeader({ projectState }: MilestoneHeaderProps) {
  if (!projectState) {
    return (
      <div className="border-b border-navy-600 p-4">
        <div className="mb-2 h-4 w-24 animate-pulse rounded bg-navy-700" />
        <div className="h-6 w-48 animate-pulse rounded bg-navy-700" />
      </div>
    );
  }

  return (
    <div className="border-b border-navy-600 p-4">
      {/* Branch badge */}
      <div className="mb-2">
        <span className={cn(
          "inline-flex items-center gap-1 rounded bg-navy-700 px-2 py-0.5",
          "font-mono text-xs text-slate-400",
        )}>
          <GitBranch className="h-3 w-3" />
          {projectState.branch}
        </span>
      </div>

      {/* Milestone name */}
      <h2 className="font-display text-lg font-bold text-cyan-accent">
        {projectState.milestone_name}
      </h2>

      {/* Progress bar */}
      <div className="mt-2">
        <ProgressBar value={projectState.progress.percent} />
      </div>

      {/* Task counts */}
      <p className="mt-2 font-mono text-xs text-slate-400">
        {projectState.progress.completed_plans} / {projectState.progress.total_plans} plans complete
      </p>
    </div>
  );
}
