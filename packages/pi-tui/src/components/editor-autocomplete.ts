import type { AutocompleteProvider, CombinedAutocompleteProvider } from "../autocomplete.js";
import type { TUI } from "../tui.js";
import { SelectList, type SelectListTheme } from "./select-list.js";

/**
 * Manages autocomplete state and lifecycle for the Editor.
 *
 * Handles suggestion triggering, debouncing, updating, and cancellation.
 * The Editor delegates autocomplete concerns to this controller and queries
 * it for state during rendering and input handling.
 */
export class EditorAutocomplete {
	private provider?: AutocompleteProvider;
	private list?: SelectList;
	private state: "regular" | "force" | null = null;
	private prefix: string = "";
	private maxVisible: number = 5;

	// Debounce for @ file autocomplete to prevent blocking the event loop
	// with synchronous fuzzyFind calls on every keystroke
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private lastLookupPrefix: string | null = null;
	private static readonly DEBOUNCE_MS = 150;

	private tui: TUI;
	private selectListTheme: SelectListTheme;

	constructor(tui: TUI, selectListTheme: SelectListTheme, maxVisible: number) {
		this.tui = tui;
		this.selectListTheme = selectListTheme;
		this.maxVisible = Number.isFinite(maxVisible) ? Math.max(3, Math.min(20, Math.floor(maxVisible))) : 5;
	}

	getMaxVisible(): number {
		return this.maxVisible;
	}

	setMaxVisible(maxVisible: number): void {
		this.maxVisible = Number.isFinite(maxVisible) ? Math.max(3, Math.min(20, Math.floor(maxVisible))) : 5;
	}

	setProvider(provider: AutocompleteProvider): void {
		this.provider = provider;
	}

	getProvider(): AutocompleteProvider | undefined {
		return this.provider;
	}

	isActive(): boolean {
		return this.state !== null;
	}

	getState(): "regular" | "force" | null {
		return this.state;
	}

	getList(): SelectList | undefined {
		return this.list;
	}

	getPrefix(): string {
		return this.prefix;
	}

	/**
	 * Handle up/down arrow input for the autocomplete list.
	 */
	handleListInput(data: string): void {
		this.list?.handleInput(data);
	}

	/**
	 * Get the currently selected autocomplete item.
	 */
	getSelectedItem(): { value: string; label: string } | undefined {
		return this.list?.getSelectedItem() ?? undefined;
	}

	/**
	 * Try to trigger autocomplete suggestions at the given cursor position.
	 */
	tryTrigger(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		explicitTab: boolean = false,
	): void {
		if (!this.provider) return;

		// Check if we should trigger file completion on Tab
		if (explicitTab) {
			const provider = this.provider as CombinedAutocompleteProvider;
			const shouldTrigger =
				!provider.shouldTriggerFileCompletion ||
				provider.shouldTriggerFileCompletion(lines, cursorLine, cursorCol);
			if (!shouldTrigger) {
				return;
			}
		}

		const suggestions = this.provider.getSuggestions(lines, cursorLine, cursorCol);

		if (suggestions && suggestions.items.length > 0) {
			this.prefix = suggestions.prefix;
			this.list = new SelectList(suggestions.items, this.maxVisible, this.selectListTheme);

			const bestMatchIndex = this.getBestMatchIndex(suggestions.items, suggestions.prefix);
			if (bestMatchIndex >= 0) {
				this.list.setSelectedIndex(bestMatchIndex);
			}

			this.state = "regular";
		} else {
			this.cancel();
		}
	}

	/**
	 * Debounced version of tryTrigger for @ file reference context.
	 * Prevents synchronous fuzzyFind calls from blocking the event loop on every keystroke.
	 */
	debouncedTrigger(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
	): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		// Capture args so the timeout callback uses the correct cursor state
		const capturedLines = lines;
		const capturedLine = cursorLine;
		const capturedCol = cursorCol;

		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			this.tryTrigger(capturedLines, capturedLine, capturedCol);
			this.tui.requestRender();
		}, EditorAutocomplete.DEBOUNCE_MS);
	}

	/**
	 * Force file autocomplete (Tab-triggered, uses getForceFileSuggestions).
	 * Returns completion result if a single suggestion was auto-applied, otherwise null.
	 */
	forceFile(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		explicitTab: boolean = false,
	): { lines: string[]; cursorLine: number; cursorCol: number } | null {
		if (!this.provider) return null;

		// Check if provider supports force file suggestions via runtime check
		const provider = this.provider as {
			getForceFileSuggestions?: CombinedAutocompleteProvider["getForceFileSuggestions"];
		};
		if (typeof provider.getForceFileSuggestions !== "function") {
			this.tryTrigger(lines, cursorLine, cursorCol, true);
			return null;
		}

		const suggestions = provider.getForceFileSuggestions(lines, cursorLine, cursorCol);

		if (suggestions && suggestions.items.length > 0) {
			// If there's exactly one suggestion, apply it immediately
			if (explicitTab && suggestions.items.length === 1) {
				const item = suggestions.items[0]!;
				const result = this.provider.applyCompletion(
					lines,
					cursorLine,
					cursorCol,
					item,
					suggestions.prefix,
				);
				return result;
			}

			this.prefix = suggestions.prefix;
			this.list = new SelectList(suggestions.items, this.maxVisible, this.selectListTheme);

			const bestMatchIndex = this.getBestMatchIndex(suggestions.items, suggestions.prefix);
			if (bestMatchIndex >= 0) {
				this.list.setSelectedIndex(bestMatchIndex);
			}

			this.state = "force";
		} else {
			this.cancel();
		}

		return null;
	}

	/**
	 * Apply the selected completion item. Returns the new cursor state.
	 */
	applySelected(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
	): { lines: string[]; cursorLine: number; cursorCol: number } | null {
		const selected = this.list?.getSelectedItem();
		if (!selected || !this.provider) return null;

		return this.provider.applyCompletion(lines, cursorLine, cursorCol, selected, this.prefix);
	}

	/**
	 * Cancel autocomplete and clear all related state.
	 */
	cancel(): void {
		this.state = null;
		this.list = undefined;
		this.prefix = "";
		this.clearDebounce();
	}

	/**
	 * Update autocomplete suggestions based on current cursor position.
	 */
	update(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
	): void {
		if (!this.state || !this.provider) return;

		if (this.state === "force") {
			this.forceFile(lines, cursorLine, cursorCol);
			return;
		}

		// Check if we're in an @ file reference context — these trigger expensive
		// synchronous fuzzyFind calls that block the event loop. Debounce them.
		const currentLine = lines[cursorLine] || "";
		const textBeforeCursor = currentLine.slice(0, cursorCol);
		if (this.prefix.startsWith("@") || textBeforeCursor.match(/(?:^|[\s])@[^\s]*$/)) {
			this.debouncedUpdateSuggestions(lines, cursorLine, cursorCol);
			return;
		}

		this.applySuggestions(lines, cursorLine, cursorCol);
	}

	/**
	 * Clean up timers. Call when the editor is disposed.
	 */
	dispose(): void {
		this.clearDebounce();
	}

	private clearDebounce(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.lastLookupPrefix = null;
	}

	private debouncedUpdateSuggestions(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
	): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		const capturedLines = lines;
		const capturedLine = cursorLine;
		const capturedCol = cursorCol;

		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			// Guard: autocomplete may have been cancelled during debounce wait
			if (!this.state || !this.provider) return;
			this.applySuggestions(capturedLines, capturedLine, capturedCol);
			this.tui.requestRender();
		}, EditorAutocomplete.DEBOUNCE_MS);
	}

	private applySuggestions(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
	): void {
		if (!this.provider) return;

		const suggestions = this.provider.getSuggestions(lines, cursorLine, cursorCol);
		if (suggestions && suggestions.items.length > 0) {
			this.prefix = suggestions.prefix;
			this.list = new SelectList(suggestions.items, this.maxVisible, this.selectListTheme);

			const bestMatchIndex = this.getBestMatchIndex(suggestions.items, suggestions.prefix);
			if (bestMatchIndex >= 0) {
				this.list.setSelectedIndex(bestMatchIndex);
			}
		} else {
			this.cancel();
		}
	}

	/**
	 * Find the best autocomplete item index for the given prefix.
	 * Returns -1 if no match is found.
	 *
	 * Match priority:
	 * 1. Exact match (prefix === item.value) -> always selected
	 * 2. Prefix match -> first item whose value starts with prefix
	 * 3. No match -> -1 (keep default highlight)
	 */
	private getBestMatchIndex(items: Array<{ value: string; label: string }>, prefix: string): number {
		if (!prefix) return -1;

		let firstPrefixIndex = -1;

		for (let i = 0; i < items.length; i++) {
			const value = items[i]!.value;
			if (value === prefix) {
				return i; // Exact match always wins
			}
			if (firstPrefixIndex === -1 && value.startsWith(prefix)) {
				firstPrefixIndex = i;
			}
		}

		return firstPrefixIndex;
	}
}
