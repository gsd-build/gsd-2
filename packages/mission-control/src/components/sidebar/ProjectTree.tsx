/**
 * ProjectTree — sidebar navigation tree.
 *
 * Shows tree items: Chat, Milestones, History.
 * Clicking an item fires onSelectView with the corresponding ViewType.
 * Active item highlighted with cyan-accent text and left border.
 */
import {
  MessageSquare,
  Flag,
  Clock,
  Images,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewType } from "@/lib/view-types";
import type { GSD2ProjectState } from "@/server/types";

interface ProjectTreeProps {
  projectState: GSD2ProjectState | null;
  activeView: ViewType;
  onSelectView: (view: ViewType) => void;
}

interface TreeItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function TreeItem({ icon, label, active, onClick }: TreeItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[44px] w-full items-center gap-2 p-2 text-left text-sm transition-colors hover:bg-navy-700",
        active
          ? "border-l-2 border-cyan-accent text-cyan-accent"
          : "border-l-2 border-transparent text-slate-400 hover:text-slate-300",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function ProjectTree({
  projectState,
  activeView,
  onSelectView,
}: ProjectTreeProps) {
  return (
    <div className="flex flex-col">
      <TreeItem
        icon={<MessageSquare className="h-4 w-4 flex-shrink-0" />}
        label="Chat"
        active={activeView.kind === "chat"}
        onClick={() => onSelectView({ kind: "chat" })}
      />

      <TreeItem
        icon={<Flag className="h-4 w-4 flex-shrink-0" />}
        label="Milestones"
        active={activeView.kind === "milestone"}
        onClick={() => onSelectView({ kind: "milestone" })}
      />

      <TreeItem
        icon={<Clock className="h-4 w-4 flex-shrink-0" />}
        label="History"
        active={activeView.kind === "history"}
        onClick={() => onSelectView({ kind: "history" })}
      />

      <TreeItem
        icon={<Images className="h-4 w-4 flex-shrink-0" />}
        label="Assets"
        active={activeView.kind === "assets"}
        onClick={() => onSelectView({ kind: "assets" })}
      />
    </div>
  );
}
