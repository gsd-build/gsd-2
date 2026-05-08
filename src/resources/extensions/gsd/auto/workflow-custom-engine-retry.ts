// Project/App: GSD-2
// File Purpose: Custom-engine verification retry adapter for auto-mode loop.

import type { AutoSession } from "./session.js";
import {
  decideCustomEngineRecovery,
  decideCustomEngineVerifyRetry,
} from "./workflow-kernel.js";

type RetrySession = Pick<AutoSession, "verificationRetryCount">;

export type CustomEngineRecoverResult = {
  outcome: "retry" | "skip" | "stop" | "pause";
  reason?: string;
};

export type CustomEngineVerifyRetryOutcome =
  | { action: "retry"; attempts: number }
  | { action: "pause"; attempts: number; turnError: string }
  | { action: "stop"; attempts: number; stopMessage: string; turnError: string };

export interface HandleCustomEngineVerifyRetryDeps {
  hydrateRetryCounts: () => Map<string, number>;
  saveRetryCounts: () => void;
  recover: (
    unitType: string,
    unitId: string,
    options: { basePath: string },
  ) => Promise<CustomEngineRecoverResult>;
  logRetry: (details: { iteration: number; unitId: string; attempts: number }) => void;
  reportRetry: (details: { unitType: string; unitId: string; attempts: number }) => void;
}

export async function handleCustomEngineVerifyRetry(input: {
  session: RetrySession;
  unitType: string;
  unitId: string;
  basePath: string;
  iteration: number;
  maxRetries: number;
  deps: HandleCustomEngineVerifyRetryDeps;
}): Promise<CustomEngineVerifyRetryOutcome> {
  const recoveryKey = `${input.unitType}/${input.unitId}`;
  const retryCounts = input.deps.hydrateRetryCounts();
  const attempts = (retryCounts.get(recoveryKey) ?? 0) + 1;
  input.session.verificationRetryCount.set(recoveryKey, attempts);
  input.deps.saveRetryCounts();
  input.deps.logRetry({
    iteration: input.iteration,
    unitId: input.unitId,
    attempts,
  });
  input.deps.reportRetry({
    unitType: input.unitType,
    unitId: input.unitId,
    attempts,
  });

  const retryDecision = decideCustomEngineVerifyRetry({
    attempts,
    maxRetries: input.maxRetries,
  });
  if (retryDecision.action === "retry") {
    return { action: "retry", attempts };
  }

  const recovery = await input.deps.recover(input.unitType, input.unitId, {
    basePath: input.basePath,
  });
  const recoveryDecision = decideCustomEngineRecovery({
    outcome: recovery.outcome,
    reason: recovery.reason,
    unitId: input.unitId,
    attempts,
  });
  if (recoveryDecision.action === "pause") {
    return {
      action: "pause",
      attempts,
      turnError: recoveryDecision.turnError,
    };
  }

  return {
    action: "stop",
    attempts,
    stopMessage: recoveryDecision.stopMessage,
    turnError: recoveryDecision.turnError,
  };
}
