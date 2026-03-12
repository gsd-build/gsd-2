/**
 * React hook that manages PlanningState from WebSocket updates.
 *
 * Uses useReconnectingWebSocket for transport and provides typed
 * PlanningState to React components with automatic reconnection.
 */
import { useState, useRef, useCallback } from "react";
import type { PlanningState, StateDiff } from "../server/types";
import {
  useReconnectingWebSocket,
  shouldProcessMessage,
  applyStateUpdate,
  type ConnectionStatus,
} from "./useReconnectingWebSocket";

export interface UsePlanningStateResult {
  state: PlanningState | null;
  status: ConnectionStatus;
}

const DEFAULT_WS_URL = "ws://localhost:4001";

/**
 * Hook that connects to the planning state WebSocket server and provides
 * live PlanningState to React components.
 *
 * - Filters stale messages by sequence number
 * - Handles "full" (replace) and "diff" (merge) message types
 * - Auto-reconnects with exponential backoff via useReconnectingWebSocket
 */
export function usePlanningState(
  wsUrl: string = DEFAULT_WS_URL
): UsePlanningStateResult {
  const [state, setState] = useState<PlanningState | null>(null);
  const lastProcessedSequence = useRef(0);

  const handleMessage = useCallback((data: unknown) => {
    const raw = data as Record<string, unknown>;

    // WS sends "state" field, but StateDiff expects "changes" — normalize
    const msg: StateDiff = {
      type: (raw.type as "full" | "diff") ?? "full",
      changes: (raw.changes ?? raw.state ?? {}) as Partial<PlanningState>,
      sequence: (raw.sequence as number) ?? 0,
      timestamp: (raw.timestamp as number) ?? Date.now(),
    };

    // Reject stale messages
    if (!shouldProcessMessage(msg.sequence, lastProcessedSequence.current)) {
      return;
    }

    // Apply update and track sequence
    setState((prev) => {
      const next = applyStateUpdate(prev, msg);
      if (next !== null) {
        lastProcessedSequence.current = msg.sequence;
      }
      return next;
    });
  }, []);

  const { status } = useReconnectingWebSocket(wsUrl, {
    onMessage: handleMessage,
  });

  return { state, status };
}
