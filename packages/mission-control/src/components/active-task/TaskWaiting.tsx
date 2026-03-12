interface TaskWaitingProps {
  lastCompleted?: string;
  nextTask?: string;
  nextPlanNumber?: number;
}

export function TaskWaiting({ lastCompleted, nextTask, nextPlanNumber }: TaskWaitingProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-slate-500" />
        <span className="font-display text-xs uppercase tracking-wider text-slate-400">
          Waiting
        </span>
      </div>

      {/* Last completed */}
      <div>
        <span className="font-mono text-xs text-slate-500">
          {lastCompleted ? `Last: ${lastCompleted}` : "No completed tasks"}
        </span>
      </div>

      {/* Next task */}
      <div>
        <span className="font-mono text-sm text-slate-300">
          {nextPlanNumber != null ? `Next: Plan ${nextPlanNumber}` : "No pending tasks"}
        </span>
      </div>

      {/* Run prompt */}
      <div>
        <span className="font-display text-xs uppercase text-cyan-accent">
          Run /gsd:progress to continue
        </span>
      </div>
    </div>
  );
}
