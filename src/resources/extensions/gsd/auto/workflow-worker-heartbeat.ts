// Project/App: GSD-2
// File Purpose: Best-effort worker heartbeat adapter for auto-mode loop.

export interface WorkerHeartbeatSession {
  workerId?: string | null;
  currentMilestoneId?: string | null;
  milestoneLeaseToken?: number | null;
}

export interface MaintainWorkerHeartbeatDeps {
  heartbeatAutoWorker: (workerId: string) => void;
  refreshMilestoneLease: (
    workerId: string,
    milestoneId: string,
    fencingToken: number,
  ) => boolean;
  logHeartbeatFailure: (err: unknown) => void;
}

export function maintainWorkerHeartbeat(
  session: WorkerHeartbeatSession,
  deps: MaintainWorkerHeartbeatDeps,
): void {
  if (!session.workerId) return;

  try {
    deps.heartbeatAutoWorker(session.workerId);
    if (session.currentMilestoneId && session.milestoneLeaseToken) {
      deps.refreshMilestoneLease(
        session.workerId,
        session.currentMilestoneId,
        session.milestoneLeaseToken,
      );
    }
  } catch (err) {
    deps.logHeartbeatFailure(err);
  }
}
