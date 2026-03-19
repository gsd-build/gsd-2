/**
 * ExecutionPanel — live streaming execution tracker for the chat view.
 *
 * Replaces the legacy TaskExecuting panel (which required .planning schema).
 * Derives its state directly from streaming ChatMessage content — no file I/O needed.
 *
 * Displayed when isProcessing=true AND at least one tool call has been detected.
 */
import type { ChatMessage } from "@/server/chat-types";

export interface ExecutionState {
  isExecuting: boolean;
  phase: string | null;
  currentTool: string | null;
  currentCommand: string | null;
  toolCallCount: number;
}

/**
 * Pure function — derives execution state from the current message stream.
 * No hooks, so it can be called inside ChatView (hook-free component).
 */
export function deriveExecutionState(
  messages: ChatMessage[],
  isProcessing: boolean,
): ExecutionState {
  if (!isProcessing) {
    return { isExecuting: false, phase: null, currentTool: null, currentCommand: null, toolCallCount: 0 };
  }

  // Latest phase transition label
  let phase: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "phase_transition") {
      phase = messages[i].phaseTransition?.phase ?? messages[i].content ?? null;
      break;
    }
  }

  // Parse the last streaming assistant message for tool info.
  // Tool events arrive as text deltas in the format:
  //   "\n[toolName]\n$ command\noutput...\n"
  let currentTool: string | null = null;
  let currentCommand: string | null = null;

  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === "assistant") {
    const text = lastMsg.content;
    // Find all [toolname] occurrences (preceded by \n from the adapter header)
    const toolMatches = [...text.matchAll(/\n\[([^\]\n]+)\]/g)];
    if (toolMatches.length > 0) {
      const last = toolMatches[toolMatches.length - 1];
      currentTool = last[1];
      // Look for a bash $ command on the line immediately after [toolName]\n
      const afterHeader = text.slice(last.index! + last[0].length);
      const cmdMatch = afterHeader.match(/^\n\$ (.+)/);
      if (cmdMatch) currentCommand = cmdMatch[1];
    }
  }

  // Count distinct tool invocations across all messages for the current run
  let toolCallCount = 0;
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const hits = msg.content.match(/\n\[[^\]\n]+\]/g);
    if (hits) toolCallCount += hits.length;
  }

  return {
    isExecuting: toolCallCount > 0 || currentTool !== null,
    phase,
    currentTool,
    currentCommand,
    toolCallCount,
  };
}

interface ExecutionPanelProps {
  phase: string | null;
  currentTool: string | null;
  currentCommand: string | null;
  toolCallCount: number;
  onInterrupt?: () => void;
}

/**
 * Compact execution status bar shown above the chat messages while GSD is running tools.
 */
export function ExecutionPanel({ phase, currentTool, currentCommand, toolCallCount, onInterrupt }: ExecutionPanelProps) {
  return (
    <div
      className="flex items-center gap-2 border-b border-navy-600 bg-navy-900/70 px-3 py-1.5 font-mono text-xs"
      data-testid="execution-panel"
    >
      {/* Live pulse indicator */}
      <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning animate-pulse" />

      {/* Phase label */}
      {phase && (
        <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">
          {phase}
        </span>
      )}
      {phase && (currentTool || currentCommand) && (
        <span className="text-slate-600">·</span>
      )}

      {/* Current tool */}
      {currentTool && (
        <span style={{ color: "#5BC8F0" }}>[{currentTool}]</span>
      )}

      {/* Current command — truncated */}
      {currentCommand && (
        <span className="truncate text-slate-400 max-w-xs">$ {currentCommand}</span>
      )}

      {/* Tool call counter */}
      {toolCallCount > 0 && (
        <span className="ml-auto shrink-0 text-slate-600">{toolCallCount} call{toolCallCount !== 1 ? "s" : ""}</span>
      )}

      {/* Stop button */}
      {onInterrupt && (
        <button
          type="button"
          onClick={onInterrupt}
          title="Stop GSD (ESC)"
          className="ml-2 shrink-0 rounded px-2 py-0.5 text-xs font-mono text-slate-400 border border-slate-700 hover:text-red-400 hover:border-red-400/50 transition-colors"
        >
          ■ Stop
        </button>
      )}
    </div>
  );
}
