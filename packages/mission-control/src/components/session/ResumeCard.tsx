/**
 * ResumeCard — overlay card showing continue-here context.
 *
 * Positioned at top-center of dashboard. Shows phase, task progress,
 * current state, and next action with Resume/Dismiss buttons.
 */
import type { ContinueHereData } from "@/hooks/useSessionFlow";

interface ResumeCardProps {
  data: ContinueHereData;
  onResume: () => void;
  onDismiss: () => void;
}

/**
 * Pure render function for testing (no hooks).
 */
export function ResumeCardView({ data, onResume, onDismiss }: ResumeCardProps) {
  return (
    <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2">
      <div className="max-w-md rounded-lg border border-navy-600 bg-navy-800 p-6 shadow-lg">
        <h3 className="font-display text-cyan-accent">{data.phase}</h3>
        <p className="mt-1 text-sm text-slate-300">
          Task {data.task} of {data.totalTasks} &middot; {data.status}
        </p>
        <div className="mt-3 space-y-1">
          <p className="text-sm text-slate-400">{data.currentState}</p>
          <p className="text-sm text-slate-500">
            Next: {data.nextAction}
          </p>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onResume}
            className="min-h-[44px] rounded-md bg-cyan-accent/20 px-4 py-2 text-sm text-cyan-accent transition-colors hover:bg-cyan-accent/30"
          >
            Resume
          </button>
          <button
            onClick={onDismiss}
            className="min-h-[44px] rounded-md px-4 py-2 text-sm text-slate-400 transition-colors hover:text-slate-200"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ResumeCard component (same as view — no hook state needed).
 */
export function ResumeCard(props: ResumeCardProps) {
  return <ResumeCardView {...props} />;
}
