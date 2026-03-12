/**
 * useActivity hook — maintains a FIFO list of recent stream activity events.
 *
 * Processes StreamEvents into ActivityItems for the ActivityView feed.
 * Maximum 100 items, oldest removed when limit exceeded.
 */
import { useState, useCallback, useRef } from "react";
import type { StreamEvent } from "../server/chat-types";

export interface ActivityItem {
  id: string;
  type: "tool_use" | "text" | "thinking" | "result";
  name?: string;
  content?: string;
  timestamp: number;
  isSubAgent: boolean;
}

const MAX_ITEMS = 100;

let activityCounter = 0;
function createActivityId(): string {
  return `act-${Date.now()}-${++activityCounter}`;
}

export function useActivity() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const lastTextIdRef = useRef<string | null>(null);

  const addEvent = useCallback((event: StreamEvent) => {
    const isSubAgent = event.parent_tool_use_id != null;

    // content_block_start with tool_use -> new tool_use item
    if (
      event.event?.type === "content_block_start" &&
      event.event.content_block?.type === "tool_use"
    ) {
      const item: ActivityItem = {
        id: createActivityId(),
        type: "tool_use",
        name: event.event.content_block.name,
        timestamp: Date.now(),
        isSubAgent,
      };
      lastTextIdRef.current = null;
      setActivities((prev) => [...prev.slice(-(MAX_ITEMS - 1)), item]);
      return;
    }

    // content_block_start with thinking -> new thinking item
    if (
      event.event?.type === "content_block_start" &&
      event.event.content_block?.type === "thinking"
    ) {
      const item: ActivityItem = {
        id: createActivityId(),
        type: "thinking",
        content: "Thinking...",
        timestamp: Date.now(),
        isSubAgent,
      };
      lastTextIdRef.current = null;
      setActivities((prev) => [...prev.slice(-(MAX_ITEMS - 1)), item]);
      return;
    }

    // content_block_delta with text_delta -> accumulate into last text item
    if (
      event.event?.type === "content_block_delta" &&
      event.event.delta?.type === "text_delta" &&
      event.event.delta.text
    ) {
      const text = event.event.delta.text;

      setActivities((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.type === "text" && last.id === lastTextIdRef.current) {
          // Accumulate into existing text item
          const updated = { ...last, content: (last.content ?? "") + text };
          return [...prev.slice(0, -1), updated];
        }
        // Create new text item
        const item: ActivityItem = {
          id: createActivityId(),
          type: "text",
          content: text,
          timestamp: Date.now(),
          isSubAgent,
        };
        lastTextIdRef.current = item.id;
        return [...prev.slice(-(MAX_ITEMS - 1)), item];
      });
      return;
    }

    // result type -> result item
    if (event.type === "result" && event.result) {
      const item: ActivityItem = {
        id: createActivityId(),
        type: "result",
        content: event.result,
        timestamp: Date.now(),
        isSubAgent,
      };
      lastTextIdRef.current = null;
      setActivities((prev) => [...prev.slice(-(MAX_ITEMS - 1)), item]);
      return;
    }
  }, []);

  const clear = useCallback(() => {
    setActivities([]);
    lastTextIdRef.current = null;
  }, []);

  return { activities, addEvent, clear };
}
