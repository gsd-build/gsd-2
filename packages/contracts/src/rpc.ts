// Project/App: GSD-2
// File Purpose: Canonical RPC protocol contracts shared across runtime, SDK, MCP, and app surfaces.

export const RPC_CONTRACT_VERSION = 1 as const;

export const RPC_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export const RPC_COMMAND_TYPES = [
	"prompt",
	"steer",
	"follow_up",
	"abort",
	"new_session",
	"get_state",
	"set_model",
	"cycle_model",
	"get_available_models",
	"set_thinking_level",
	"cycle_thinking_level",
	"set_steering_mode",
	"set_follow_up_mode",
	"compact",
	"set_auto_compaction",
	"set_auto_retry",
	"abort_retry",
	"bash",
	"abort_bash",
	"get_session_stats",
	"export_html",
	"switch_session",
	"fork",
	"get_fork_messages",
	"get_last_assistant_text",
	"set_session_name",
	"get_messages",
	"get_commands",
	"terminal_input",
	"terminal_resize",
	"terminal_redraw",
	"init",
	"shutdown",
	"subscribe",
] as const;

export const RPC_V2_EVENT_TYPES = ["execution_complete", "cost_update"] as const;

export const RPC_EXTENSION_UI_METHODS = [
	"select",
	"confirm",
	"input",
	"editor",
	"notify",
	"setStatus",
	"setWidget",
	"setTitle",
	"set_editor_text",
] as const;

export type ThinkingLevel = (typeof RPC_THINKING_LEVELS)[number];

export interface ImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

export interface ModelInfo {
	provider: string;
	id: string;
	contextWindow?: number;
	reasoning?: boolean;
}

export interface SessionStats {
	sessionFile: string | undefined;
	sessionId: string;
	userMessages: number;
	assistantMessages: number;
	toolCalls: number;
	toolResults: number;
	totalMessages: number;
	tokens: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
	cost: number;
}

export interface BashResult {
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
}

export interface CompactionResult<T = unknown> {
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
	details?: T;
}

export type RpcProtocolVersion = 1 | 2;

export type RpcCommand =
	| { id?: string; type: "prompt"; message: string; images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }
	| { id?: string; type: "steer"; message: string; images?: ImageContent[] }
	| { id?: string; type: "follow_up"; message: string; images?: ImageContent[] }
	| { id?: string; type: "abort" }
	| { id?: string; type: "new_session"; parentSession?: string }
	| { id?: string; type: "get_state" }
	| { id?: string; type: "set_model"; provider: string; modelId: string }
	| { id?: string; type: "cycle_model" }
	| { id?: string; type: "get_available_models" }
	| { id?: string; type: "set_thinking_level"; level: ThinkingLevel }
	| { id?: string; type: "cycle_thinking_level" }
	| { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
	| { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }
	| { id?: string; type: "compact"; customInstructions?: string }
	| { id?: string; type: "set_auto_compaction"; enabled: boolean }
	| { id?: string; type: "set_auto_retry"; enabled: boolean }
	| { id?: string; type: "abort_retry" }
	| { id?: string; type: "bash"; command: string }
	| { id?: string; type: "abort_bash" }
	| { id?: string; type: "get_session_stats" }
	| { id?: string; type: "export_html"; outputPath?: string }
	| { id?: string; type: "switch_session"; sessionPath: string }
	| { id?: string; type: "fork"; entryId: string }
	| { id?: string; type: "get_fork_messages" }
	| { id?: string; type: "get_last_assistant_text" }
	| { id?: string; type: "set_session_name"; name: string }
	| { id?: string; type: "get_messages" }
	| { id?: string; type: "get_commands" }
	| { id?: string; type: "terminal_input"; data: string }
	| { id?: string; type: "terminal_resize"; cols: number; rows: number }
	| { id?: string; type: "terminal_redraw" }
	| { id?: string; type: "init"; protocolVersion: 2; clientId?: string }
	| { id?: string; type: "shutdown"; graceful?: boolean }
	| { id?: string; type: "subscribe"; events: string[] };

export interface RpcSlashCommand {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
	location?: "user" | "project" | "path";
	path?: string;
}

export interface RpcSessionState {
	model?: ModelInfo;
	thinkingLevel: ThinkingLevel;
	isStreaming: boolean;
	isCompacting: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	sessionFile?: string;
	sessionId: string;
	sessionName?: string;
	autoCompactionEnabled: boolean;
	autoRetryEnabled: boolean;
	retryInProgress: boolean;
	retryAttempt: number;
	messageCount: number;
	pendingMessageCount: number;
	extensionsReady: boolean;
}

export type RpcResponse =
	| { id?: string; type: "response"; command: "prompt"; success: true; runId?: string }
	| { id?: string; type: "response"; command: "steer"; success: true; runId?: string }
	| { id?: string; type: "response"; command: "follow_up"; success: true; runId?: string }
	| { id?: string; type: "response"; command: "abort"; success: true }
	| { id?: string; type: "response"; command: "new_session"; success: true; data: { cancelled: boolean } }
	| { id?: string; type: "response"; command: "get_state"; success: true; data: RpcSessionState }
	| { id?: string; type: "response"; command: "set_model"; success: true; data: ModelInfo }
	| {
			id?: string;
			type: "response";
			command: "cycle_model";
			success: true;
			data: { model: ModelInfo; thinkingLevel: ThinkingLevel; isScoped: boolean } | null;
	  }
	| { id?: string; type: "response"; command: "get_available_models"; success: true; data: { models: ModelInfo[] } }
	| { id?: string; type: "response"; command: "set_thinking_level"; success: true }
	| { id?: string; type: "response"; command: "cycle_thinking_level"; success: true; data: { level: ThinkingLevel } | null }
	| { id?: string; type: "response"; command: "set_steering_mode"; success: true }
	| { id?: string; type: "response"; command: "set_follow_up_mode"; success: true }
	| { id?: string; type: "response"; command: "compact"; success: true; data: CompactionResult }
	| { id?: string; type: "response"; command: "set_auto_compaction"; success: true }
	| { id?: string; type: "response"; command: "set_auto_retry"; success: true }
	| { id?: string; type: "response"; command: "abort_retry"; success: true }
	| { id?: string; type: "response"; command: "bash"; success: true; data: BashResult }
	| { id?: string; type: "response"; command: "abort_bash"; success: true }
	| { id?: string; type: "response"; command: "get_session_stats"; success: true; data: SessionStats }
	| { id?: string; type: "response"; command: "export_html"; success: true; data: { path: string } }
	| { id?: string; type: "response"; command: "switch_session"; success: true; data: { cancelled: boolean } }
	| { id?: string; type: "response"; command: "fork"; success: true; data: { text: string; cancelled: boolean } }
	| { id?: string; type: "response"; command: "get_fork_messages"; success: true; data: { messages: Array<{ entryId: string; text: string }> } }
	| { id?: string; type: "response"; command: "get_last_assistant_text"; success: true; data: { text: string | null } }
	| { id?: string; type: "response"; command: "set_session_name"; success: true }
	| { id?: string; type: "response"; command: "get_messages"; success: true; data: { messages: unknown[] } }
	| { id?: string; type: "response"; command: "get_commands"; success: true; data: { commands: RpcSlashCommand[] } }
	| { id?: string; type: "response"; command: "terminal_input"; success: true }
	| { id?: string; type: "response"; command: "terminal_resize"; success: true }
	| { id?: string; type: "response"; command: "terminal_redraw"; success: true }
	| { id?: string; type: "response"; command: "init"; success: true; data: RpcInitResult }
	| { id?: string; type: "response"; command: "shutdown"; success: true }
	| { id?: string; type: "response"; command: "subscribe"; success: true }
	| { id?: string; type: "response"; command: string; success: false; error: string };

export interface RpcInitResult {
	protocolVersion: 2;
	sessionId: string;
	capabilities: {
		events: string[];
		commands: string[];
	};
}

export interface RpcExecutionCompleteEvent {
	type: "execution_complete";
	runId: string;
	status: "completed" | "error" | "cancelled";
	reason?: string;
	stats: SessionStats;
}

export interface RpcCostUpdateEvent {
	type: "cost_update";
	runId: string;
	turnCost: number;
	cumulativeCost: number;
	tokens: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
}

export type RpcV2Event = RpcExecutionCompleteEvent | RpcCostUpdateEvent;

/** Agent event — a loosely typed record from the RPC event stream. */
export interface SdkAgentEvent {
	type: string;
	[key: string]: unknown;
}

export type RpcExtensionUIRequest =
	| { type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[]; timeout?: number; allowMultiple?: boolean }
	| { type: "extension_ui_request"; id: string; method: "confirm"; title: string; message: string; timeout?: number }
	| { type: "extension_ui_request"; id: string; method: "input"; title: string; placeholder?: string; timeout?: number; secure?: boolean }
	| { type: "extension_ui_request"; id: string; method: "editor"; title: string; prefill?: string }
	| { type: "extension_ui_request"; id: string; method: "notify"; message: string; notifyType?: "info" | "warning" | "error" }
	| { type: "extension_ui_request"; id: string; method: "setStatus"; statusKey: string; statusText: string | undefined }
	| {
			type: "extension_ui_request";
			id: string;
			method: "setWidget";
			widgetKey: string;
			widgetLines: string[] | undefined;
			widgetPlacement?: "aboveEditor" | "belowEditor";
	  }
	| { type: "extension_ui_request"; id: string; method: "setTitle"; title: string }
	| { type: "extension_ui_request"; id: string; method: "set_editor_text"; text: string };

export type RpcExtensionUIResponse =
	| { type: "extension_ui_response"; id: string; value: string }
	| { type: "extension_ui_response"; id: string; values: string[] }
	| { type: "extension_ui_response"; id: string; confirmed: boolean }
	| { type: "extension_ui_response"; id: string; cancelled: true };

export type McpBlockerMethod = Extract<RpcExtensionUIRequest, { type: "extension_ui_request" }>["method"];

export interface McpPendingBlocker {
	id: string;
	method: McpBlockerMethod;
	message: string;
	event: RpcExtensionUIRequest;
}

export type RpcCommandType = RpcCommand["type"];
