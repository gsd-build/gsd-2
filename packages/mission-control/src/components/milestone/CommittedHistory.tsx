import { CheckCircle2 } from "lucide-react";
import type { PhaseState } from "@/server/types";

interface CommittedHistoryProps {
  phases: PhaseState[];
}

export function CommittedHistory({ phases }: CommittedHistoryProps) {
  const completedPhases = phases.filter((p) => p.status === "complete");

  if (completedPhases.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-navy-600">
      <h3 className="px-4 py-2 font-display text-xs uppercase tracking-wider text-slate-500">
        Committed History
      </h3>
      <div>
        {completedPhases.map((phase) => (
          <div key={phase.number} className="flex items-center gap-2 px-4 py-2">
            <CheckCircle2 className="h-4 w-4 text-status-success" />
            <span className="font-mono text-xs text-slate-400">
              {phase.name}
            </span>
            <span className="font-mono text-xs text-slate-500">
              Phase {phase.number} complete
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
