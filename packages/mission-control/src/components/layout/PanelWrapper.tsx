import { cn } from "@/lib/utils";
import { PanelSkeleton } from "@/components/states/PanelSkeleton";
import { PanelEmpty } from "@/components/states/PanelEmpty";
import { PanelError } from "@/components/states/PanelError";

type PanelVariant = "Sidebar" | "Milestone" | "Slice Detail" | "Active Task" | "Chat";

const EMPTY_MESSAGES: Record<PanelVariant, string> = {
  Sidebar: "No projects found",
  Milestone: "No milestone data",
  "Slice Detail": "Select a phase to view details",
  "Active Task": "No active task",
  Chat: "Start a conversation",
};

interface PanelWrapperProps {
  title: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function PanelWrapper({
  title,
  isLoading,
  isEmpty,
  error,
  onRetry,
  children,
  className,
}: PanelWrapperProps) {
  const variant = title as PanelVariant;

  function renderContent() {
    if (error) {
      return <PanelError error={error} onRetry={onRetry} />;
    }
    if (isLoading) {
      return <PanelSkeleton variant={variant} />;
    }
    if (isEmpty) {
      return (
        <PanelEmpty
          title={title}
          description={EMPTY_MESSAGES[variant] ?? "No data available"}
        />
      );
    }
    return children;
  }

  return (
    <div className={cn("flex h-full flex-col bg-navy-base", className)}>
      <div className="border-b border-navy-600 px-4 py-2">
        <h2 className="font-display text-xs font-bold uppercase tracking-wider text-slate-500">
          {title}
        </h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {renderContent()}
      </div>
    </div>
  );
}
