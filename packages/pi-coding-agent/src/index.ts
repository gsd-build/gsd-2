// Core session management

// Config paths
export { getAgentDir, VERSION } from "./config.js";
// Config constants needed by @gsd/agent-modes
export { APP_NAME, CONFIG_DIR_NAME, ENV_AGENT_DIR } from "./config.js";
// Config utilities needed by @gsd/agent-modes
export { getAuthPath, getDebugLogPath, getUpdateInstruction, getShareViewerUrl, getCustomThemesDir } from "./config.js";
// Additional config utilities needed by @gsd/agent-modes entry point
export { getModelsPath } from "./config.js";
// Config utilities needed by @gsd/agent-core
export { getDocsPath, getExamplesPath, getReadmePath, getExportTemplateDir } from "./config.js";
// Thinking level utilities needed by @gsd/agent-modes
export { isValidThinkingLevel, VALID_THINKING_LEVELS } from "./core/thinking-level.js";
// Tool registry needed by @gsd/agent-modes
export { allTools } from "./core/tools/index.js";
export type { Tool, ToolName } from "./core/tools/index.js";
// Path utilities needed by @gsd/agent-modes
export { resolveReadPath } from "./core/tools/path-utils.js";
// KeybindingsManager class (value export) needed by @gsd/agent-modes
export { KeybindingsManager } from "@gsd/agent-core";
// Image utilities needed by @gsd/agent-modes
export { detectSupportedImageMimeTypeFromFile } from "./utils/mime.js";
export { formatDimensionNote, resizeImage, type ImageResizeOptions, type ResizedImage } from "./utils/image-resize.js";
export { convertToPng } from "./utils/image-convert.js";
export { extensionForImageMimeType, readClipboardImage } from "./utils/clipboard-image.js";
// Changelog utilities needed by @gsd/agent-modes
export { getChangelogPath, getNewEntries, parseChangelog } from "./utils/changelog.js";
// Shell utilities needed by @gsd/agent-modes
export { sanitizeBinaryOutput } from "./utils/shell.js";
// Tool utilities needed by @gsd/agent-modes
export { ensureTool } from "./utils/tools-manager.js";
export {
	AgentSession,
	type AgentSessionConfig,
	type AgentSessionEvent,
	type AgentSessionEventListener,
	type ModelCycleResult,
	type ParsedSkillBlock,
	type PromptOptions,
	parseSkillBlock,
	type SessionStats,
	type SessionStateChangeReason,
} from "@gsd/agent-core";
// Auth and model registry
export {
	type ApiKeyCredential,
	type AuthCredential,
	AuthStorage,
	type AuthStorageBackend,
	FileAuthStorageBackend,
	InMemoryAuthStorageBackend,
	type OAuthCredential,
	type UsageLimitErrorType,
} from "./core/auth-storage.js";
// Compaction
export {
	type BranchPreparation,
	type BranchSummaryResult,
	type CollectEntriesResult,
	type CompactionResult,
	type CutPointResult,
	calculateContextTokens,
	chunkMessages,
	collectEntriesForBranchSummary,
	compact,
	DEFAULT_COMPACTION_SETTINGS,
	estimateTokens,
	type FileOperations,
	findCutPoint,
	findTurnStartIndex,
	type GenerateBranchSummaryOptions,
	generateBranchSummary,
	generateSummary,
	getLastAssistantUsage,
	prepareBranchEntries,
	serializeConversation,
	shouldCompact,
} from "@gsd/agent-core";
export { createEventBus, type EventBus, type EventBusController } from "./core/event-bus.js";
// Extension system
export type {
	AdjustToolSetEvent,
	AdjustToolSetResult,
	AgentEndEvent,
	AgentStartEvent,
	AgentToolResult,
	AgentToolUpdateCallback,
	AppAction,
	BashToolCallEvent,
	BeforeAgentStartEvent,
	BeforeProviderRequestEvent,
	BeforeProviderRequestEventResult,
	CompactOptions,
	ContextEvent,
	ContextUsage,
	CustomToolCallEvent,
	EditToolCallEvent,
	ExecOptions,
	ExecResult,
	Extension,
	ExtensionActions,
	ExtensionAPI,
	ExtensionManifest,
	ExtensionCommandContext,
	ExtensionCommandContextActions,
	ExtensionContext,
	ExtensionContextActions,
	ExtensionError,
	ExtensionEvent,
	ExtensionFactory,
	ExtensionFlag,
	ExtensionHandler,
	ExtensionRuntime,
	ExtensionShortcut,
	ExtensionUIContext,
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
	FindToolCallEvent,
	GrepToolCallEvent,
	InputEvent,
	InputEventResult,
	InputSource,
	LoadExtensionsResult,
	LsToolCallEvent,
	MessageRenderer,
	MessageRenderOptions,
	ProviderConfig,
	ProviderModelConfig,
	LifecycleHookContext,
	LifecycleHookHandler,
	LifecycleHookMap,
	LifecycleHookPhase,
	LifecycleHookScope,
	ReadToolCallEvent,
	RegisteredCommand,
	RegisteredTool,
	ExtensionErrorListener,
	MessageEndEvent,
	MessageStartEvent,
	MessageUpdateEvent,
	SessionBeforeCompactEvent,
	SessionBeforeCompactResult,
	SessionBeforeForkEvent,
	SessionBeforeForkResult,
	SessionBeforeSwitchEvent,
	SessionBeforeSwitchResult,
	SessionBeforeTreeEvent,
	SessionBeforeTreeResult,
	SessionCompactEvent,
	SessionForkEvent,
	SessionShutdownEvent,
	SessionStartEvent,
	SessionSwitchEvent,
	SessionTreeEvent,
	ShutdownHandler,
	SlashCommandInfo,
	SlashCommandLocation,
	SlashCommandSource,
	TerminalInputHandler,
	ToolCallEvent,
	ToolCompatibility,
	ToolDefinition,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
	ToolExecutionUpdateEvent,
	ToolInfo,
	SortResult,
	SortWarning,
	ToolRenderResultOptions,
	ToolResultEvent,
	TreePreparation,
	TurnEndEvent,
	TurnStartEvent,
	UserBashEvent,
	UserBashEventResult,
	BashTransformEvent,
	BashTransformEventResult,
	WidgetPlacement,
	WriteToolCallEvent,
} from "./core/extensions/index.js";
export {
	createExtensionRuntime,
	discoverAndLoadExtensions,
	ExtensionRunner,
	importExtensionModule,
	isToolCallEventType,
	isToolResultEventType,
	loadExtensions,
	readManifest,
	readManifestFromEntryPath,
	sortExtensionPaths,
	wrapRegisteredTool,
	wrapRegisteredTools,
	wrapToolsWithExtensions,
	wrapToolWithExtensions,
} from "./core/extensions/index.js";
// Footer data provider (git branch + extension statuses - data not otherwise available to extensions)
export type { ReadonlyFooterDataProvider } from "./core/footer-data-provider.js";
// FooterDataProvider class needed by @gsd/agent-modes
export { FooterDataProvider } from "./core/footer-data-provider.js";
export type { BashResult } from "@gsd/agent-core";
export { convertToLlm } from "./core/messages.js";
// Message types and factories needed by @gsd/agent-modes
export { createCompactionSummaryMessage } from "./core/messages.js";
export type { BranchSummaryMessage, CompactionSummaryMessage, CustomMessage } from "./core/messages.js";
// Additional symbols needed by @gsd/agent-core compaction files
export { createBranchSummaryMessage, createCustomMessage } from "./core/messages.js";
export { TOOL_RESULT_MAX_CHARS, COMPACTION_KEEP_RECENT_TOKENS, COMPACTION_RESERVE_TOKENS } from "./core/constants.js";
export { getErrorMessage } from "./utils/error.js";
// Symbols needed by @gsd/agent-core agent-session.ts
export { DEFAULT_THINKING_LEVEL } from "./core/defaults.js";
export type { BashExecutionMessage } from "./core/messages.js";
export { expandPromptTemplate } from "./core/prompt-templates.js";
export { RetryHandler } from "./core/retry-handler.js";
export type { ResourceExtensionPaths } from "./core/resource-loader.js";
export { createAllTools } from "./core/tools/index.js";
export { findInitialModel } from "./core/model-resolver.js";
// Contextual tips system needed by @gsd/agent-modes
export { ContextualTips } from "@gsd/agent-core";
// Model scope resolution needed by @gsd/agent-modes
export { resolveModelScope } from "./core/model-resolver.js";
// CLI model resolution needed by @gsd/agent-modes entry point
export { resolveCliModel } from "./core/model-resolver.js";
export type { ScopedModel, ResolveCliModelResult } from "./core/model-resolver.js";
// Startup timing instrumentation needed by @gsd/agent-modes entry point
export { printTimings, time } from "./core/timings.js";
// HTML export utility needed by @gsd/agent-modes entry point
export { exportFromFile } from "@gsd/agent-core";
// Migrations needed by @gsd/agent-modes entry point
export { runMigrations, showDeprecationWarnings } from "./migrations.js";
// Slash commands needed by @gsd/agent-modes
export { BUILTIN_SLASH_COMMANDS } from "./core/slash-commands.js";
// Edit diff utility needed by @gsd/agent-modes
export { computeEditDiff } from "./core/tools/edit-diff.js";
export type { EditDiffError, EditDiffResult } from "./core/tools/edit-diff.js";
export { ModelDiscoveryCache } from "./core/discovery-cache.js";
export type { DiscoveredModel, DiscoveryResult, ProviderDiscoveryAdapter } from "./core/model-discovery.js";
export { getDiscoverableProviders, getDiscoveryAdapter } from "./core/model-discovery.js";
export { ModelRegistry } from "./core/model-registry.js";
export { ModelsJsonWriter } from "./core/models-json-writer.js";
export type {
	PackageManager,
	PathMetadata,
	ProgressCallback,
	ProgressEvent,
	ResolvedPaths,
	ResolvedResource,
} from "./core/package-manager.js";
export { DefaultPackageManager } from "./core/package-manager.js";
export type { PackageCommand, PackageCommandOptions, PackageCommandRunnerOptions, PackageCommandRunnerResult } from "./core/package-commands.js";
export { getPackageCommandUsage, parsePackageCommand, runPackageCommand } from "./core/package-commands.js";
export type { ResourceCollision, ResourceDiagnostic, ResourceLoader } from "./core/resource-loader.js";
export { DefaultResourceLoader } from "./core/resource-loader.js";
// SDK for programmatic usage
export {
	type CreateAgentSessionOptions,
	type CreateAgentSessionResult,
	CredentialCooldownError,
	// Factory
	createAgentSession,
	createBashTool,
	// Tool factories (for custom cwd)
	createCodingTools,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadOnlyTools,
	createReadTool,
	createWriteTool,
	type PromptTemplate,
	// Pre-built tools (use process.cwd())
	readOnlyTools,
} from "@gsd/agent-core";
export {
	type BranchSummaryEntry,
	buildSessionContext,
	type CompactionEntry,
	CURRENT_SESSION_VERSION,
	type CustomEntry,
	type CustomMessageEntry,
	type FileEntry,
	getLatestCompactionEntry,
	type ModelChangeEntry,
	migrateSessionEntries,
	type NewSessionOptions,
	parseSessionEntries,
	type ReadonlySessionManager,
	type SessionContext,
	type SessionEntry,
	type SessionEntryBase,
	type SessionHeader,
	type SessionInfo,
	type SessionInfoEntry,
	type SessionListProgress,
	SessionManager,
	type SessionMessageEntry,
	type SessionTreeNode,
	type ThinkingLevelChangeEntry,
} from "./core/session-manager.js";
// Blob and artifact storage
export { BlobStore, isBlobRef, parseBlobRef, externalizeImageData, resolveImageData } from "@gsd/agent-core";
export { ArtifactManager } from "@gsd/agent-core";
export {
	type AsyncSettings,
	type CompactionSettings,
	type FallbackChainEntry,
	type ImageSettings,
	type MemorySettings,
	type PackageSource,
	type RetrySettings,
	SettingsManager,
	type TaskIsolationSettings,
} from "./core/settings-manager.js";
export {
	SAFE_COMMAND_PREFIXES,
	setAllowedCommandPrefixes,
	getAllowedCommandPrefixes,
} from "./core/resolve-config-value.js";
// Skills
export {
	ECOSYSTEM_SKILLS_DIR,
	ECOSYSTEM_PROJECT_SKILLS_DIR,
	formatSkillsForPrompt,
	getLoadedSkills,
	type LoadSkillsFromDirOptions,
	type LoadSkillsResult,
	loadSkills,
	loadSkillsFromDir,
	type Skill,
	type SkillFrontmatter,
} from "./core/skills.js";
// Tools
export {
	type BashInterceptorRule,
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	bashTool,
	rewriteBackgroundCommand,
	checkBashInterception,
	type CompiledInterceptor,
	compileInterceptor,
	DEFAULT_BASH_INTERCEPTOR_RULES,
	codingTools,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
	editTool,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
	findTool,
	formatSize,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	type GrepToolOptions,
	grepTool,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
	lsTool,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
	readTool,
	type ToolsOptions,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
	writeTool,
	// Hashline edit mode tools
	hashlineEditTool,
	hashlineReadTool,
	hashlineCodingTools,
	createHashlineEditTool,
	createHashlineReadTool,
	createHashlineCodingTools,
	type HashlineEditInput,
	type HashlineEditToolDetails,
	type HashlineEditToolOptions,
	type HashlineReadToolDetails,
	type HashlineReadToolInput,
	type HashlineReadToolOptions,
	// Tool compatibility registry (ADR-005)
	registerToolCompatibility,
	getToolCompatibility,
	getAllToolCompatibility,
	registerMcpToolCompatibility,
	resetToolCompatibilityRegistry,
} from "./core/tools/index.js";
// RPC JSONL utilities (now in core/)
export { attachJsonlLineReader, serializeJsonLine } from "./core/jsonl.js";
// UI components for extensions
export {
	ArminComponent,
	AssistantMessageComponent,
	appKey,
	appKeyHint,
	BashExecutionComponent,
	BorderedLoader,
	BranchSummaryMessageComponent,
	CompactionSummaryMessageComponent,
	CustomEditor,
	CustomMessageComponent,
	DynamicBorder,
	ExtensionEditorComponent,
	ExtensionInputComponent,
	ExtensionSelectorComponent,
	editorKey,
	FooterComponent,
	keyHint,
	LoginDialogComponent,
	ModelSelectorComponent,
	OAuthSelectorComponent,
	ProviderManagerComponent,
	type RenderDiffOptions,
	rawKeyHint,
	renderDiff,
	SessionSelectorComponent,
	type SettingsCallbacks,
	type SettingsConfig,
	SettingsSelectorComponent,
	ShowImagesSelectorComponent,
	SkillInvocationMessageComponent,
	ThemeSelectorComponent,
	ThinkingSelectorComponent,
	ToolExecutionComponent,
	type ToolExecutionOptions,
	TreeSelectorComponent,
	truncateToVisualLines,
	UserMessageComponent,
	UserMessageSelectorComponent,
	type VisualTruncateResult,
} from "./components/index.js";
// Theme utilities for custom tools, extensions, and @gsd/agent-modes
export {
	getAvailableThemes,
	getAvailableThemesWithPaths,
	getEditorTheme,
	getLanguageFromPath,
	getMarkdownTheme,
	getResolvedThemeColors,
	getSelectListTheme,
	getSettingsListTheme,
	getThemeByName,
	getThemeExportColors,
	highlightCode,
	initTheme,
	onThemeChange,
	setRegisteredThemes,
	setTheme,
	setThemeInstance,
	stopThemeWatcher,
	theme,
	Theme,
	type ThemeColor,
	type ThemeInfo,
} from "./core/theme/theme.js";
// Clipboard utilities
export { copyToClipboard } from "./utils/clipboard.js";
export { parseFrontmatter, stripFrontmatter } from "./utils/frontmatter.js";
// Shell utilities
export { getShellConfig, getShellEnv, killProcessTree, sanitizeCommand } from "./utils/shell.js";
// FallbackResolver re-exported from @gsd/agent-core (moved in CORE-01)
export { FallbackResolver, type FallbackResult } from "@gsd/agent-core";
// Cross-platform path display
export { toPosixPath } from "./utils/path-display.js";
// Git utilities needed by @gsd/agent-core
export { parseGitUrl } from "./utils/git.js";
