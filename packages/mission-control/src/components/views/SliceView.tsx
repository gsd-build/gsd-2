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
import type { PlanningState, PlanState } from "@/server/types";

interface SliceViewProps {
  planningState: PlanningState | null;
}

export function SliceView({ planningState }: SliceViewProps) {
  // GSD2 uses slices, not legacy phases. Legacy plan components receive empty arrays
  // until they are updated to consume GSD2SliceInfo/GSD2SlicePlan types.
  const slices = planningState?.slices ?? [];
  const currentPhasePlans: PlanState[] = [];

  return (
    <>
      {/* Screen-reader h1 for this view — PanelWrapper renders an h2 label, not h1 */}
      <h1 className="sr-only">Slice Detail</h1>
      <PanelWrapper
        title="Slice Detail"
        isLoading={planningState === null}
        isEmpty={planningState !== null && slices.length === 0}
      >
        <div className="space-y-6 p-4">
          <ContextBudgetChart plans={currentPhasePlans} />
          <BoundaryMap plans={currentPhasePlans} />
          <UatStatus phases={[]} />
        </div>
      </PanelWrapper>
    </>
  );
}
