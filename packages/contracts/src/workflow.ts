// Project/App: GSD-2
// File Purpose: Canonical workflow MCP tool metadata shared across package boundaries.

export type WorkflowToolWritePolicy = "read" | "write";

export interface WorkflowToolContractMetadata {
	canonicalName: string;
	aliases: readonly string[];
	schemaId: string;
	executorId: string;
	writePolicy: WorkflowToolWritePolicy;
	auditEvent: string;
}

export const WORKFLOW_TOOL_CONTRACTS = [
	{
		canonicalName: "gsd_decision_save",
		aliases: ["gsd_save_decision"],
		schemaId: "workflow.decision.save",
		executorId: "executeDecisionSave",
		writePolicy: "write",
		auditEvent: "workflow.decision.save",
	},
	{
		canonicalName: "gsd_requirement_update",
		aliases: ["gsd_update_requirement"],
		schemaId: "workflow.requirement.update",
		executorId: "executeRequirementUpdate",
		writePolicy: "write",
		auditEvent: "workflow.requirement.update",
	},
	{
		canonicalName: "gsd_requirement_save",
		aliases: ["gsd_save_requirement"],
		schemaId: "workflow.requirement.save",
		executorId: "executeRequirementSave",
		writePolicy: "write",
		auditEvent: "workflow.requirement.save",
	},
	{
		canonicalName: "gsd_milestone_generate_id",
		aliases: ["gsd_generate_milestone_id"],
		schemaId: "workflow.milestone.generate_id",
		executorId: "executeMilestoneGenerateId",
		writePolicy: "read",
		auditEvent: "workflow.milestone.generate_id",
	},
	{
		canonicalName: "gsd_plan_milestone",
		aliases: [],
		schemaId: "workflow.milestone.plan",
		executorId: "executePlanMilestone",
		writePolicy: "write",
		auditEvent: "workflow.milestone.plan",
	},
	{
		canonicalName: "gsd_plan_slice",
		aliases: [],
		schemaId: "workflow.slice.plan",
		executorId: "executePlanSlice",
		writePolicy: "write",
		auditEvent: "workflow.slice.plan",
	},
	{
		canonicalName: "gsd_plan_task",
		aliases: ["gsd_task_plan"],
		schemaId: "workflow.task.plan",
		executorId: "executePlanTask",
		writePolicy: "write",
		auditEvent: "workflow.task.plan",
	},
	{
		canonicalName: "gsd_replan_slice",
		aliases: ["gsd_slice_replan"],
		schemaId: "workflow.slice.replan",
		executorId: "executeReplanSlice",
		writePolicy: "write",
		auditEvent: "workflow.slice.replan",
	},
	{
		canonicalName: "gsd_slice_complete",
		aliases: ["gsd_complete_slice"],
		schemaId: "workflow.slice.complete",
		executorId: "executeSliceComplete",
		writePolicy: "write",
		auditEvent: "workflow.slice.complete",
	},
	{
		canonicalName: "gsd_skip_slice",
		aliases: [],
		schemaId: "workflow.slice.skip",
		executorId: "executeSkipSlice",
		writePolicy: "write",
		auditEvent: "workflow.slice.skip",
	},
	{
		canonicalName: "gsd_complete_milestone",
		aliases: ["gsd_milestone_complete"],
		schemaId: "workflow.milestone.complete",
		executorId: "executeCompleteMilestone",
		writePolicy: "write",
		auditEvent: "workflow.milestone.complete",
	},
	{
		canonicalName: "gsd_validate_milestone",
		aliases: ["gsd_milestone_validate"],
		schemaId: "workflow.milestone.validate",
		executorId: "executeValidateMilestone",
		writePolicy: "write",
		auditEvent: "workflow.milestone.validate",
	},
	{
		canonicalName: "gsd_reassess_roadmap",
		aliases: ["gsd_roadmap_reassess"],
		schemaId: "workflow.roadmap.reassess",
		executorId: "executeReassessRoadmap",
		writePolicy: "write",
		auditEvent: "workflow.roadmap.reassess",
	},
	{
		canonicalName: "gsd_save_gate_result",
		aliases: [],
		schemaId: "workflow.gate.save_result",
		executorId: "executeSaveGateResult",
		writePolicy: "write",
		auditEvent: "workflow.gate.save_result",
	},
	{
		canonicalName: "gsd_summary_save",
		aliases: [],
		schemaId: "workflow.summary.save",
		executorId: "executeSummarySave",
		writePolicy: "write",
		auditEvent: "workflow.summary.save",
	},
	{
		canonicalName: "gsd_task_complete",
		aliases: ["gsd_complete_task"],
		schemaId: "workflow.task.complete",
		executorId: "executeTaskComplete",
		writePolicy: "write",
		auditEvent: "workflow.task.complete",
	},
	{
		canonicalName: "gsd_milestone_status",
		aliases: [],
		schemaId: "workflow.milestone.status",
		executorId: "executeMilestoneStatus",
		writePolicy: "read",
		auditEvent: "workflow.milestone.status",
	},
	{
		canonicalName: "gsd_journal_query",
		aliases: [],
		schemaId: "workflow.journal.query",
		executorId: "executeJournalQuery",
		writePolicy: "read",
		auditEvent: "workflow.journal.query",
	},
	{
		canonicalName: "gsd_exec",
		aliases: [],
		schemaId: "workflow.exec.run",
		executorId: "executeGsdExec",
		writePolicy: "write",
		auditEvent: "workflow.exec.run",
	},
	{
		canonicalName: "gsd_exec_search",
		aliases: [],
		schemaId: "workflow.exec.search",
		executorId: "executeGsdExecSearch",
		writePolicy: "read",
		auditEvent: "workflow.exec.search",
	},
	{
		canonicalName: "gsd_resume",
		aliases: [],
		schemaId: "workflow.resume",
		executorId: "executeGsdResume",
		writePolicy: "read",
		auditEvent: "workflow.resume",
	},
	{
		canonicalName: "gsd_capture_thought",
		aliases: [],
		schemaId: "workflow.memory.capture_thought",
		executorId: "executeCaptureThought",
		writePolicy: "write",
		auditEvent: "workflow.memory.capture_thought",
	},
	{
		canonicalName: "gsd_memory_query",
		aliases: [],
		schemaId: "workflow.memory.query",
		executorId: "executeMemoryQuery",
		writePolicy: "read",
		auditEvent: "workflow.memory.query",
	},
	{
		canonicalName: "gsd_memory_graph",
		aliases: [],
		schemaId: "workflow.memory.graph",
		executorId: "executeMemoryGraph",
		writePolicy: "read",
		auditEvent: "workflow.memory.graph",
	},
] as const satisfies readonly WorkflowToolContractMetadata[];

export const WORKFLOW_TOOL_NAMES = WORKFLOW_TOOL_CONTRACTS.flatMap((tool) => [
	tool.canonicalName,
	...tool.aliases,
]) as readonly string[];
