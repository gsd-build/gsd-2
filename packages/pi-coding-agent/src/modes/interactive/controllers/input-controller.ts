import type { ImageContent } from "@gsd/pi-ai";
import { dispatchSlashCommand } from "../slash-command-handlers.js";
import type { InteractiveModeStateHost } from "../interactive-mode-state.js";

/**
 * Consume and clear any pending pasted images from the host.
 * Returns undefined if there are no pending images.
 */
function consumePendingImages(host: InteractiveModeStateHost): ImageContent[] | undefined {
	if (host.pendingImages.length === 0) return undefined;
	const images = [...host.pendingImages];
	host.pendingImages.length = 0;
	return images;
}

export function setupEditorSubmitHandler(host: InteractiveModeStateHost & {
	getSlashCommandContext: () => any;
	handleBashCommand: (command: string, excludeFromContext?: boolean) => Promise<void>;
	showWarning: (message: string) => void;
	showError: (message: string) => void;
	updateEditorBorderColor: () => void;
	isExtensionCommand: (text: string) => boolean;
	queueCompactionMessage: (text: string, mode: "steer" | "followUp") => void;
	updatePendingMessagesDisplay: () => void;
	flushPendingBashComponents: () => void;
	options?: { submitPromptsDirectly?: boolean };
}): void {
	host.defaultEditor.onSubmit = async (text: string) => {
		text = text.trim();
		if (!text) return;

		if (text.startsWith("/")) {
			const handled = await dispatchSlashCommand(text, host.getSlashCommandContext());
			if (handled) {
				host.editor.setText("");
				consumePendingImages(host); // discard images on slash command
				return;
			}
		}

		if (text.startsWith("!")) {
			const isExcluded = text.startsWith("!!");
			const command = isExcluded ? text.slice(2).trim() : text.slice(1).trim();
			if (command) {
				if (host.session.isBashRunning) {
					host.showWarning("A bash command is already running. Press Esc to cancel it first.");
					host.editor.setText(text);
					return;
				}
				host.editor.addToHistory?.(text);
				await host.handleBashCommand(command, isExcluded);
				host.isBashMode = false;
				host.updateEditorBorderColor();
				consumePendingImages(host); // discard images on bash command
				return;
			}
		}

		// Consume pending images for prompt submissions
		const images = consumePendingImages(host);

		if (host.session.isCompacting) {
			if (host.isExtensionCommand(text)) {
				host.editor.addToHistory?.(text);
				host.editor.setText("");
				await host.session.prompt(text, { images });
			} else {
				host.queueCompactionMessage(text, "steer");
			}
			return;
		}

		if (host.session.isStreaming) {
			host.editor.addToHistory?.(text);
			host.editor.setText("");
			await host.session.prompt(text, { streamingBehavior: "steer", images });
			host.updatePendingMessagesDisplay();
			host.ui.requestRender();
			return;
		}

		host.flushPendingBashComponents();

		if (host.onInputCallback) {
			host.onInputCallback(text);
			host.editor.addToHistory?.(text);
			return;
		}

		if (host.options?.submitPromptsDirectly) {
			host.editor.addToHistory?.(text);
			try {
				await host.session.prompt(text, { images });
			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
				host.showError(errorMessage);
			}
			return;
		}

		host.editor.addToHistory?.(text);
	};
}
