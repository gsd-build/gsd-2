/**
 * ViewportSwitcher — row of four viewport buttons for the live preview panel.
 *
 * Pure render component: no hooks, no side effects.
 * Buttons: Desktop (1440px), Tablet (768px), Mobile (375px), Dual.
 * Active button highlighted with cyan accent.
 */
import { Monitor, Tablet, Smartphone, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Viewport } from "@/hooks/usePreview";

export interface ViewportSwitcherProps {
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
}

const VIEWPORT_BUTTONS: {
  value: Viewport;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "tablet", label: "Tablet", icon: Tablet },
  { value: "mobile", label: "Mobile", icon: Smartphone },
  { value: "dual", label: "Dual", icon: Columns2 },
];

export function ViewportSwitcher({ viewport, onViewportChange }: ViewportSwitcherProps) {
  return (
    <div className="flex items-center gap-1 px-2">
      {VIEWPORT_BUTTONS.map(({ value, label, icon: Icon }) => {
        const isActive = viewport === value;
        return (
          <button
            key={value}
            onClick={() => onViewportChange(value)}
            title={label}
            aria-label={label}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors",
              isActive
                ? "bg-cyan-accent/20 text-cyan-accent border border-cyan-accent/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-navy-700 border border-transparent"
            )}
          >
            <Icon size={12} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
