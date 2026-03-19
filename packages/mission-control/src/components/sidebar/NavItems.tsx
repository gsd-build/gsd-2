import { FolderOpen, Activity, CheckSquare, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItemsProps {
  activeItem?: string;
}

const NAV_ITEMS = [
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "verify", label: "Verify", icon: CheckSquare },
  { id: "history", label: "History", icon: Clock },
] as const;

/**
 * Sidebar navigation items with icons.
 * Only "Projects" is functionally active in Phase 4; others are visual stubs.
 */
export function NavItems({ activeItem = "projects" }: NavItemsProps) {
  return (
    <nav className="flex flex-col gap-1 p-2">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === activeItem;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "flex items-center gap-2 rounded p-2 font-display text-xs uppercase tracking-wider transition-colors",
              isActive
                ? "bg-navy-700 text-cyan-accent"
                : "text-slate-400 hover:bg-navy-800 hover:text-slate-300",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
