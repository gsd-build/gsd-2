/**
 * SliceView — standalone slice detail view.
 *
 * Extracted from TabLayout's "Slice" tab content.
 * Shows ContextBudgetChart, BoundaryMap, and UatStatus in PanelWrapper.
 */
import { PanelWrapper } from "@/components/layout/PanelWrapper";
import { ContextBudgetChart } from "@/components/slice-detail/ContextBudgetChart";
import { BoundaryMap } from "@/components/slice-detail/BoundaryMap";
import { UatStatus } from "@/components/slice-detail/UatStatus";
import type { PlanningState } from "@/server/types";

interface SliceViewProps {
  planningState: PlanningState | null;
}

export function SliceView({ planningState }: SliceViewProps) {
  const currentPhase = planningState
    ? planningState.phases.find((p) => p.status === "in_progress") ??
      planningState.phases[planningState.phases.length - 1]
    : undefined;
  const currentPhasePlans = currentPhase?.plans ?? [];

  return (
    <>
      {/* Screen-reader h1 for this view — PanelWrapper renders an h2 label, not h1 */}
      <h1 className="sr-only">Slice Detail</h1>
      <PanelWrapper
        title="Slice Detail"
        isLoading={planningState === null}
        isEmpty={planningState !== null && planningState.phases.length === 0}
      >
        <div className="space-y-6 p-4">
          <ContextBudgetChart plans={currentPhasePlans} />
          <BoundaryMap plans={currentPhasePlans} />
          <UatStatus phases={planningState?.phases ?? []} />
        </div>
      </PanelWrapper>
    </>
  );
}
