// Regression test for #4243 — abort() must be called BEFORE
// _disconnectFromAgent() inside newSession() and switchSession() so that
// message_end/agent_end events (and the #4216 finalization code) fire
// before we unsubscribe from the event bus.
//
// Verified behaviourally: we construct a real AgentSession, wrap `abort`
// and `_disconnectFromAgent` with call-order recording, trigger each
// session-transition method, and assert the observed call order.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Agent } from "@gsd/pi-agent-core";
import { AgentSession } from "./agent-session.js";
import { AuthStorage } from "./auth-storage.js";
import { ModelRegistry } from "./model-registry.js";
import { DefaultResourceLoader } from "./resource-loader.js";
import { SessionManager } from "./session-manager.js";
import { SettingsManager } from "./settings-manager.js";

let testDir: string;

async function createSession(opts: { persistSessions?: boolean } = {}): Promise<AgentSession> {
	const agentDir = join(testDir, "agent-home");
	const authStorage = AuthStorage.inMemory({});
	const modelRegistry = new ModelRegistry(authStorage, join(agentDir, "models.json"));
	const settingsManager = SettingsManager.inMemory();
	const resourceLoader = new DefaultResourceLoader({
		cwd: testDir,
		agentDir,
		settingsManager,
		noExtensions: true,
		noPromptTemplates: true,
		noThemes: true,
	});
	await resourceLoader.reload();

	// switchSession() needs a sessionFile; in-memory manager returns undefined.
	// Use file-backed manager when the test needs to resume.
	const sessionManager = opts.persistSessions
		? SessionManager.create(testDir, join(testDir, "sessions"))
		: SessionManager.inMemory(testDir);

	return new AgentSession({
		agent: new Agent(),
		sessionManager,
		settingsManager,
		cwd: testDir,
		resourceLoader,
		modelRegistry,
	});
}

/**
 * Wrap two methods on the same object so their call order is recorded.
 * Returns the recording array — assertions use index lookups.
 */
function recordCallOrder<O extends object>(
	target: O,
	methods: Array<keyof O>,
): string[] {
	const order: string[] = [];
	for (const method of methods) {
		const name = String(method);
		const original = (target as any)[name] as (...args: unknown[]) => unknown;
		if (typeof original !== "function") {
			throw new Error(`recordCallOrder: ${name} is not a function on target`);
		}
		(target as any)[name] = function (this: O, ...args: unknown[]) {
			order.push(name);
			return original.apply(this, args);
		};
	}
	return order;
}

function makeAssistantMessage(text: string) {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			total: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	} as any;
}

function installAgentEndSessionTransition(
	session: AgentSession,
	transition: () => Promise<unknown>,
): void {
	(session as any)._extensionRunner = {
		hasHandlers: () => false,
		emit: async (event: any) => {
			if (event.type === "agent_end") {
				await transition();
			}
		},
		emitStop: async () => {},
	};
}

describe("#4243 — abort() must run before _disconnectFromAgent()", () => {
	beforeEach(() => {
		testDir = mkdtempSync(join(tmpdir(), "agent-session-abort-"));
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it("newSession() invokes abort() before _disconnectFromAgent()", async () => {
		const session = await createSession();
		(session as any).agent.state.isStreaming = true;
		const order = recordCallOrder(session as any, ["abort", "_disconnectFromAgent"]);

		const ok = await session.newSession();
		assert.equal(ok, true);

		const abortIdx = order.indexOf("abort");
		const disconnectIdx = order.indexOf("_disconnectFromAgent");
		assert.ok(abortIdx >= 0, `newSession should call abort(); order=${order.join(",")}`);
		assert.ok(
			disconnectIdx >= 0,
			`newSession should call _disconnectFromAgent(); order=${order.join(",")}`,
		);
		assert.ok(
			abortIdx < disconnectIdx,
			`abort() must run before _disconnectFromAgent(); order=${order.join(",")}`,
		);
	});

	it("newSession() waits instead of aborting when the prior turn is idle but not settled", async () => {
		const session = await createSession();
		const order: string[] = [];
		let releaseIdle!: () => void;
		const idle = new Promise<void>((resolve) => {
			releaseIdle = resolve;
		});

		(session as any).agent.state.isStreaming = false;
		(session as any).agent.waitForIdle = () => {
			order.push("waitForIdle");
			return idle;
		};
		(session as any).abort = async () => {
			order.push("abort");
		};
		const originalDisconnect = (session as any)._disconnectFromAgent.bind(session);
		(session as any)._disconnectFromAgent = () => {
			order.push("_disconnectFromAgent");
			originalDisconnect();
		};

		const pendingNewSession = session.newSession();
		await Promise.resolve();
		assert.deepEqual(order, ["waitForIdle"]);
		assert.equal(order.includes("abort"), false);

		releaseIdle();
		const ok = await pendingNewSession;
		assert.equal(ok, true);
		assert.deepEqual(order, ["waitForIdle", "_disconnectFromAgent"]);
		assert.equal(order.includes("abort"), false);
	});

	it("newSession() waits instead of aborting while agent_end processing is still streaming", async () => {
		const session = await createSession();
		const order: string[] = [];
		let releaseIdle!: () => void;
		const idle = new Promise<void>((resolve) => {
			releaseIdle = resolve;
		});

		(session as any)._processingAgentEnd = true;
		(session as any).agent.state.isStreaming = true;
		(session as any).agent.waitForIdle = () => {
			order.push("waitForIdle");
			return idle;
		};
		(session as any).abort = async () => {
			order.push("abort");
		};
		const originalDisconnect = (session as any)._disconnectFromAgent.bind(session);
		(session as any)._disconnectFromAgent = () => {
			order.push("_disconnectFromAgent");
			originalDisconnect();
		};

		const pendingNewSession = session.newSession();
		await Promise.resolve();
		assert.deepEqual(order, ["waitForIdle"]);
		assert.equal(order.includes("abort"), false);

		releaseIdle();
		const ok = await pendingNewSession;
		assert.equal(ok, true);
		assert.deepEqual(order, ["waitForIdle", "_disconnectFromAgent"]);
		assert.equal(order.includes("abort"), false);
	});

	it("newSession() waits during agent_end processing even once already idle", async () => {
		const session = await createSession();
		const order: string[] = [];

		(session as any)._processingAgentEnd = true;
		(session as any).agent.state.isStreaming = false;
		(session as any).agent.waitForIdle = async () => {
			order.push("waitForIdle");
		};
		(session as any).abort = async () => {
			order.push("abort");
		};
		const originalDisconnect = (session as any)._disconnectFromAgent.bind(session);
		(session as any)._disconnectFromAgent = () => {
			order.push("_disconnectFromAgent");
			originalDisconnect();
		};

		const ok = await session.newSession();
		assert.equal(ok, true);
		assert.deepEqual(order, ["waitForIdle", "_disconnectFromAgent"]);
		assert.equal(order.includes("abort"), false);
	});

	it("abort() marks synthetic agent_end processing while extension handlers run", async () => {
		const session = await createSession();
		const observedProcessingStates: boolean[] = [];

		(session as any).agent.abort = () => {};
		(session as any).agent.waitForIdle = async () => {};
		(session as any)._extensionRunner = {
			emit: async (event: any) => {
				if (event.type === "agent_end") {
					observedProcessingStates.push((session as any)._processingAgentEnd);
				}
			},
			emitStop: async () => {
				observedProcessingStates.push((session as any)._processingAgentEnd);
			},
		};

		await session.abort();

		assert.deepEqual(observedProcessingStates, [true, true]);
		assert.equal((session as any)._processingAgentEnd, false);
	});

	it("newSession() during agent_end preserves the previous session for resume", async () => {
		const session = await createSession({ persistSessions: true });
		const previousSessionFile = session.sessionFile;
		assert.ok(previousSessionFile, "need a persisted session file");

		session.sessionManager.appendMessage({
			role: "user",
			content: [{ type: "text", text: "persisted prompt" }],
		} as any);
		session.sessionManager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "persisted response" }],
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				total: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		} as any);
		session.agent.replaceMessages(session.sessionManager.buildSessionContext().messages);

		(session as any)._processingAgentEnd = true;
		(session as any).agent.waitForIdle = async () => {};

		const ok = await session.newSession();
		assert.equal(ok, true);
		assert.notEqual(session.sessionFile, previousSessionFile);
		assert.deepEqual(session.messages, []);

		(session as any)._processingAgentEnd = false;
		const switched = await session.switchSession(previousSessionFile);
		assert.equal(switched, true);

		const restoredText = session.messages
			.flatMap((message: any) => message.content ?? [])
			.filter((part: any) => part.type === "text")
			.map((part: any) => part.text);
		assert.deepEqual(restoredText, ["persisted prompt", "persisted response"]);
	});

	it("switchSession() waits instead of aborting while agent_end processing is still streaming", async () => {
		const session = await createSession({ persistSessions: true });
		const previousSessionFile = session.sessionFile;
		assert.ok(previousSessionFile, "need a persisted session file");

		session.sessionManager.appendMessage({
			role: "user",
			content: [{ type: "text", text: "switch persisted prompt" }],
		} as any);
		session.sessionManager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "switch persisted response" }],
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				total: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		} as any);
		session.agent.replaceMessages(session.sessionManager.buildSessionContext().messages);

		const ok = await session.newSession();
		assert.equal(ok, true);
		const activeSessionFile = session.sessionFile;
		assert.ok(activeSessionFile, "need an active session file");
		assert.notEqual(activeSessionFile, previousSessionFile);
		assert.deepEqual(session.messages, []);

		const order: string[] = [];
		let releaseIdle!: () => void;
		const idle = new Promise<void>((resolve) => {
			releaseIdle = resolve;
		});

		(session as any)._processingAgentEnd = true;
		(session as any).agent.state.isStreaming = true;
		(session as any).agent.waitForIdle = () => {
			order.push("waitForIdle");
			return idle;
		};
		(session as any).abort = async () => {
			order.push("abort");
		};
		const originalDisconnect = (session as any)._disconnectFromAgent.bind(session);
		(session as any)._disconnectFromAgent = () => {
			order.push("_disconnectFromAgent");
			originalDisconnect();
		};

		const pendingSwitch = session.switchSession(previousSessionFile);
		await Promise.resolve();
		assert.deepEqual(order, ["waitForIdle"]);
		assert.equal(order.includes("abort"), false);
		assert.equal(session.sessionFile, activeSessionFile);
		assert.deepEqual(session.messages, []);

		releaseIdle();
		const switched = await pendingSwitch;
		assert.equal(switched, true);
		assert.deepEqual(order, ["waitForIdle", "_disconnectFromAgent"]);
		assert.equal(order.includes("abort"), false);
		assert.equal(session.sessionFile, previousSessionFile);

		const restoredText = session.messages
			.flatMap((message: any) => message.content ?? [])
			.filter((part: any) => part.type === "text")
			.map((part: any) => part.text);
		assert.deepEqual(restoredText, ["switch persisted prompt", "switch persisted response"]);
	});

	it("newSession() during agent_end skips stale post-handlers after the transition starts", async () => {
		const session = await createSession();
		const assistantMessage = makeAssistantMessage("old response");
		let compactionChecks = 0;
		let listenerAgentEnds = 0;

		(session as any)._lastAssistantMessage = assistantMessage;
		(session as any)._compactionOrchestrator.checkCompaction = async () => {
			compactionChecks++;
		};
		session.subscribe((event: any) => {
			if (event.type === "agent_end") listenerAgentEnds++;
		});
		installAgentEndSessionTransition(session, () => session.newSession());

		await (session as any)._processAgentEvent({
			type: "agent_end",
			messages: [assistantMessage],
		});

		assert.equal(compactionChecks, 0);
		assert.equal(listenerAgentEnds, 0);
		assert.equal((session as any)._lastAssistantMessage, undefined);
		assert.equal((session as any)._sessionSwitchPending, false);
		assert.equal((session as any)._sessionTransitionStartedDuringAgentEnd, false);
	});

	it("switchSession() during agent_end skips stale post-handlers after the transition starts", async () => {
		const session = await createSession({ persistSessions: true });
		const previousSessionFile = session.sessionFile;
		assert.ok(previousSessionFile, "need a persisted session file");

		const ok = await session.newSession();
		assert.equal(ok, true);
		assert.notEqual(session.sessionFile, previousSessionFile);

		const assistantMessage = makeAssistantMessage("old switch response");
		let compactionChecks = 0;
		let listenerAgentEnds = 0;

		(session as any)._lastAssistantMessage = assistantMessage;
		(session as any)._compactionOrchestrator.checkCompaction = async () => {
			compactionChecks++;
		};
		session.subscribe((event: any) => {
			if (event.type === "agent_end") listenerAgentEnds++;
		});
		installAgentEndSessionTransition(session, () => session.switchSession(previousSessionFile));

		await (session as any)._processAgentEvent({
			type: "agent_end",
			messages: [assistantMessage],
		});

		assert.equal(session.sessionFile, previousSessionFile);
		assert.equal(compactionChecks, 0);
		assert.equal(listenerAgentEnds, 0);
		assert.equal((session as any)._lastAssistantMessage, undefined);
		assert.equal((session as any)._sessionSwitchPending, false);
		assert.equal((session as any)._sessionTransitionStartedDuringAgentEnd, false);
	});

	it("agent_end post-handlers bail while a session switch is pending", async () => {
		const session = await createSession();
		const assistantMessage = makeAssistantMessage("old pending response");
		let compactionChecks = 0;
		let listenerAgentEnds = 0;

		(session as any)._lastAssistantMessage = assistantMessage;
		(session as any)._sessionSwitchPending = true;
		(session as any)._compactionOrchestrator.checkCompaction = async () => {
			compactionChecks++;
		};
		session.subscribe((event: any) => {
			if (event.type === "agent_end") listenerAgentEnds++;
		});

		await (session as any)._processAgentEvent({
			type: "agent_end",
			messages: [assistantMessage],
		});

		assert.equal(compactionChecks, 0);
		assert.equal(listenerAgentEnds, 1);
		assert.equal((session as any)._lastAssistantMessage, undefined);
	});

	it("switchSession() invokes abort() before _disconnectFromAgent()", async () => {
		const session = await createSession({ persistSessions: true });
		// Seed a session file to switch to (switchSession reads from the session manager).
		await session.newSession();
		const sessionFile = session.sessionFile;
		assert.ok(typeof sessionFile === "string" && sessionFile.length > 0, "need a session file to switch to");

		(session as any).agent.state.isStreaming = true;
		const order = recordCallOrder(session as any, ["abort", "_disconnectFromAgent"]);

		const ok = await session.switchSession(sessionFile);
		assert.equal(ok, true);

		const abortIdx = order.indexOf("abort");
		const disconnectIdx = order.indexOf("_disconnectFromAgent");
		assert.ok(abortIdx >= 0, `switchSession should call abort(); order=${order.join(",")}`);
		assert.ok(
			disconnectIdx >= 0,
			`switchSession should call _disconnectFromAgent(); order=${order.join(",")}`,
		);
		assert.ok(
			abortIdx < disconnectIdx,
			`abort() must run before _disconnectFromAgent() in switchSession; order=${order.join(",")}`,
		);
	});
});
