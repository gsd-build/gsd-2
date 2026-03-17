/**
 * Barrel file for the shared UI utilities module.
 *
 * Re-exports the public API from every utility file so consumers can
 * import from a single path: `import { makeUI, formatDuration } from "../shared/index.js";`
 */

// ─── ui.ts ───────────────────────────────────────────────────────────────────
export { GLYPH, STATUS_COLOR, STATUS_GLYPH, INDENT, makeUI } from './ui.js';
export type { ProgressStatus, UI } from './ui.js';

// ─── interview-ui.ts ─────────────────────────────────────────────────────────
export { showWrapUpScreen, showInterviewRound } from './interview-ui.js';
export type {
	QuestionOption,
	Question,
	RoundResult,
	WrapUpResult,
	InterviewRoundOptions,
	WrapUpOptions,
} from './interview-ui.js';

// ─── progress-widget.ts ──────────────────────────────────────────────────────
export { createProgressPanel } from './progress-widget.js';
export type {
	ProgressItemStatus,
	ProgressItem,
	ProgressPanelModel,
	ProgressPanelOptions,
	ProgressPanel,
} from './progress-widget.js';

// ─── wizard-ui.ts ────────────────────────────────────────────────────────────
export { showWizard } from './wizard-ui.js';
export type {
	WizardOption,
	SelectField,
	TextField,
	WizardField,
	WizardAnswers,
	WizardPage,
	WizardOptions,
} from './wizard-ui.js';

// ─── confirm-ui.ts ───────────────────────────────────────────────────────────
export { showConfirm } from './confirm-ui.js';
export type { ConfirmOptions } from './confirm-ui.js';

// ─── thinking-widget.ts ──────────────────────────────────────────────────────
export { showThinkingWidget } from './thinking-widget.js';
export type { ThinkingWidget } from './thinking-widget.js';

// ─── next-action-ui.ts ───────────────────────────────────────────────────────
export { showNextAction } from './next-action-ui.js';
export type { NextAction, NextActionOptions } from './next-action-ui.js';

// ─── format-utils.ts ─────────────────────────────────────────────────────────
export {
	formatDuration,
	formatTokenCount,
	padRight,
	joinColumns,
	centerLine,
	fitColumns,
	sparkline,
	stripAnsi,
} from './format-utils.js';

// ─── path-display.ts ─────────────────────────────────────────────────────────
export { toPosixPath } from './path-display.js';

// ─── terminal.ts ─────────────────────────────────────────────────────────────
export { supportsCtrlAltShortcuts, shortcutDesc } from './terminal.js';
