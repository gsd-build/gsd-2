import { cn } from "@/lib/utils";
import type { PlanState } from "@/server/types";

const BUDGET_COLORS = {
  green: { bg: "bg-status-success", label: "Under budget" },
  amber: { bg: "bg-status-warning", label: "Near budget" },
  red: { bg: "bg-status-error", label: "Over budget" },
} as const;

function getBudgetColor(filesPerTask: number): keyof typeof BUDGET_COLORS {
  if (filesPerTask < 4) return "green";
  if (filesPerTask <= 6) return "amber";
  return "red";
}

interface ContextBudgetChartProps {
  plans: PlanState[];
}

export function ContextBudgetChart({ plans }: ContextBudgetChartProps) {
  if (plans.length === 0) {
    return (
      <div className="text-slate-500 font-mono text-xs p-4">No plan data</div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="font-display text-xs uppercase tracking-wider text-slate-400">
        Context Budget
      </h3>
      {plans.map((plan) => {
        const filesPerTask =
          plan.files_modified.length / Math.max(plan.task_count, 1);
        const color = getBudgetColor(filesPerTask);
        const config = BUDGET_COLORS[color];
        const widthPercent = Math.min(100, filesPerTask * 15);

        return (
          <div key={plan.plan} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-400">
                Plan {plan.plan}
              </span>
              <span className="font-mono text-xs text-slate-500">
                {config.label}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-navy-700">
              <div
                className={cn("h-full rounded-full", config.bg)}
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
