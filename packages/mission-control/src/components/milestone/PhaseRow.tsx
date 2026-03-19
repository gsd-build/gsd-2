import { Circle, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/shared/ProgressBar";
import type { PhaseState } from "@/server/types";

interface PhaseRowProps {
  phase: PhaseState;
  description?: string;
}

const STATUS_ICONS = {
  not_started: { icon: Circle, className: "text-slate-500" },
  in_progress: { icon: Loader2, className: "text-status-warning animate-spin" },
  complete: { icon: CheckCircle2, className: "text-status-success" },
} as const;

export function PhaseRow({ phase, description }: PhaseRowProps) {
  const { icon: StatusIcon, className: iconClassName } = STATUS_ICONS[phase.status];
  const progressPercent =
    phase.plans.length > 0 ? (phase.completedPlans / phase.plans.length) * 100 : 0;

  return (
    <div className="border-b border-navy-700">
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Status icon */}
        <StatusIcon className={cn("h-4 w-4 shrink-0", iconClassName)} />

        {/* Phase ID */}
        <span className="shrink-0 font-display text-sm text-cyan-accent">
          Phase {phase.number}
        </span>

        {/* Description + progress */}
        <div className="flex-1">
          <p className="font-mono text-xs text-slate-400">
            {description || phase.name}
          </p>
          <ProgressBar value={progressPercent} className="mt-1" />
        </div>

        {/* Plan counts */}
        <span className="shrink-0 font-mono text-xs text-slate-500">
          {phase.completedPlans}/{phase.plans.length}
        </span>
      </div>

      {/* Commit message for completed phases */}
      {phase.status === "complete" && (
        <p className="pb-2 pl-8 font-mono text-xs text-slate-500">
          Phase {phase.number} complete
        </p>
      )}
    </div>
  );
}
