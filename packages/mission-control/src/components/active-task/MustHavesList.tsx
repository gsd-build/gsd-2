import { cn } from "@/lib/utils";
import type { MustHaves } from "@/server/types";

interface MustHavesListProps {
  mustHaves?: MustHaves;
}

type Tier = "BEHAVIORAL" | "STATIC" | "COMMAND" | "HUMAN";

const TIER_STYLES: Record<Tier, string> = {
  BEHAVIORAL: "bg-cyan-accent/20 text-cyan-accent",
  STATIC: "bg-status-success/20 text-status-success",
  COMMAND: "bg-status-warning/20 text-status-warning",
  HUMAN: "bg-status-error/20 text-status-error",
};

function classifyTier(truth: string): Tier {
  const lower = truth.toLowerCase();
  if (/user|human|verify/.test(lower)) return "HUMAN";
  if (/command|runs|passes/.test(lower)) return "COMMAND";
  if (/file|exists|path/.test(lower)) return "STATIC";
  return "BEHAVIORAL";
}

export function MustHavesList({ mustHaves }: MustHavesListProps) {
  const truths = mustHaves?.truths ?? [];

  return (
    <div className="space-y-2">
      <h3 className="font-display text-xs uppercase tracking-wider text-slate-400">
        Must-Haves
      </h3>
      {truths.length === 0 ? (
        <p className="font-mono text-xs text-slate-500">No must-haves defined</p>
      ) : (
        <ul className="space-y-1">
          {truths.map((truth) => {
            const tier = classifyTier(truth);
            return (
              <li key={truth} className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full border border-slate-500" />
                <span className="flex-1 font-mono text-xs text-slate-300">{truth}</span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider",
                    TIER_STYLES[tier],
                  )}
                >
                  {tier}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
