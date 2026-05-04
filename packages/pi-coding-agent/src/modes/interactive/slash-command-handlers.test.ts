// GSD2 - Slash command tests for interactive TUI settings commands

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Container } from "@gsd/pi-tui";
import { SettingsManager } from "../../core/settings-manager.js";
import { dispatchSlashCommand, type SlashCommandContext } from "./slash-command-handlers.js";

function makeContext(settingsManager = SettingsManager.inMemory()): SlashCommandContext {
	const statuses: string[] = [];
	const warnings: string[] = [];
	const renders: string[] = [];
	return {
		session: {} as never,
		ui: {} as never,
		keybindings: {} as never,
		chatContainer: new Container(),
		statusContainer: new Container(),
		editorContainer: new Container(),
		headerContainer: new Container(),
		pendingMessagesContainer: new Container(),
		editor: {} as never,
		defaultEditor: {} as never,
		sessionManager: {} as never,
		settingsManager,
		invalidateFooter() {},
		showStatus(message: string) {
			statuses.push(message);
		},
		showError(message: string) {
			throw new Error(message);
		},
		showWarning(message: string) {
			warnings.push(message);
		},
		showSelector() {},
		updateEditorBorderColor() {},
		getMarkdownThemeWithSettings: () => ({} as never),
		requestRender() {
			renders.push("render");
		},
		updateTerminalTitle() {},
		showSettingsSelector() {},
		showModelsSelector: async () => {},
		handleModelCommand: async () => {},
		showUserMessageSelector() {},
		showTreeSelector() {},
		showProviderManager() {},
		showOAuthSelector: async () => {},
		showSessionSelector() {},
		handleClearCommand: async () => {},
		handleReloadCommand: async () => {},
		handleDebugCommand() {},
		shutdown: async () => {},
		executeCompaction: async () => undefined,
		handleBashCommand: async () => {},
		_testStatuses: statuses,
		_testWarnings: warnings,
		_testRenders: renders,
	} as SlashCommandContext & {
		_testStatuses: string[];
		_testWarnings: string[];
		_testRenders: string[];
	};
}

describe("dispatchSlashCommand /tui", () => {
	it("persists /tui mode validation to terminal adaptive mode", async () => {
		const settingsManager = SettingsManager.inMemory();
		const ctx = makeContext(settingsManager) as SlashCommandContext & {
			_testStatuses: string[];
			_testRenders: string[];
		};

		const handled = await dispatchSlashCommand("/tui mode validation", ctx);

		assert.equal(handled, true);
		assert.equal(settingsManager.getAdaptiveMode(), "validation");
		assert.deepEqual(ctx._testStatuses, ["TUI mode: validation"]);
		assert.equal(ctx._testRenders.length, 1);
	});

	it("rejects unknown TUI modes without changing settings", async () => {
		const settingsManager = SettingsManager.inMemory({ terminal: { adaptiveMode: "workflow" } });
		const ctx = makeContext(settingsManager) as SlashCommandContext & {
			_testWarnings: string[];
		};

		const handled = await dispatchSlashCommand("/tui mode poster", ctx);

		assert.equal(handled, true);
		assert.equal(settingsManager.getAdaptiveMode(), "workflow");
		assert.match(ctx._testWarnings[0], /Usage: \/tui mode/);
	});
});
