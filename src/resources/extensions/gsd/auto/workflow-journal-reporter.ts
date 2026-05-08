// Project/App: GSD-2
// File Purpose: Thin adapter for auto-mode workflow journal event emission.

import type { JournalEntry, JournalEventType } from "../journal.js";

export interface WorkflowJournalReporterInput {
  emitJournalEvent: (entry: JournalEntry) => void;
  flowId: string;
  nextSeq: () => number;
  now?: () => string;
}

export interface WorkflowJournalReporter {
  emit(eventType: JournalEventType, data?: Record<string, unknown>): void;
}

export function createWorkflowJournalReporter(
  input: WorkflowJournalReporterInput,
): WorkflowJournalReporter {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    emit(eventType: JournalEventType, data?: Record<string, unknown>): void {
      input.emitJournalEvent({
        ts: now(),
        flowId: input.flowId,
        seq: input.nextSeq(),
        eventType,
        data,
      });
    },
  };
}
