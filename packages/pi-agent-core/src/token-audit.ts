// Project/App: GSD-2
// File Purpose: Provider-boundary token payload audit helpers.

import type { Context, ImageContent, Message, TextContent, Tool } from "@gsd/pi-ai";
import type { AgentMessage } from "./types.js";

const CHARS_PER_TOKEN = 4;
const LARGEST_MESSAGE_LIMIT = 5;
const LARGEST_TOOL_LIMIT = 10;
const LARGEST_CUSTOM_MESSAGE_LIMIT = 5;

export interface TokenAuditMessageSummary {
	index: number;
	role: string;
	type: string;
	chars: number;
}

export interface TokenAuditToolSummary {
	name: string;
	chars: number;
}

export interface TokenAuditCustomMessageSummary {
	index: number;
	role: string;
	customType?: string;
	chars: number;
}

export interface TokenAuditSummary {
	systemChars: number;
	toolSchemaChars: number;
	messageCharsByRole: Record<string, number>;
	toolResultChars: number;
	customMessageChars: number;
	imageCount: number;
	estimatedInputTokens: number;
	messageCount: number;
	toolCount: number;
	largestMessages: TokenAuditMessageSummary[];
	largestTools: TokenAuditToolSummary[];
	largestCustomMessages: TokenAuditCustomMessageSummary[];
}

export interface ProviderPayloadAuditSummary {
	payloadChars: number;
	messageCharsByRole: Record<string, number>;
	toolSchemaChars: number;
	imageCount: number;
	messageCount: number;
	toolCount: number;
	largestMessages: TokenAuditMessageSummary[];
	largestTools: TokenAuditToolSummary[];
}

export function buildTokenAuditSummary(context: Context, sourceMessages: AgentMessage[]): TokenAuditSummary {
	const systemChars = context.systemPrompt?.length ?? 0;
	const toolSummaries = summarizeTools(context.tools ?? []);
	const toolSchemaChars = toolSummaries.reduce((sum, tool) => sum + tool.chars, 0);
	const messageSummaries = context.messages.map((message, index) => summarizeMessage(message, index));
	const messageCharsByRole: Record<string, number> = {};
	let toolResultChars = 0;
	let imageCount = 0;

	for (const summary of messageSummaries) {
		messageCharsByRole[summary.role] = (messageCharsByRole[summary.role] ?? 0) + summary.chars;
	}

	for (const message of context.messages) {
		imageCount += countImagesInMessage(message);
		if (message.role === "toolResult") {
			toolResultChars += countContentChars(message.content);
		}
	}

	const customMessageSummaries = summarizeCustomMessages(sourceMessages);
	const customMessageChars = customMessageSummaries.reduce((sum, message) => sum + message.chars, 0);

	const totalChars =
		systemChars +
		toolSchemaChars +
		messageSummaries.reduce((sum, message) => sum + message.chars, 0);

	return {
		systemChars,
		toolSchemaChars,
		messageCharsByRole,
		toolResultChars,
		customMessageChars,
		imageCount,
		estimatedInputTokens: Math.ceil(totalChars / CHARS_PER_TOKEN),
		messageCount: context.messages.length,
		toolCount: context.tools?.length ?? 0,
		largestMessages: [...messageSummaries].sort((a, b) => b.chars - a.chars).slice(0, LARGEST_MESSAGE_LIMIT),
		largestTools: [...toolSummaries].sort((a, b) => b.chars - a.chars).slice(0, LARGEST_TOOL_LIMIT),
		largestCustomMessages: [...customMessageSummaries]
			.sort((a, b) => b.chars - a.chars)
			.slice(0, LARGEST_CUSTOM_MESSAGE_LIMIT),
	};
}

export function maybeLogTokenAudit(context: Context, sourceMessages: AgentMessage[]): void {
	if (process.env.PI_TOKEN_AUDIT !== "1") return;
	const summary = buildTokenAuditSummary(context, sourceMessages);
	process.stderr.write(`${JSON.stringify({ type: "token_audit", summary })}\n`);
}

export function buildProviderPayloadAuditSummary(payload: unknown): ProviderPayloadAuditSummary {
	const record = asRecord(payload);
	const messages = extractProviderMessages(record);
	const tools = extractProviderTools(record);
	const messageSummaries = messages.map((message, index) => summarizeProviderMessage(message, index));
	const toolSummaries = tools.map((tool) => summarizeProviderTool(tool));
	const messageCharsByRole: Record<string, number> = {};
	let imageCount = 0;

	for (const summary of messageSummaries) {
		messageCharsByRole[summary.role] = (messageCharsByRole[summary.role] ?? 0) + summary.chars;
	}
	for (const message of messages) {
		imageCount += countImagesInValue(message);
	}

	return {
		payloadChars: safeJsonLength(payload),
		messageCharsByRole,
		toolSchemaChars: toolSummaries.reduce((sum, tool) => sum + tool.chars, 0),
		imageCount,
		messageCount: messages.length,
		toolCount: tools.length,
		largestMessages: [...messageSummaries].sort((a, b) => b.chars - a.chars).slice(0, LARGEST_MESSAGE_LIMIT),
		largestTools: [...toolSummaries].sort((a, b) => b.chars - a.chars).slice(0, LARGEST_TOOL_LIMIT),
	};
}

export function maybeLogProviderPayloadAudit(payload: unknown, phase: string): void {
	if (process.env.PI_TOKEN_AUDIT !== "1") return;
	const summary = buildProviderPayloadAuditSummary(payload);
	process.stderr.write(`${JSON.stringify({ type: "token_audit_provider_payload", phase, summary })}\n`);
}

function summarizeMessage(message: Message, index: number): TokenAuditMessageSummary {
	return {
		index,
		role: message.role,
		type: messageType(message),
		chars: safeJsonLength(message),
	};
}

function messageType(message: Message): string {
	if (message.role === "assistant") {
		const types = new Set(message.content.map((content) => content.type));
		return types.size > 0 ? Array.from(types).join("+") : "assistant";
	}
	if (message.role === "toolResult") return message.toolName || "toolResult";
	if (typeof message.content === "string") return "text";
	const types = new Set(message.content.map((content) => content.type));
	return types.size > 0 ? Array.from(types).join("+") : "user";
}

function summarizeTools(tools: Tool[]): TokenAuditToolSummary[] {
	return tools.map((tool) => ({
		name: tool.name,
		chars: safeJsonLength(tool),
	}));
}

function summarizeCustomMessages(messages: AgentMessage[]): TokenAuditCustomMessageSummary[] {
	return messages.flatMap((message, index) => {
		if (!isCustomOrInjectedMessage(message)) return [];
		const customType = (message as { customType?: unknown }).customType;
		return [{
			index,
			role: String((message as { role?: unknown }).role ?? "unknown"),
			customType: typeof customType === "string" ? customType : undefined,
			chars: safeJsonLength(message),
		}];
	});
}

function summarizeProviderMessage(message: unknown, index: number): TokenAuditMessageSummary {
	const record = asRecord(message);
	const role = typeof record?.role === "string" ? record.role : "unknown";
	const type = typeof record?.type === "string" ? record.type : role;
	return { index, role, type, chars: safeJsonLength(message) };
}

function summarizeProviderTool(tool: unknown): TokenAuditToolSummary {
	const record = asRecord(tool);
	const name =
		typeof record?.name === "string"
			? record.name
			: typeof asRecord(record?.function)?.name === "string"
				? String(asRecord(record?.function)?.name)
				: typeof asRecord(record?.toolSpec)?.name === "string"
					? String(asRecord(record?.toolSpec)?.name)
					: "unknown";
	return { name, chars: safeJsonLength(tool) };
}

function extractProviderMessages(record: Record<string, unknown> | null): unknown[] {
	const candidates = [
		getArrayField(record, "messages"),
		getArrayField(record, "input"),
		getArrayField(record, "contents"),
	].filter((value): value is unknown[] => value !== null);
	if (candidates.length > 0) return candidates[0];
	const input = record?.input;
	return typeof input === "string" ? [{ role: "input", content: input }] : [];
}

function extractProviderTools(record: Record<string, unknown> | null): unknown[] {
	const direct = getArrayField(record, "tools")
		?? getNestedArrayField(record, ["config", "tools"])
		?? getNestedArrayField(record, ["toolConfig", "tools"])
		?? getNestedArrayField(record, ["tool_config", "tools"])
		?? [];
	return direct.flatMap(expandProviderToolEntry);
}

function expandProviderToolEntry(tool: unknown): unknown[] {
	const record = asRecord(tool);
	const functionDeclarations =
		getArrayField(record, "functionDeclarations")
		?? getArrayField(record, "function_declarations");
	if (functionDeclarations) return functionDeclarations;
	return [tool];
}

function countImagesInMessage(message: Message): number {
	if (!("content" in message) || !Array.isArray(message.content)) return 0;
	return message.content.filter((content): content is ImageContent => content.type === "image").length;
}

function countImagesInValue(value: unknown): number {
	if (!value || typeof value !== "object") return 0;
	if (Array.isArray(value)) {
		return value.reduce((sum, item) => sum + countImagesInValue(item), 0);
	}
	const record = value as Record<string, unknown>;
	let count = record.type === "image" || record.type === "input_image" ? 1 : 0;
	for (const nested of Object.values(record)) {
		count += countImagesInValue(nested);
	}
	return count;
}

function countContentChars(content: string | (TextContent | ImageContent)[]): number {
	if (typeof content === "string") return content.length;
	return content.reduce((sum, block) => {
		if (block.type === "text") return sum + block.text.length;
		if (block.type === "image") return sum + block.data.length;
		return sum;
	}, 0);
}

function isCustomOrInjectedMessage(message: AgentMessage): boolean {
	const role = (message as { role?: unknown }).role;
	return role === "custom" || role === "bashExecution" || role === "branchSummary" || role === "compactionSummary";
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getArrayField(record: Record<string, unknown> | null, key: string): unknown[] | null {
	const value = record?.[key];
	return Array.isArray(value) ? value : null;
}

function getNestedArrayField(record: Record<string, unknown> | null, path: string[]): unknown[] | null {
	let current: unknown = record;
	for (const key of path) {
		current = asRecord(current)?.[key];
	}
	return Array.isArray(current) ? current : null;
}

function safeJsonLength(value: unknown): number {
	try {
		return JSON.stringify(value)?.length ?? 0;
	} catch {
		return 0;
	}
}
