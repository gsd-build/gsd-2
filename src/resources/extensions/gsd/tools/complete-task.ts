import { VerificationEvidence } from "../db-tools";

// The following are plausible but guessed imports and types.
// The core fix is inside `handleCompleteTask`.
interface GsdTool {
  name: string;
  alias?: string;
  description: string;
  handler: (params: any) => Promise<string>;
}

const db = {
  async updateTask(taskId: string, data: any): Promise<boolean> {
    // This is a mock DB implementation.
    console.log(`Updating task ${taskId} with`, data);
    return true;
  }
};

interface CompleteTaskParams {
  taskId: string;
  summary: string;
  verificationEvidence?: VerificationEvidence[];
}

async function handleCompleteTask(params: CompleteTaskParams): Promise<string> {
  if (Array.isArray(params.verificationEvidence)) {
      params.verificationEvidence = params.verificationEvidence.map((e: any) => ({
          ...e,
          exitCode: typeof e.exitCode === "number" ? e.exitCode : (Number(e.exitCode) || 0),
          durationMs: typeof e.durationMs === "number" ? e.durationMs : (Number(e.durationMs) || 0),
      }));
  }

  const { taskId, summary, verificationEvidence } = params;
  
  const success = await db.updateTask(taskId, {
    status: 'completed',
    summary,
    verificationEvidence,
  });

  if (success) {
    return `Task ${taskId} has been successfully marked as complete.`;
  } else {
    return `Error: Failed to find or update task with ID ${taskId}.`;
  }
}

export const tool: GsdTool = {
  name: "gsd_task_complete",
  alias: "gsd_complete_task",
  description: "Marks a task as complete, providing a summary and verification evidence.",
  handler: handleCompleteTask,
};
