import { useRef, useState, useEffect } from "react";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { MustHavesList } from "@/components/active-task/MustHavesList";
import { TargetFiles } from "@/components/active-task/TargetFiles";
import { CheckpointRef } from "@/components/active-task/CheckpointRef";
import type { MustHaves } from "@/server/types";

/** Pure function: returns true when taskId changed and previous was a non-empty value. */
export function shouldPulseOnTaskChange(
  prev: string | undefined,
  current: string,
): boolean {
  if (!prev) return false;
  return prev !== current;
}

const BUDGET_COLORS = {
  green: "bg-status-success",
  amber: "bg-status-warning",
  red: "bg-status-error",
} as const;

function getBudgetColor(filesCount: number, taskCount: number) {
  const ratio = taskCount > 0 ? filesCount / taskCount : 0;
  if (ratio > 6) return BUDGET_COLORS.red;
  if (ratio >= 4) return BUDGET_COLORS.amber;
  return BUDGET_COLORS.green;
}

interface TaskExecutingProps {
  taskId: string;
  wave: number;
  planNumber: number;
  filesCount: number;
  taskCount: number;
  mustHaves?: MustHaves;
  filesModified: string[];
  checkpoint?: string;
  /** Internal: pulse animation class applied when task advances. Managed by TaskExecutingConnected. */
  isPulsing?: boolean;
}

/**
 * Pure (hook-free) render function for the executing task status panel.
 * Used directly in tests (direct function call pattern) and composed by TaskExecutingConnected.
 */
export function TaskExecuting({
  taskId,
  wave,
  planNumber,
  filesCount,
  taskCount,
  mustHaves,
  filesModified,
  checkpoint,
  isPulsing = false,
}: TaskExecutingProps) {
  const budgetColor = getBudgetColor(filesCount, taskCount);
  const budgetPercent = taskCount > 0 ? Math.min(100, (filesCount / taskCount) * 15) : 0;

  return (
    <div className={`space-y-4${isPulsing ? " task-advance-pulse" : ""}`}>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-status-warning animate-pulse" />
          <span className="font-display text-xs uppercase tracking-wider text-slate-400">
            Executing
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm text-slate-300">{taskId}</span>
          <span className="font-mono text-xs text-slate-500">Wave {wave}</span>
        </div>
      </div>

      {/* Context Budget Meter */}
      <div className="space-y-1">
        <span className="font-display text-xs uppercase tracking-wider text-slate-400">
          Context Budget
        </span>
        <ProgressBar value={budgetPercent} barClassName={budgetColor} />
        <span className="font-mono text-[10px] text-slate-500">
          {filesCount} files / {taskCount} tasks
        </span>
      </div>

      {/* Must-Haves */}
      <MustHavesList mustHaves={mustHaves} />

      {/* Target Files */}
      <TargetFiles files={filesModified} />

      {/* Checkpoint */}
      <CheckpointRef checkpoint={checkpoint} />
    </div>
  );
}

/**
 * Stateful wrapper around TaskExecuting that manages the pulse animation
 * when taskId changes. Use this in the app; use TaskExecuting in tests.
 */
export function TaskExecutingConnected(props: Omit<TaskExecutingProps, "isPulsing">) {
  const prevTaskIdRef = useRef<string | undefined>(undefined);
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (shouldPulseOnTaskChange(prevTaskIdRef.current, props.taskId)) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 150);
      return () => clearTimeout(timer);
    }
    prevTaskIdRef.current = props.taskId;
  }, [props.taskId]);

  return <TaskExecuting {...props} isPulsing={isPulsing} />;
}
