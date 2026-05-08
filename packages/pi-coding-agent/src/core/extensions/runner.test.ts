import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { ExtensionRunner } from "./runner.js";
import type { Extension, ExtensionRuntime, ToolCallEvent } from "./index.js";
import { SessionManager } from "../session-manager.js";
import { ModelRegistry } from "../model-registry.js";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthStorage } from "../auth-storage.js";

function makeMinimalRuntime(): ExtensionRuntime {
	return {
		sendMessage: async () => {},
		sendUserMessage: async () => {},
		appendEntry: () => {},
		setSessionName: () => {},
		getSessionName: () => undefined,
		setLabel: () => {},
		getActiveTools: () => [],
		getAllTools: () => [],
		setActiveTools: () => {},
		refreshTools: () => {},
		getCommands: () => [],
		setModel: async () => {},
		getThinkingLevel: () => undefined,
		setThinkingLevel: () => {},
		registerProvider: () => {},
		unregisterProvider: () => {},
		pendingProviderRegistrations: [],
	} as unknown as ExtensionRuntime;
}

function makeThrowingExtension(eventType: string, error: Error): Extension {
	const handlers = new Map();
	handlers.set(eventType, [
		async () => {
			throw error;
		},
	]);
	return {
		path: "/test/throwing-ext",
		handlers,
		commands: [],
		shortcuts: [],
		diagnostics: [],
	} as unknown as Extension;
}

function makeCommandExtension(path: string, commandName: string, marker: string): Extension {
	return {
		path,
		commands: new Map([
			[
				commandName,
				{
					name: commandName,
					description: marker,
					handler: async () => {},
				},
			],
		]),
		handlers: new Map(),
		shortcuts: new Map(),
		tools: new Map(),
		flags: new Map(),
		diagnostics: [],
	} as unknown as Extension;
}

describe("ExtensionRunner.emitToolCall", () => {
	it("catches throwing extension handler and routes to emitError", async (t) => {
		const dir = mkdtempSync(join(tmpdir(), "runner-test-"));
		t.after(() => {
			rmSync(dir, { recursive: true, force: true });
		});

		const sessionManager = SessionManager.create(dir, dir);
		const authStorage = AuthStorage.create();
		const modelRegistry = new ModelRegistry(authStorage, join(dir, "models.json"));

		const throwingExt = makeThrowingExtension("tool_call", new Error("handler crashed"));
		const runtime = makeMinimalRuntime();
		const runner = new ExtensionRunner([throwingExt], runtime, dir, sessionManager, modelRegistry);

		const errors: any[] = [];
		runner.onError((err) => errors.push(err));

		const event: ToolCallEvent = {
			type: "tool_call",
			toolCallId: "test-123",
			toolName: "test_tool",
			input: {},
		} as ToolCallEvent;

		const result = await runner.emitToolCall(event);

		// Should not throw — error is caught and routed to emitError
		assert.equal(result, undefined);
		assert.equal(errors.length, 1);
		assert.equal(errors[0].error, "handler crashed");
		assert.equal(errors[0].event, "tool_call");
		assert.equal(errors[0].extensionPath, "/test/throwing-ext");
	});

	it("preserves shutdown in tool_call handler context", async (t) => {
		const dir = mkdtempSync(join(tmpdir(), "runner-test-"));
		t.after(() => {
			rmSync(dir, { recursive: true, force: true });
		});

		const sessionManager = SessionManager.create(dir, dir);
		const authStorage = AuthStorage.create();
		const modelRegistry = new ModelRegistry(authStorage, join(dir, "models.json"));
		const runtime = makeMinimalRuntime();
		let shutdownCount = 0;
		const handlers = new Map();
		handlers.set("tool_call", [
			async (_event: unknown, ctx: { shutdown: () => void }) => {
				ctx.shutdown();
			},
		]);
		const extension = {
			path: "/test/shutdown-on-tool-call",
			handlers,
			commands: new Map(),
			shortcuts: new Map(),
			tools: new Map(),
			flags: new Map(),
			diagnostics: [],
		} as unknown as Extension;
		const runner = new ExtensionRunner([extension], runtime, dir, sessionManager, modelRegistry);
		runner.bindCore({} as any, {
			getModel: () => undefined,
			isIdle: () => true,
			abort: () => {},
			hasPendingMessages: () => false,
			shutdown: () => {
				shutdownCount += 1;
			},
			getContextUsage: () => undefined,
			compact: () => {},
			getSystemPrompt: () => "",
			setCompactionThresholdOverride: () => {},
		});

		const errors: any[] = [];
		runner.onError((err) => errors.push(err));

		await runner.emitToolCall({
			type: "tool_call",
			toolCallId: "test-123",
			toolName: "test_tool",
			input: {},
		} as ToolCallEvent);

		assert.equal(shutdownCount, 1);
		assert.equal(errors.length, 0);
	});
});

describe("ExtensionRunner.createContext", () => {
	it("uses the constructor workspace root instead of ambient process cwd", (t) => {
		const originalCwd = process.cwd();
		const dir = mkdtempSync(join(tmpdir(), "runner-test-"));
		const projectDir = join(dir, "project");
		t.after(() => {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		});

		const sessionManager = SessionManager.create(dir, dir);
		const authStorage = AuthStorage.create();
		const modelRegistry = new ModelRegistry(authStorage, join(dir, "models.json"));
		const runtime = makeMinimalRuntime();
		const runner = new ExtensionRunner([], runtime, originalCwd, sessionManager, modelRegistry);

		mkdirSync(projectDir);
		const realProjectDir = realpathSync(projectDir);
		process.chdir(realProjectDir);

		assert.equal(runner.createContext().cwd, originalCwd);
		assert.equal(runner.createCommandContext().cwd, originalCwd);
	});

	it("does not let lifecycle event handlers close the TUI", async (t) => {
		const dir = mkdtempSync(join(tmpdir(), "runner-test-"));
		t.after(() => {
			rmSync(dir, { recursive: true, force: true });
		});

		const sessionManager = SessionManager.create(dir, dir);
		const authStorage = AuthStorage.create();
		const modelRegistry = new ModelRegistry(authStorage, join(dir, "models.json"));
		const runtime = makeMinimalRuntime();
		let shutdownCount = 0;
		const handlers = new Map();
		handlers.set("agent_end", [
			async (_event: unknown, ctx: { shutdown: () => void }) => {
				ctx.shutdown();
			},
		]);
		const extension = {
			path: "/test/shutdown-on-agent-end",
			handlers,
			commands: new Map(),
			shortcuts: new Map(),
			tools: new Map(),
			flags: new Map(),
			diagnostics: [],
		} as unknown as Extension;
		const runner = new ExtensionRunner([extension], runtime, dir, sessionManager, modelRegistry);
		runner.bindCore({} as any, {
			getModel: () => undefined,
			isIdle: () => true,
			abort: () => {},
			hasPendingMessages: () => false,
			shutdown: () => {
				shutdownCount += 1;
			},
			getContextUsage: () => undefined,
			compact: () => {},
			getSystemPrompt: () => "",
			setCompactionThresholdOverride: () => {},
		});

		const errors: any[] = [];
		runner.onError((err) => errors.push(err));

		await runner.emit({ type: "agent_end", messages: [] } as any);

		assert.equal(shutdownCount, 0);
		assert.equal(errors.length, 1);
		assert.equal(errors[0].event, "agent_end");
		assert.match(errors[0].error, /cannot request TUI shutdown/);

		runner.createCommandContext().shutdown();
		assert.equal(shutdownCount, 1);
	});
});

describe("ExtensionRunner protected commands", () => {
	it("resolves /gsd to the bundled GSD extension even when another extension loads first", () => {
		const dir = mkdtempSync(join(tmpdir(), "runner-test-"));
		try {
			const sessionManager = SessionManager.create(dir, dir);
			const authStorage = AuthStorage.create();
			const modelRegistry = new ModelRegistry(authStorage, join(dir, "models.json"));
			const runtime = makeMinimalRuntime();
			const userExt = makeCommandExtension("/tmp/extensions/user-spoof/index.ts", "gsd", "spoof");
			const gsdExt = makeCommandExtension(`${dir}/extensions/gsd/index.ts`, "gsd", "bundled");
			const runner = new ExtensionRunner([userExt, gsdExt], runtime, dir, sessionManager, modelRegistry);

			const command = runner.getCommand("gsd");
			assert.equal(command?.description, "bundled");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("omits spoofed /gsd from registered extension commands", () => {
		const dir = mkdtempSync(join(tmpdir(), "runner-test-"));
		try {
			const sessionManager = SessionManager.create(dir, dir);
			const authStorage = AuthStorage.create();
			const modelRegistry = new ModelRegistry(authStorage, join(dir, "models.json"));
			const runtime = makeMinimalRuntime();
			const userExt = makeCommandExtension("/tmp/extensions/user-spoof/index.ts", "gsd", "spoof");
			const gsdExt = makeCommandExtension(`${dir}/extensions/gsd/index.ts`, "gsd", "bundled");
			const runner = new ExtensionRunner([userExt, gsdExt], runtime, dir, sessionManager, modelRegistry);

			const commands = runner.getRegisteredCommands();
			assert.deepEqual(commands.map((command) => command.description), ["bundled"]);
			assert.ok(
				runner.getCommandDiagnostics().some((diagnostic) => diagnostic.message.includes("protected command owner")),
				"spoofed /gsd conflict should be reported",
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
