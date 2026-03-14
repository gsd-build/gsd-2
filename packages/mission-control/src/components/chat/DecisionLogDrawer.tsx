/**
 * DecisionLogDrawer — pure render component.
 * Displays logged decisions from discuss mode as a narrow sidebar.
 * Returns null when not visible.
 */
import type { DecisionEntry } from "@/server/chat-types";

interface DecisionLogDrawerProps {
  decisions: DecisionEntry[];
  visible: boolean;
  builderMode?: boolean;
}

export function DecisionLogDrawer({ decisions, visible, builderMode }: DecisionLogDrawerProps) {
  if (!visible) return null;

  return (
    <div className="animate-in slide-in-from-right duration-200 w-48 border-l border-navy-600 bg-navy-900 flex flex-col flex-shrink-0">
      <div className="border-b border-navy-600 px-3 py-2">
        <span className="text-xs font-display uppercase tracking-wider text-slate-400">
          {builderMode ? 'Your decisions so far' : 'Decisions'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {decisions.length === 0 ? (
          <p className="text-xs text-slate-600 italic p-3">No decisions yet</p>
        ) : (
          decisions.map((d) => (
            <div key={d.questionId} className="border-b border-navy-800 px-3 py-2">
              <p className="text-xs text-slate-400 truncate">{d.area}</p>
              <p className="text-xs text-cyan-accent font-mono truncate">{d.answer}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
