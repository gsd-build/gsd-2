/**
 * SessionCloseModal — Merge/Keep/Delete worktree choice on session close.
 *
 * Only shown when closing a session that has an associated git worktree.
 * Non-worktree sessions close immediately without this modal.
 */
import { X, GitMerge, FolderArchive, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionCloseModalProps {
  isOpen: boolean;
  sessionName: string;
  onClose: () => void;
  onMerge: () => void;
  onKeep: () => void;
  onDelete: () => void;
}

export function SessionCloseModal({
  isOpen,
  sessionName,
  onClose,
  onMerge,
  onKeep,
  onDelete,
}: SessionCloseModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[420px] rounded-lg border border-navy-600 bg-navy-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-navy-600 px-4 py-3">
          <h2 className="flex-1 font-display text-sm font-bold uppercase tracking-wider text-slate-300">
            Close "{sessionName}"
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-navy-700 hover:text-slate-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="px-4 pt-3 text-xs text-slate-400">
          This session has a git worktree. Choose how to handle it:
        </p>

        {/* Options */}
        <div className="p-4 space-y-3">
          <button
            type="button"
            onClick={() => {
              onMerge();
              onClose();
            }}
            className={cn(
              "w-full flex items-start gap-3 rounded-lg border border-navy-600 p-4",
              "text-left transition-colors",
              "hover:border-green-500/50 hover:bg-navy-800",
            )}
          >
            <GitMerge className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-200">Merge changes to main</p>
              <p className="text-xs text-slate-400 mt-0.5">Merge the worktree branch back and clean up</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onKeep();
              onClose();
            }}
            className={cn(
              "w-full flex items-start gap-3 rounded-lg border border-navy-600 p-4",
              "text-left transition-colors",
              "hover:border-amber-500/50 hover:bg-navy-800",
            )}
          >
            <FolderArchive className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-200">Keep worktree for later</p>
              <p className="text-xs text-slate-400 mt-0.5">Close the session but preserve the worktree and branch</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className={cn(
              "w-full flex items-start gap-3 rounded-lg border border-navy-600 p-4",
              "text-left transition-colors",
              "hover:border-red-500/50 hover:bg-navy-800",
            )}
          >
            <Trash2 className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-200">Delete worktree and branch</p>
              <p className="text-xs text-slate-400 mt-0.5">Discard all changes and remove the worktree</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
