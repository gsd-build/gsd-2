// Project/App: GSD-2
// File Purpose: Sidecar queue scheduling and dequeue adapter for auto-mode loop.

import type { SidecarItem } from "./session.js";

export interface SidecarDequeuePayload extends Record<string, unknown> {
  kind: SidecarItem["kind"];
  unitType: string;
  unitId: string;
}

export interface DequeueSidecarItemInput {
  queue: SidecarItem[];
  executionGraphEnabled: boolean;
  scheduleQueue: (queue: SidecarItem[]) => Promise<SidecarItem[]>;
  warnSchedulingFailure: (message: string) => void;
  logDequeue: (payload: SidecarDequeuePayload) => void;
  emitDequeue: (payload: SidecarDequeuePayload) => void;
}

export async function dequeueSidecarItem(
  input: DequeueSidecarItemInput,
): Promise<SidecarItem | undefined> {
  if (input.queue.length === 0) return undefined;

  if (input.executionGraphEnabled && input.queue.length > 1) {
    try {
      const scheduledQueue = await input.scheduleQueue(input.queue);
      input.queue.splice(0, input.queue.length, ...scheduledQueue);
    } catch (err) {
      input.warnSchedulingFailure(err instanceof Error ? err.message : String(err));
    }
  }

  const sidecarItem = input.queue.shift();
  if (!sidecarItem) return undefined;

  const payload = {
    kind: sidecarItem.kind,
    unitType: sidecarItem.unitType,
    unitId: sidecarItem.unitId,
  };
  input.logDequeue(payload);
  input.emitDequeue(payload);
  return sidecarItem;
}
