/**
 * PermissionModal — blocking overlay for Claude Code permission prompts.
 *
 * Renders when a permission_prompt event is received (skip-permissions disabled).
 * Provides Approve, Always Allow, and Deny actions that send permission_response
 * back over WebSocket.
 */
import type { PermissionPromptEvent } from "@/server/chat-types";

interface PermissionModalProps {
  prompt: PermissionPromptEvent | null;
  onRespond: (action: "approve" | "always_allow" | "deny") => void;
}

export function PermissionModal({ prompt, onRespond }: PermissionModalProps) {
  if (!prompt) return null;

  const truncatedInput =
    prompt.toolInput.length > 200
      ? prompt.toolInput.slice(0, 200) + "..."
      : prompt.toolInput;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-navy-900 border border-navy-600 rounded-lg p-6 max-w-lg w-full mx-4 space-y-4">
        <h2 className="font-display text-lg text-slate-200">
          Permission Required
        </h2>

        <div className="space-y-2">
          <p className="text-sm text-slate-400">
            Tool:{" "}
            <span className="font-mono text-cyan-accent">
              {prompt.toolName}
            </span>
          </p>
          <pre className="font-mono text-xs text-slate-300 bg-navy-800 p-2 rounded overflow-x-auto whitespace-pre-wrap">
            {truncatedInput}
          </pre>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onRespond("approve")}
            className="px-4 py-2 rounded text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => onRespond("always_allow")}
            className="px-4 py-2 rounded text-sm font-medium bg-cyan-accent/20 hover:bg-cyan-accent/30 text-cyan-accent transition-colors"
          >
            Always Allow
          </button>
          <button
            onClick={() => onRespond("deny")}
            className="px-4 py-2 rounded text-sm font-medium bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
