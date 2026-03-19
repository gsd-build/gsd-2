/**
 * General-purpose multi-page wizard UI.
 *
 * Supports declarative page definitions with select and text fields.
 * Pages can conditionally route to different next pages based on answers.
 *
 * Navigation:
 *   ←           go back one page (on page 1: triggers exit confirmation)
 *   → / Enter   advance to next page (or submit on last page)
 *   Escape      triggers exit confirmation overlay
 *
 * Exit confirmation (shown on Escape or ← from page 1):
 *   1. Go back  — dismiss and return to current page
 *   2. Exit     — cancel the wizard, returns null to caller
 *
 * Returns:
 *   Record<pageId, Record<fieldId, string | string[]>>  on completion
 *   null                                                 on exit/cancel
 *
 * Example:
 *
 *   const result = await showWizard(ctx, {
 *     title: "New Project",
 *     pages: [
 *       {
 *         id: "mode",
 *         fields: [
 *           {
 *             type: "select",
 *             id: "start_type",
 *             question: "How do you want to start?",
 *             options: [
 *               { label: "Describe it", description: "Type what you want to build." },
 *               { label: "Provide a file", description: "Point to an existing doc." },
 *             ],
 *           },
 *         ],
 *         next: (answers) =>
 *           answers["mode"]?.["start_type"] === "Provide a file" ? "file_path" : null,
 *       },
 *       {
 *         id: "file_path",
 *         fields: [
 *           { type: "text", id: "path", label: "File path", placeholder: "/path/to/doc.md" },
 *         ],
 *         next: () => null,
 *       },
 *     ],
 *   });
 *
 *   if (!result) return; // user exited
 *   const startType = result["mode"]["start_type"]; // "Describe it" | "Provide a file"
 *   const filePath  = result["file_path"]?.["path"];
 */

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { type Theme } from "@gsd/pi-coding-agent";
import {
	Editor,
	Key,
	matchesKey,
	truncateToWidth,
	type TUI,
} from "@gsd/pi-tui";
import { makeUI } from "./ui.js";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WizardOption {
	label: string;
	description: string;
}

export interface SelectField {
	type: "select";
	id: string;
	question: string;
	options: WizardOption[];
	/** Allow multiple selections. Default: false. */
	allowMultiple?: boolean;
}

export interface TextField {
	type: "text";
	id: string;
	label: string;
	placeholder?: string;
}

export type WizardField = SelectField | TextField;

/** Answers collected so far: pageId → fieldId → value */
export type WizardAnswers = Record<string, Record<string, string | string[]>>;

export interface WizardPage {
	id: string;
	/** Optional subtitle shown below the wizard title for this page. */
	subtitle?: string;
	fields: WizardField[];
	/**
	 * Return the id of the next page, or null to end the wizard.
	 * Called with all answers collected so far when the user advances.
	 * If omitted, the wizard ends after this page.
	 */
	next?: (answers: WizardAnswers) => string | null;
}

export interface WizardOptions {
	/** Title shown at the top of every page. */
	title: string;
	/** Ordered page definitions. Pages are navigated in order unless next() routes elsewhere. */
	pages: WizardPage[];
}

// ─── Internal state ───────────────────────────────────────────────────────────

interface SelectState {
	cursorIndex: number;
	/** Single-select: committed option index, null if not yet chosen */
	committedIndex: number | null;
	/** Multi-select: which indices are checked */
	checkedIndices: Set<number>;
}

interface PageState {
	selectStates: Map<string, SelectState>;
	textValues: Map<string, string>;
	/** Which field is focused (for text fields) */
	focusedFieldId: string | null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Show a multi-page wizard and return collected answers, or null if the user exits.
 */
export async function showWizard(
	ctx: ExtensionCommandContext,
	opts: WizardOptions,
): Promise<WizardAnswers | null> {
	const pageMap = new Map<string, WizardPage>(opts.pages.map((p) => [p.id, p]));

	return ctx.ui.custom<WizardAnswers | null>((tui: TUI, theme: Theme, _kb, done) => {
		// ── State ──────────────────────────────────────────────────────────────

		/** Stack of page ids visited — drives back navigation */
		const pageStack: string[] = [opts.pages[0].id];
		const pageStates = new Map<string, PageState>();
		/** Collected answers across all pages */
		const answers: WizardAnswers = {};
		/** Whether the exit-confirmation overlay is showing */
		let showingExitConfirm = false;
		/** Cursor in the exit-confirm overlay: 0 = go back, 1 = exit */
		let exitCursor = 0;

		let cachedLines: string[] | undefined;

		// Editors keyed by fieldId — one per text field
		// editorTheme is derived from the design system at first render
		const editors = new Map<string, Editor>();
		let resolvedEditorTheme: import("@gsd/pi-tui").EditorTheme | null = null;

		function getEditor(fieldId: string): Editor {
			if (!resolvedEditorTheme) resolvedEditorTheme = makeUI(theme, 80).editorTheme;
			if (!editors.has(fieldId)) editors.set(fieldId, new Editor(tui, resolvedEditorTheme));
			return editors.get(fieldId)!;
		}

		// ── Page state helpers ─────────────────────────────────────────────────

		function getPageState(pageId: string): PageState {
			if (!pageStates.has(pageId)) {
				pageStates.set(pageId, {
					selectStates: new Map(),
					textValues: new Map(),
					focusedFieldId: null,
				});
			}
			return pageStates.get(pageId)!;
		}

		function getSelectState(pageId: string, fieldId: string, _optCount: number): SelectState {
			const ps = getPageState(pageId);
			if (!ps.selectStates.has(fieldId)) {
				ps.selectStates.set(fieldId, {
					cursorIndex: 0,
					committedIndex: null, // nothing pre-committed — user must explicitly confirm
					checkedIndices: new Set(),
				});
			}
			return ps.selectStates.get(fieldId)!;
		}

		// ── Current page ───────────────────────────────────────────────────────

		function currentPageId(): string {
			return pageStack[pageStack.length - 1];
		}

		function currentPage(): WizardPage {
			return pageMap.get(currentPageId())!;
		}

		function currentPageState(): PageState {
			return getPageState(currentPageId());
		}

		// ── Validation ─────────────────────────────────────────────────────────

		function isPageComplete(page: WizardPage, ps: PageState): boolean {
			for (const field of page.fields) {
				if (field.type === "select") {
					const ss = ps.selectStates.get(field.id);
					if (!ss) return false;
					if (field.allowMultiple) {
						if (ss.checkedIndices.size === 0) return false;
					} else {
						if (ss.committedIndex === null) return false;
					}
				} else {
					const val = ps.textValues.get(field.id) ?? "";
					if (!val.trim()) return false;
				}
			}
			return true;
		}

		// ── Collect answers for a page ─────────────────────────────────────────

		function collectPageAnswers(page: WizardPage, ps: PageState): Record<string, string | string[]> {
			const result: Record<string, string | string[]> = {};
			for (const field of page.fields) {
				if (field.type === "select") {
					const ss = ps.selectStates.get(field.id);
					if (!ss) continue;
					if (field.allowMultiple) {
						result[field.id] = Array.from(ss.checkedIndices)
							.sort((a, b) => a - b)
							.map((i) => field.options[i].label);
					} else {
						if (ss.committedIndex !== null && ss.committedIndex < field.options.length) {
							result[field.id] = field.options[ss.committedIndex].label;
						}
					}
				} else {
					result[field.id] = ps.textValues.get(field.id) ?? "";
				}
			}
			return result;
		}

		// ── Auto-focus helper ──────────────────────────────────────────────────

		/** If a page's first field is a text field, focus it immediately on arrival. */
		function autoFocusPageIfText(pageId: string) {
			const page = pageMap.get(pageId);
			if (!page) return;
			const firstField = page.fields[0];
			if (firstField?.type === "text") {
				const ps = getPageState(pageId);
				ps.focusedFieldId = firstField.id;
				const editor = getEditor(firstField.id);
				editor.setText(ps.textValues.get(firstField.id) ?? "");
			}
		}

		// Auto-focus the first page if it starts with a text field
		autoFocusPageIfText(opts.pages[0].id);

		// ── Navigation ─────────────────────────────────────────────────────────

		function advance() {
			const page = currentPage();
			const ps = currentPageState();
			if (!isPageComplete(page, ps)) {
				refresh();
				return;
			}

			// Save text field values from editors
			for (const field of page.fields) {
				if (field.type === "text") {
					ps.textValues.set(field.id, getEditor(field.id).getText().trim());
				}
			}

			// Collect answers for this page
			answers[page.id] = collectPageAnswers(page, ps);

			// Route to next page
			const nextId = page.next ? page.next(answers) : null;
			if (!nextId) {
				// End of wizard
				done(answers);
				return;
			}

			const nextPage = pageMap.get(nextId);
			if (!nextPage) {
				done(answers);
				return;
			}

			pageStack.push(nextId);
			autoFocusPageIfText(nextId);
			refresh();
		}

		function goBack() {
			if (pageStack.length <= 1) {
				// Already at first page — Esc here means exit
				showingExitConfirm = true;
				exitCursor = 0;
				refresh();
				return;
			}
			pageStack.pop();
			autoFocusPageIfText(currentPageId());
			refresh();
		}

		function refresh() {
			cachedLines = undefined;
			tui.requestRender();
		}

		// ── Input handler ──────────────────────────────────────────────────────

		function handleInput(data: string) {
			// ── Exit confirm overlay ─────────────────────────────────────────
			if (showingExitConfirm) {
				if (matchesKey(data, Key.up)) { exitCursor = 0; refresh(); return; }
				if (matchesKey(data, Key.down)) { exitCursor = 1; refresh(); return; }
				if (data === "1") { showingExitConfirm = false; refresh(); return; }
				if (data === "2") { done(null); return; }
				if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
					if (exitCursor === 0) { showingExitConfirm = false; refresh(); }
					else { done(null); }
					return;
				}
				// Esc on the confirm screen = go back (dismiss confirm)
				if (matchesKey(data, Key.escape)) { showingExitConfirm = false; refresh(); return; }
				return;
			}

			// ── Text field focus ─────────────────────────────────────────────
			const ps = currentPageState();
			if (ps.focusedFieldId) {
				const editor = getEditor(ps.focusedFieldId);
				if (matchesKey(data, Key.escape)) {
					// First Esc: unfocus the text field
					ps.textValues.set(ps.focusedFieldId, editor.getText().trim());
					ps.focusedFieldId = null;
					refresh();
					return;
				}
				if (matchesKey(data, Key.enter)) {
					ps.textValues.set(ps.focusedFieldId, editor.getText().trim());
					ps.focusedFieldId = null;
					advance();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}

			// ── Esc with no text field focused: go back (or exit if on page 1) ──
			if (matchesKey(data, Key.escape)) { goBack(); return; }

			// ── Enter / → to advance ─────────────────────────────────────────
			if (matchesKey(data, Key.enter) || matchesKey(data, Key.right)) {
				// For single-select fields, commit cursor before advancing
				const page = currentPage();
				for (const field of page.fields) {
					if (field.type === "select" && !field.allowMultiple) {
						const ss = getSelectState(currentPageId(), field.id, field.options.length);
						if (ss.committedIndex === null) ss.committedIndex = ss.cursorIndex;
					}
				}
				advance();
				return;
			}

			// ── Select field interactions ────────────────────────────────────
			const page = currentPage();
			for (const field of page.fields) {
				if (field.type !== "select") continue;
				const ss = getSelectState(currentPageId(), field.id, field.options.length);
				const totalOpts = field.options.length;

				if (matchesKey(data, Key.up)) {
					ss.cursorIndex = (ss.cursorIndex - 1 + totalOpts) % totalOpts;
					refresh(); return;
				}
				if (matchesKey(data, Key.down)) {
					ss.cursorIndex = (ss.cursorIndex + 1) % totalOpts;
					refresh(); return;
				}

				if (field.allowMultiple) {
					if (matchesKey(data, Key.space)) {
						if (ss.checkedIndices.has(ss.cursorIndex)) ss.checkedIndices.delete(ss.cursorIndex);
						else ss.checkedIndices.add(ss.cursorIndex);
						refresh(); return;
					}
				} else {
					// Numeric shortcut: press the number to select and immediately advance
					if (data.length === 1 && data >= "1" && data <= "9") {
						const idx = parseInt(data, 10) - 1;
						if (idx < totalOpts) {
							ss.cursorIndex = idx;
							ss.committedIndex = idx;
							advance();
							return;
						}
					}
					// Enter/Space commit cursor and advance (Enter handled above, Space here)
					if (matchesKey(data, Key.space)) {
						ss.committedIndex = ss.cursorIndex;
						advance();
						return;
					}
				}
				// Only handle the first select field for nav
				break;
			}
		}

		// ── Render ─────────────────────────────────────────────────────────────

		function renderExitConfirm(width: number): string[] {
			const ui = makeUI(theme, width);
			const lines: string[] = [];
			const push = (...rows: string[][]) => { for (const r of rows) lines.push(...r); };

			push(
				ui.bar(), ui.blank(),
				ui.header("  Exit wizard?"),
				ui.blank(),
				ui.subtitle("  Your progress will be lost."),
				ui.blank(),
			);

			if (exitCursor === 0) push(ui.actionSelected(1, "Go back", "Return to where you were."));
			else push(ui.actionUnselected(1, "Go back", "Return to where you were."));
			push(ui.blank());
			if (exitCursor === 1) push(ui.actionSelected(2, "Exit", "Cancel and discard all answers."));
			else push(ui.actionUnselected(2, "Exit", "Cancel and discard all answers."));
			push(
				ui.blank(),
				ui.hints(["↑/↓ to choose", "1/2 to quick-select", "enter to confirm"]),
				ui.bar(),
			);
			return lines;
		}

		function renderSelectField(ui: ReturnType<typeof makeUI>, field: SelectField, lines: string[]) {
			const push = (...rows: string[][]) => { for (const r of rows) lines.push(...r); };
			const ss = getSelectState(currentPageId(), field.id, field.options.length);
			const multi = !!field.allowMultiple;

			push(ui.question(`  ${field.question}`));
			if (multi) push(ui.meta("  (select all that apply — space to toggle, enter to confirm)"));
			push(ui.blank());

			for (let i = 0; i < field.options.length; i++) {
				const opt = field.options[i];
				const isCursor = i === ss.cursorIndex;
				const isCommitted = i === ss.committedIndex;

				if (multi) {
					const isChecked = ss.checkedIndices.has(i);
					if (isCursor) push(ui.checkboxSelected(opt.label, opt.description, isChecked));
					else push(ui.checkboxUnselected(opt.label, opt.description, isChecked));
				} else {
					if (isCursor) push(ui.optionSelected(i + 1, opt.label, opt.description, isCommitted));
					else push(ui.optionUnselected(i + 1, opt.label, opt.description, { isCommitted }));
				}
			}
		}

		function renderTextField(ui: ReturnType<typeof makeUI>, field: TextField, ps: PageState, lines: string[], width: number) {
			const push = (...rows: string[][]) => { for (const r of rows) lines.push(...r); };
			const isFocused = ps.focusedFieldId === field.id;
			const value = isFocused ? getEditor(field.id).getText() : (ps.textValues.get(field.id) ?? "");

			push(ui.question(`  ${field.label}`), ui.blank());

			if (isFocused) {
				for (const line of getEditor(field.id).render(width - 2)) lines.push(truncateToWidth(` ${line}`, width));
			} else if (value) {
				push(ui.answer(`  ${value}`));
			} else if (field.placeholder) {
				push(ui.meta(`  ${field.placeholder}`));
			}
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			if (showingExitConfirm) { cachedLines = renderExitConfirm(width); return cachedLines; }

			const ui = makeUI(theme, width);
			const lines: string[] = [];
			const push = (...rows: string[][]) => { for (const r of rows) lines.push(...r); };

			push(ui.bar(), ui.header(`  ${opts.title}`));

			// ── Page indicator ────────────────────────────────────────────────
			if (opts.pages.length > 1) {
				push(ui.pageDots(opts.pages.length, pageStack.length - 1));
			}

			// ── Page content ──────────────────────────────────────────────────
			const page = currentPage();
			const ps = currentPageState();

			if (page.subtitle) { push(ui.blank(), ui.subtitle(`  ${page.subtitle}`)); }
			push(ui.blank());

			for (const field of page.fields) {
				if (field.type === "select") renderSelectField(ui, field, lines);
				else renderTextField(ui, field, ps, lines, width);
				push(ui.blank());
			}

			// ── Footer hints ──────────────────────────────────────────────────
			const isFirst = pageStack.length === 1;
			const ps2 = currentPageState();
			const hints: string[] = [];
			if (ps2.focusedFieldId) {
				hints.push("enter to continue");
				hints.push("esc to unfocus");
			} else {
				hints.push("↑/↓ to move");
				hints.push("enter to select");
				hints.push(!isFirst ? "esc to go back" : "esc to exit");
			}
			push(ui.hints(hints), ui.bar());

			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate: () => { cachedLines = undefined; },
			handleInput,
		};
	});
}
