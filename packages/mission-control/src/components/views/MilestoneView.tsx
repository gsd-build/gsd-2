/**
 * MilestoneView — standalone milestone overview with optional split view.
 *
 * When multiple sessions have active worktrees, shows a stacked view
 * with one section per worktree session. Each section displays the session
 * name + branch badge and standard milestone content.
 *
 * When only one session or no worktrees: renders standard single milestone view.
 */
import { PanelWrapper } from "@/components/layout/PanelWrapper";
import { MilestoneHeader } from "@/components/milestone/MilestoneHeader";
import { PhaseList } from "@/components/milestone/PhaseList";
import { CommittedHistory } from "@/components/milestone/CommittedHistory";
import type { PlanningState } from "@/server/types";

export interface WorktreeSessionInfo {
  id: string;
  name: string;
  worktreePath: string | null;
  worktreeBranch?: string | null;
}

interface MilestoneViewProps {
  planningState: PlanningState | null;
  /** Optional sessions list — when provided, enables split view for worktree sessions. */
  sessions?: WorktreeSessionInfo[];
}

/** Standard milestone content (reused in both single and split views). */
function MilestoneContent({ planningState }: { planningState: PlanningState | null }) {
  return (
    <div className="flex flex-col">
      <MilestoneHeader
        projectState={planningState?.state ?? null}
        roadmap={planningState?.roadmap ?? null}
      />
      <PhaseList
        phases={planningState?.phases ?? []}
        roadmap={planningState?.roadmap ?? null}
      />
      <CommittedHistory phases={planningState?.phases ?? []} />
    </div>
  );
}

/** Session section header with name and branch badge. */
function SessionSectionHeader({ session }: { session: WorktreeSessionInfo }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-navy-800/50 border-b border-navy-600">
      <span className="font-medium text-sm text-slate-300">{session.name}</span>
      {session.worktreeBranch ? (
        <span className="text-xs px-2 py-0.5 rounded bg-cyan-accent/10 text-cyan-accent font-mono">
          {session.worktreeBranch}
        </span>
      ) : (
        <span className="text-xs px-2 py-0.5 rounded bg-navy-700 text-slate-500">
          Watching main branch
        </span>
      )}
    </div>
  );
}

export function MilestoneView({ planningState, sessions }: MilestoneViewProps) {
  const phases = planningState?.phases ?? [];
  const worktreeSessions = sessions?.filter((s) => s.worktreePath) ?? [];

  // Split view: when 2+ sessions have worktrees — stacked vertically
  if (worktreeSessions.length >= 2) {
    return (
      <>
        {/* Screen-reader h1 for this view — PanelWrapper renders an h2 label, not h1 */}
        <h1 className="sr-only">Milestone</h1>
        <PanelWrapper
          title="Milestone"
          isLoading={planningState === null}
          isEmpty={planningState !== null && phases.length === 0}
        >
          <div className="space-y-4">
            {worktreeSessions.map((session, index) => (
              <div key={session.id} className="animate-in fade-in duration-200 rounded-lg border border-navy-600 overflow-hidden" style={{ animationDelay: `${index * 40}ms` }}>
                <SessionSectionHeader session={session} />
                <div className="overflow-auto max-h-[50vh]">
                  <MilestoneContent planningState={planningState} />
                </div>
              </div>
            ))}
          </div>
        </PanelWrapper>
      </>
    );
  }

  // Standard single view
  return (
    <>
      {/* Screen-reader h1 for this view — PanelWrapper renders an h2 label, not h1 */}
      <h1 className="sr-only">Milestone</h1>
      <PanelWrapper
        title="Milestone"
        isLoading={planningState === null}
        isEmpty={planningState !== null && phases.length === 0}
      >
        <MilestoneContent planningState={planningState} />
      </PanelWrapper>
    </>
  );
}
