/**
 * SessionCreateModal — Fresh or Fork session creation choice.
 *
 * Reuses modal pattern from FolderPickerModal.
 * Offers two options: start fresh or fork from current session context.
 */
import { X, MessageSquarePlus, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateFresh: () => void;
  onCreateFork: () => void;
}

export function SessionCreateModal({
  isOpen,
  onClose,
  onCreateFresh,
  onCreateFork,
}: SessionCreateModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[400px] rounded-lg border border-navy-600 bg-navy-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-navy-600 px-4 py-3">
          <MessageSquarePlus className="h-5 w-5 text-cyan-accent" />
          <h2 className="flex-1 font-display text-sm font-bold uppercase tracking-wider text-slate-300">
            New Session
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-navy-700 hover:text-slate-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Options */}
        <div className="p-4 space-y-3">
          <button
            type="button"
            onClick={() => {
              onCreateFresh();
              onClose();
            }}
            className={cn(
              "w-full flex items-start gap-3 rounded-lg border border-navy-600 p-4",
              "text-left transition-colors",
              "hover:border-cyan-accent/50 hover:bg-navy-800",
            )}
          >
            <MessageSquarePlus className="h-5 w-5 text-cyan-accent shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-200">Fresh session</p>
              <p className="text-xs text-slate-400 mt-0.5">Start a new conversation</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onCreateFork();
              onClose();
            }}
            className={cn(
              "w-full flex items-start gap-3 rounded-lg border border-navy-600 p-4",
              "text-left transition-colors",
              "hover:border-cyan-accent/50 hover:bg-navy-800",
            )}
          >
            <GitBranch className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-200">Fork from current</p>
              <p className="text-xs text-slate-400 mt-0.5">Continue from current session's context</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
