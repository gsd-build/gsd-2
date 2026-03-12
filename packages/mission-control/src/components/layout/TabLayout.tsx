import { useState } from "react";
import { cn } from "@/lib/utils";
import { PanelWrapper } from "@/components/layout/PanelWrapper";
import { LAYOUT_DEFAULTS } from "@/styles/design-tokens";
import { MilestoneHeader } from "@/components/milestone/MilestoneHeader";
import { PhaseList } from "@/components/milestone/PhaseList";
import { CommittedHistory } from "@/components/milestone/CommittedHistory";
import { ContextBudgetChart } from "@/components/slice-detail/ContextBudgetChart";
import { BoundaryMap } from "@/components/slice-detail/BoundaryMap";
import { UatStatus } from "@/components/slice-detail/UatStatus";
import { TaskExecuting } from "@/components/active-task/TaskExecuting";
import { TaskWaiting } from "@/components/active-task/TaskWaiting";
import { ChatPanel } from "@/components/chat/ChatPanel";
import type { PlanningState, PhaseState, PlanState } from "@/server/types";
import type { ChatMessage } from "@/server/chat-types";

type TabId = "chat-task" | "milestone" | "slice";

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: "chat-task", label: "Chat & Task" },
  { id: "milestone", label: "Milestone" },
  { id: "slice", label: "Slice" },
];

const TAB_EMPTY_MESSAGES: Record<TabId, { title: string; description: string }> = {
  "chat-task": {
    title: "Chat & Task",
    description: "Start a conversation with /gsd: commands",
  },
  milestone: {
    title: "Milestone",
    description: "No milestone data",
  },
  slice: {
    title: "Slice Detail",
    description: "Select a phase to view details",
  },
};

interface TabLayoutProps {
  className?: string;
  planningState: PlanningState | null;
  chatMessages?: ChatMessage[];
  onChatSend?: (message: string) => void;
  isChatProcessing?: boolean;
}

export function TabLayout({ className, planningState, chatMessages = [], onChatSend, isChatProcessing = false }: TabLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>("chat-task");

  function renderTabContent() {
    if (activeTab === "milestone") {
      return (
        <PanelWrapper
          title="Milestone"
          isLoading={planningState === null}
          isEmpty={planningState !== null && planningState.phases.length === 0}
        >
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
        </PanelWrapper>
      );
    }

    if (activeTab === "slice") {
      // Derive current phase plans: find in_progress phase, or last phase
      const currentPhase = planningState
        ? planningState.phases.find((p) => p.status === "in_progress") ??
          planningState.phases[planningState.phases.length - 1]
        : undefined;
      const currentPhasePlans = currentPhase?.plans ?? [];

      return (
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
      );
    }

    // Chat & Task tab: ChatPanel as primary, task info as compact secondary
    const currentPhase: PhaseState | undefined = planningState
      ? planningState.phases.find((p) => p.status === "in_progress") ??
        planningState.phases[planningState.phases.length - 1]
      : undefined;

    const currentPlan: PlanState | undefined = currentPhase
      ? currentPhase.completedPlans < currentPhase.plans.length
        ? currentPhase.plans[currentPhase.completedPlans]
        : undefined
      : undefined;

    const isExecuting =
      currentPlan !== undefined &&
      currentPhase?.status === "in_progress";

    // Find the next plan for waiting state
    const nextPlan: PlanState | undefined = (() => {
      if (!planningState) return undefined;
      if (currentPhase && currentPhase.completedPlans < currentPhase.plans.length) {
        return currentPhase.plans[currentPhase.completedPlans];
      }
      const nextPhase = planningState.phases.find((p) => p.status === "not_started");
      return nextPhase?.plans[0];
    })();

    const handleSend = onChatSend ?? (() => {});

    return (
      <div className="flex flex-col h-full">
        {/* Compact task status at top */}
        <div className="border-b border-navy-600 bg-navy-900/50">
          <div className="p-2">
            {isExecuting && currentPlan ? (
              <TaskExecuting
                taskId={`${currentPlan.phase}-${String(currentPlan.plan).padStart(2, "0")}`}
                wave={currentPlan.wave}
                planNumber={currentPlan.plan}
                filesCount={currentPlan.files_modified.length}
                taskCount={currentPlan.task_count}
                mustHaves={currentPlan.must_haves}
                filesModified={currentPlan.files_modified}
              />
            ) : (
              <TaskWaiting
                lastCompleted={planningState?.state.stopped_at}
                nextTask={nextPlan ? `Plan ${nextPlan.plan}` : undefined}
                nextPlanNumber={nextPlan?.plan}
              />
            )}
          </div>
        </div>
        {/* Chat panel takes remaining space */}
        <div className="flex-1 min-h-0">
          <ChatPanel
            messages={chatMessages}
            onSend={handleSend}
            isProcessing={isChatProcessing}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Tab bar */}
      <div
        className="flex border-b border-navy-600 bg-navy-900"
        style={{ height: LAYOUT_DEFAULTS.tabBarHeight }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 font-display text-xs uppercase tracking-wider transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-cyan-accent text-cyan-accent"
                : "text-slate-400 hover:bg-navy-700 hover:text-slate-300",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto bg-navy-base">
        {renderTabContent()}
      </div>
    </div>
  );
}
