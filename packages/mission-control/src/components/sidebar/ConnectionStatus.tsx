import { cn } from "@/lib/utils";
import type { ConnectionStatus as ConnectionStatusType } from "@/hooks/useReconnectingWebSocket";

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  modelProfile?: string;
  collapsed?: boolean;
}

const STATUS_CONFIG: Record<
  ConnectionStatusType,
  { dot: string; pulse: boolean; label: string }
> = {
  connected: { dot: "bg-cyan-accent", pulse: true, label: "ACTIVE" },
  connecting: { dot: "bg-status-warning", pulse: true, label: "CONNECTING" },
  disconnected: { dot: "bg-status-error", pulse: false, label: "DISCONNECTED" },
};

/**
 * Connection indicator with status dot, label, and model profile display.
 * Shows pulsing dot for active/connecting states, static for disconnected.
 */
export function ConnectionStatus({
  status,
  modelProfile,
  collapsed = false,
}: ConnectionStatusProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex flex-col gap-1">
      <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-2")}>
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            config.dot,
            config.pulse && "animate-pulse",
          )}
        />
        {!collapsed && (
          <span className="font-display text-xs uppercase tracking-wider text-slate-400">
            {config.label}
          </span>
        )}
      </div>
      {!collapsed && (
        <span className="font-mono text-xs text-slate-500">
          {modelProfile || "balanced"}
        </span>
      )}
    </div>
  );
}
