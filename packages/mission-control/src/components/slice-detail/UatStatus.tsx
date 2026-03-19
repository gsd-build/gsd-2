import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/shared/ProgressBar";
import type { PhaseState } from "@/server/types";

const STATUS_BADGE = {
  pass: { bg: "bg-status-success/20", text: "text-status-success", label: "PASS" },
  fail: { bg: "bg-status-error/20", text: "text-status-error", label: "FAIL" },
  partial: { bg: "bg-status-warning/20", text: "text-status-warning", label: "PARTIAL" },
} as const;

function getStatusBadge(status: string) {
  if (status === "pass") return STATUS_BADGE.pass;
  if (status === "fail") return STATUS_BADGE.fail;
  return STATUS_BADGE.partial;
}

interface UatStatusProps {
  phases: PhaseState[];
}

export function UatStatus({ phases }: UatStatusProps) {
  const phasesWithVerifications = phases.filter(
    (p) => p.verifications && p.verifications.length > 0
  );

  if (phasesWithVerifications.length === 0) {
    return (
      <div className="text-slate-500 font-mono text-xs p-4">
        No verification data
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="font-display text-xs uppercase tracking-wider text-slate-400">
        UAT Status
      </h3>
      {phasesWithVerifications.map((phase) =>
        phase.verifications.map((v, idx) => {
          const badge = getStatusBadge(v.status);
          return (
            <div
              key={`${phase.number}-${idx}`}
              className="flex items-center gap-4 rounded bg-navy-900 p-2"
            >
              <span className="font-mono text-xs text-slate-400 min-w-[80px]">
                Phase {phase.number}
              </span>
              <div className="flex-1">
                <ProgressBar value={v.score} />
              </div>
              <span className="font-mono text-xs text-slate-500">
                {v.truths.length} truths
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-xs uppercase",
                  badge.bg,
                  badge.text
                )}
              >
                {badge.label}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
