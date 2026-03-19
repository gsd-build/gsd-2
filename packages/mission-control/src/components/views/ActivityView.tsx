/**
 * ActivityView — live stream activity feed showing tool calls, text, and thinking.
 *
 * Renders a scrollable list of ActivityItems with icons, timestamps,
 * and sub-agent indicators. Auto-scrolls to bottom on new items.
 */
import { useEffect, useRef } from "react";
import type { ActivityItem } from "@/hooks/useActivity";

export const ACTIVITY_ICONS: Record<ActivityItem["type"], string> = {
  tool_use: "\u{1F527}", // wrench
  text: "\u{1F4DD}", // memo
  thinking: "\u{1F9E0}", // brain
  result: "\u{2705}", // check
};

export function relativeTime(timestamp: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

interface ActivityViewProps {
  activities: ActivityItem[];
}

export function ActivityView({ activities }: ActivityViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activities.length]);

  if (activities.length === 0) {
    return (
      <div className="p-6 text-slate-400 text-sm">
        <h1 className="sr-only">Activity</h1>
        No activity yet. Send a message to Claude Code to see live activity.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-2">
      <h1 className="sr-only">Activity</h1>
      {activities.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-2 p-2 border-b border-navy-600 text-sm"
        >
          <span className="text-base flex-shrink-0" aria-hidden="true">
            {ACTIVITY_ICONS[item.type]}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {item.name && (
                <span className="font-mono text-cyan-accent text-xs">
                  {item.name}
                </span>
              )}
              {item.isSubAgent && (
                <span className="text-xs bg-navy-600 text-slate-400 px-1 rounded">
                  sub-agent
                </span>
              )}
              <span className="text-xs text-slate-500 ml-auto flex-shrink-0">
                {relativeTime(item.timestamp)}
              </span>
            </div>
            {item.content && (
              <p className="text-slate-300 text-xs mt-1 truncate">
                {item.content.slice(0, 200)}
              </p>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
