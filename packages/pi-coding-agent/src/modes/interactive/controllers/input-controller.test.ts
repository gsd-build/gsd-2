// GSD2 — Tests for input-controller image pasting behavior
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupEditorSubmitHandler } from "./input-controller.js";
import type { InteractiveModeStateHost } from "../interactive-mode-state.js";
import type { ImageContent } from "@gsd/pi-ai";

/** Minimal mock host satisfying InteractiveModeStateHost + setupEditorSubmitHandler extras. */
function createMockHost() {
	const promptCalls: Array<{ text: string; options?: any }> = [];
	const historyCalls: string[] = [];
	let editorText = "";

	const host = {
		defaultEditor: {
			onSubmit: undefined as ((text: string) => Promise<void>) | undefined,
			addToHistory: (text: string) => { historyCalls.push(text); },
			setText: (text: string) => { editorText = text; },
			getText: () => editorText,
		},
		editor: {
			setText: (text: string) => { editorText = text; },
			getText: () => editorText,
			addToHistory: (text: string) => { historyCalls.push(text); },
		},
		session: {
			isStreaming: false,
			isCompacting: false,
			isBashRunning: false,
			prompt: async (text: string, options?: any) => { promptCalls.push({ text, options }); },
		},
		ui: { requestRender: () => {} },
		footer: {},
		keybindings: {},
		statusContainer: {},
		chatContainer: {},
		settingsManager: {},
		pendingTools: new Map(),
		toolOutputExpanded: false,
		hideThinkingBlock: false,
		isBashMode: false,
		onInputCallback: undefined,
		isInitialized: true,
		loadingAnimation: undefined,
		pendingWorkingMessage: undefined,
		defaultWorkingMessage: "Working...",
		streamingComponent: undefined,
		streamingMessage: undefined,
		retryEscapeHandler: undefined,
		retryLoader: undefined,
		autoCompactionLoader: undefined,
		autoCompactionEscapeHandler: undefined,
		compactionQueuedMessages: [] as Array<{ text: string; mode: "steer" | "followUp" }>,
		extensionSelector: undefined,
		extensionInput: undefined,
		extensionEditor: undefined,
		editorContainer: {},
		keybindingsManager: undefined,
		pendingImages: [] as ImageContent[],

		// Extra methods required by setupEditorSubmitHandler
		getSlashCommandContext: () => ({}),
		handleBashCommand: async (_command: string, _excludeFromContext?: boolean) => {},
		showWarning: (_message: string) => {},
		showError: (_message: string) => {},
		updateEditorBorderColor: () => {},
		isExtensionCommand: (_text: string) => false,
		queueCompactionMessage: (_text: string, _mode: "steer" | "followUp") => {},
		updatePendingMessagesDisplay: () => {},
		flushPendingBashComponents: () => {},
		options: { submitPromptsDirectly: true },
	} satisfies InteractiveModeStateHost & Parameters<typeof setupEditorSubmitHandler>[0];

	return { host, promptCalls, historyCalls };
}

const TEST_IMAGE: ImageContent = {
	type: "image",
	data: "iVBORw0KGgo=",
	mimeType: "image/png",
};

describe("input-controller pending images", () => {
	let host: ReturnType<typeof createMockHost>["host"];
	let promptCalls: ReturnType<typeof createMockHost>["promptCalls"];

	beforeEach(() => {
		const mock = createMockHost();
		host = mock.host;
		promptCalls = mock.promptCalls;
		setupEditorSubmitHandler(host);
	});

	it("passes pending images to session.prompt on submit", async () => {
		host.pendingImages.push({ ...TEST_IMAGE });
		await host.defaultEditor.onSubmit!("describe this image");

		assert.equal(promptCalls.length, 1);
		assert.equal(promptCalls[0].text, "describe this image");
		assert.ok(promptCalls[0].options?.images);
		assert.equal(promptCalls[0].options.images.length, 1);
		assert.equal(promptCalls[0].options.images[0].mimeType, "image/png");
	});

	it("clears pending images after submit", async () => {
		host.pendingImages.push({ ...TEST_IMAGE });
		await host.defaultEditor.onSubmit!("describe this image");

		assert.equal(host.pendingImages.length, 0);
	});

	it("passes undefined images when no images are pending", async () => {
		await host.defaultEditor.onSubmit!("hello");

		assert.equal(promptCalls.length, 1);
		assert.equal(promptCalls[0].options?.images, undefined);
	});

	it("passes multiple images in order", async () => {
		const img1: ImageContent = { type: "image", data: "aaa=", mimeType: "image/png" };
		const img2: ImageContent = { type: "image", data: "bbb=", mimeType: "image/jpeg" };
		host.pendingImages.push(img1, img2);

		await host.defaultEditor.onSubmit!("describe these images");

		assert.equal(promptCalls[0].options.images.length, 2);
		assert.equal(promptCalls[0].options.images[0].data, "aaa=");
		assert.equal(promptCalls[0].options.images[1].data, "bbb=");
	});

	it("discards pending images on bash command", async () => {
		host.pendingImages.push({ ...TEST_IMAGE });
		await host.defaultEditor.onSubmit!("! ls -la");

		assert.equal(host.pendingImages.length, 0);
		assert.equal(promptCalls.length, 0); // bash commands don't go through prompt
	});
});
