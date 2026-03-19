import { PhaseRow } from "@/components/milestone/PhaseRow";
import type { PhaseState, RoadmapState } from "@/server/types";

interface PhaseListProps {
  phases: PhaseState[];
  roadmap: RoadmapState | null;
}

export function PhaseList({ phases, roadmap }: PhaseListProps) {
  if (phases.length === 0) {
    return null;
  }

  return (
    <div>
      {phases.map((phase) => {
        const roadmapPhase = roadmap?.phases.find((rp) => rp.number === phase.number);
        return (
          <PhaseRow
            key={phase.number}
            phase={phase}
            description={roadmapPhase?.description}
          />
        );
      })}
    </div>
  );
}
