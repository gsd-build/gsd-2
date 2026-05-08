// GSD-2 + src/resources/extensions/gsd/working-output-messages.ts - Formats and audits user-facing working-state messages.

export type WorkingOutputSurface =
  | "loader"
  | "dashboard"
  | "status"
  | "notification"
  | "assistant"
  | "tool";

export type WorkingHealthState =
  | "healthy"
  | "waiting"
  | "recovering"
  | "stalled"
  | "provider-error"
  | "timeout"
  | "stopped";

export interface WorkingOutputContext {
  unitType?: string;
  unitId?: string;
  health?: WorkingHealthState;
  elapsedMs?: number;
  recoveryAttempts?: number;
}

export interface WorkingOutputMessage {
  surface: WorkingOutputSurface;
  message: string;
  context?: WorkingOutputContext;
}

export interface WorkingOutputFinding {
  code:
    | "empty-message"
    | "generic-working-message"
    | "misleading-healthy-message"
    | "fake-zero-progress"
    | "missing-action";
  severity: "error" | "warning";
  detail: string;
}

const ACTION_RE = /\b(?:wait|pause|paused|retry|retrying|recover|recovering|resume|stop|stopped|run|press|type|configure|restart)\b/i;

export function formatAutoUnitWorkingMessage(unitType: string, unitId: string): string {
  switch (unitType) {
    case "research-milestone":
    case "research-slice":
      return `Researching ${unitId}: waiting for provider response`;
    case "plan-milestone":
    case "plan-slice":
      return `Planning ${unitId}: waiting for provider response`;
    case "execute-task":
      return `Executing ${unitId}: waiting for provider response`;
    case "complete-slice":
    case "complete-milestone":
      return `Completing ${unitId}: waiting for provider response`;
    default:
      return `${unitType} ${unitId}: waiting for provider response`;
  }
}

export function evaluateWorkingOutputMessage(
  item: WorkingOutputMessage,
): WorkingOutputFinding[] {
  const findings: WorkingOutputFinding[] = [];
  const message = item.message.trim();
  const health = item.context?.health;

  if (!message) {
    findings.push({
      code: "empty-message",
      severity: "error",
      detail: `${item.surface} message is empty`,
    });
    return findings;
  }

  if (/^Working(?:\.\.\.)?(?:\s|\(|$)/i.test(message)) {
    findings.push({
      code: "generic-working-message",
      severity: "warning",
      detail: `${item.surface} message should say what work is running`,
    });
  }

  if (/Progressing well/i.test(message) && health && health !== "healthy") {
    findings.push({
      code: "misleading-healthy-message",
      severity: "error",
      detail: `${item.surface} says progress is healthy while runtime health is ${health}`,
    });
  }

  if (/\b0\s*\/\s*0\s+slices\b/i.test(message)) {
    findings.push({
      code: "fake-zero-progress",
      severity: "warning",
      detail: `${item.surface} should hide roadmap progress before roadmap slices exist`,
    });
  }

  if ((health === "stalled" || health === "provider-error" || health === "timeout") && !ACTION_RE.test(message)) {
    findings.push({
      code: "missing-action",
      severity: "warning",
      detail: `${item.surface} should give the user a next action for ${health}`,
    });
  }

  return findings;
}

export function evaluateWorkingOutputMessages(
  items: WorkingOutputMessage[],
): WorkingOutputFinding[] {
  return items.flatMap(evaluateWorkingOutputMessage);
}
