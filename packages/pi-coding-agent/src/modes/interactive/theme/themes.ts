// Project/App: GSD-2
// File Purpose: Built-in terminal theme definitions for interactive TUI rendering.
/**
 * Built-in theme definitions.
 *
 * Each theme is a self-contained record of color values. Variable references
 * (e.g. "accent") are resolved against the `vars` map at load time by the
 * theme engine in theme.ts.
 *
 * To add a new built-in theme, add an entry to `builtinThemes` below.
 */

// Re-use the ThemeJson type from the schema module to avoid runtime cycles.
import type { ThemeJson } from "./theme-schema.js";

// ---------------------------------------------------------------------------
// Dark theme
// ---------------------------------------------------------------------------

const dark: ThemeJson = {
	name: "dark",
	vars: {
		cyan: "#7fd4e8",
		blue: "#8db7ff",
		green: "#a8c978",
		red: "#d98484",
		yellow: "#e6c06a",
		gray: "#7d889f",
		dimGray: "#4d5870",
		darkGray: "#4e596d",
		line: "#a7ba78",
		lineSoft: "#4e596d",
		textSoft: "#dce4f2",
		accent: "#8db7ff",
		selectedBg: "#1d2430",
		userMsgBg: "#232c3a",
		toolPendingBg: "#171c26",
		toolSuccessBg: "#171c26",
		toolErrorBg: "#241b22",
		customMsgBg: "#171c26",
	},
	colors: {
		accent: "accent",
		border: "line",
		borderAccent: "accent",
		borderMuted: "lineSoft",
		success: "green",
		error: "red",
		warning: "yellow",
		muted: "gray",
		dim: "dimGray",
		text: "",
		thinkingText: "gray",

		selectedBg: "selectedBg",
		userMessageBg: "userMsgBg",
		userMessageText: "textSoft",
		assistantMessageText: "textSoft",
		customMessageBg: "customMsgBg",
		customMessageText: "textSoft",
		customMessageLabel: "blue",
		toolPendingBg: "toolPendingBg",
		toolSuccessBg: "toolSuccessBg",
		toolErrorBg: "toolErrorBg",
		toolTitle: "accent",
		toolOutput: "textSoft",
		surfaceTitle: "accent",
		surfaceAccent: "accent",
		toolRunning: "accent",
		toolSuccess: "green",
		toolError: "red",

		mdHeading: "#fbbf24",
		mdLink: "#93c5fd",
		mdLinkUrl: "dimGray",
		mdCode: "accent",
		mdCodeBlock: "green",
		mdCodeBlockBorder: "lineSoft",
		mdQuote: "gray",
		mdQuoteBorder: "gray",
		mdHr: "gray",
		mdListBullet: "accent",

		toolDiffAdded: "green",
		toolDiffRemoved: "red",
		toolDiffContext: "gray",

		syntaxComment: "#7dd3a3",
		syntaxKeyword: "#60a5fa",
		syntaxFunction: "#fde68a",
		syntaxVariable: "#7dd3fc",
		syntaxString: "#fdba74",
		syntaxNumber: "#86efac",
		syntaxType: "#5eead4",
		syntaxOperator: "#d1d5db",
		syntaxPunctuation: "#d1d5db",

		thinkingOff: "darkGray",
		thinkingMinimal: "#8088a0",
		thinkingLow: "#60a5fa",
		thinkingMedium: "#2dd4bf",
		thinkingHigh: "#c084fc",
		thinkingXhigh: "#f472b6",

		bashMode: "line",
	},
	export: {
		pageBg: "#10141d",
		cardBg: "#171c26",
		infoBg: "#1d2430",
	},
};

// Matches the pre-refresh TUI palette used during the recent chat/tool-frame
// design PR series. Keep this as an explicit fallback theme so users can opt
// into the familiar look while still keeping newer high-saturation themes.
const tuiClassic: ThemeJson = {
	name: "tui-classic",
	vars: {
		cyan: "#00d7ff",
		blue: "#5f87ff",
		green: "#b5bd68",
		red: "#cc6666",
		yellow: "#e6b800",
		gray: "#808080",
		dimGray: "#666666",
		darkGray: "#505050",
		accent: "#8abeb7",
		selectedBg: "#3a3a4a",
		userMsgBg: "#343541",
		toolPendingBg: "#282832",
		toolSuccessBg: "#283228",
		toolErrorBg: "#3c2828",
		customMsgBg: "#2d2838",
	},
	colors: {
		accent: "accent",
		border: "blue",
		borderAccent: "cyan",
		borderMuted: "darkGray",
		success: "green",
		error: "red",
		warning: "yellow",
		muted: "gray",
		dim: "dimGray",
		text: "",
		thinkingText: "gray",

		selectedBg: "selectedBg",
		userMessageBg: "userMsgBg",
		userMessageText: "gray",
		assistantMessageText: "",
		customMessageBg: "customMsgBg",
		customMessageText: "",
		customMessageLabel: "#9575cd",
		toolPendingBg: "toolPendingBg",
		toolSuccessBg: "toolSuccessBg",
		toolErrorBg: "toolErrorBg",
		toolTitle: "#8a8a8a",
		toolOutput: "#6e6e6e",

		mdHeading: "#f0c674",
		mdLink: "#81a2be",
		mdLinkUrl: "dimGray",
		mdCode: "accent",
		mdCodeBlock: "green",
		mdCodeBlockBorder: "gray",
		mdQuote: "gray",
		mdQuoteBorder: "gray",
		mdHr: "gray",
		mdListBullet: "accent",

		toolDiffAdded: "green",
		toolDiffRemoved: "red",
		toolDiffContext: "gray",

		syntaxComment: "#6A9955",
		syntaxKeyword: "#569CD6",
		syntaxFunction: "#DCDCAA",
		syntaxVariable: "#9CDCFE",
		syntaxString: "#CE9178",
		syntaxNumber: "#B5CEA8",
		syntaxType: "#4EC9B0",
		syntaxOperator: "#D4D4D4",
		syntaxPunctuation: "#D4D4D4",

		thinkingOff: "darkGray",
		thinkingMinimal: "#6e6e6e",
		thinkingLow: "#5f87af",
		thinkingMedium: "#81a2be",
		thinkingHigh: "#b294bb",
		thinkingXhigh: "#d183e8",

		bashMode: "green",
	},
	export: {
		pageBg: "#18181e",
		cardBg: "#1e1e24",
		infoBg: "#3c3728",
	},
};

// ---------------------------------------------------------------------------
// Light theme
// ---------------------------------------------------------------------------

const light: ThemeJson = {
	name: "light",
	vars: {
		teal: "#0f766e",
		blue: "#2563eb",
		green: "#15803d",
		red: "#dc2626",
		yellow: "#b45309",
		warning: "#9a3412",
		mediumGray: "#4b5563",
		dimGray: "#6b7280",
		lightGray: "#cbd5e1",
		selectedBg: "#dbeafe",
		userMsgBg: "#f1f5f9",
		toolPendingBg: "#eef2ff",
		toolSuccessBg: "#ecfdf5",
		toolErrorBg: "#fff1f2",
		customMsgBg: "#f5f3ff",
	},
	colors: {
		accent: "teal",
		border: "blue",
		borderAccent: "teal",
		borderMuted: "lightGray",
		success: "green",
		error: "red",
		warning: "warning",
		muted: "mediumGray",
		dim: "dimGray",
		text: "",
		thinkingText: "mediumGray",

		selectedBg: "selectedBg",
		userMessageBg: "userMsgBg",
		userMessageText: "",
		assistantMessageText: "",
		customMessageBg: "customMsgBg",
		customMessageText: "",
		customMessageLabel: "#7c3aed",
		toolPendingBg: "toolPendingBg",
		toolSuccessBg: "toolSuccessBg",
		toolErrorBg: "toolErrorBg",
		toolTitle: "",
		toolOutput: "mediumGray",

		mdHeading: "yellow",
		mdLink: "blue",
		mdLinkUrl: "dimGray",
		mdCode: "teal",
		mdCodeBlock: "green",
		mdCodeBlockBorder: "mediumGray",
		mdQuote: "mediumGray",
		mdQuoteBorder: "mediumGray",
		mdHr: "mediumGray",
		mdListBullet: "green",

		toolDiffAdded: "green",
		toolDiffRemoved: "red",
		toolDiffContext: "mediumGray",

		syntaxComment: "#008000",
		syntaxKeyword: "#0000FF",
		syntaxFunction: "#795E26",
		syntaxVariable: "#001080",
		syntaxString: "#A31515",
		syntaxNumber: "#098658",
		syntaxType: "#267F99",
		syntaxOperator: "#000000",
		syntaxPunctuation: "#000000",

		thinkingOff: "lightGray",
		thinkingMinimal: "#767676",
		thinkingLow: "blue",
		thinkingMedium: "teal",
		thinkingHigh: "#9333ea",
		thinkingXhigh: "#be185d",

		bashMode: "green",
	},
	export: {
		pageBg: "#f8fafc",
		cardBg: "#ffffff",
		infoBg: "#fff7ed",
	},
};

const vivid: ThemeJson = {
	name: "vivid",
	vars: {
		cyan: "#22d3ee",
		blue: "#3b82f6",
		green: "#22c55e",
		red: "#f43f5e",
		yellow: "#f59e0b",
		gray: "#a5b4fc",
		dimGray: "#93a6d6",
		darkGray: "#475569",
		accent: "#14b8a6",
		selectedBg: "#1e1b4b",
		userMsgBg: "#172554",
		toolPendingBg: "#1e293b",
		toolSuccessBg: "#052e16",
		toolErrorBg: "#3f0d1f",
		customMsgBg: "#312e81",
	},
	colors: {
		accent: "accent",
		border: "blue",
		borderAccent: "cyan",
		borderMuted: "darkGray",
		success: "green",
		error: "red",
		warning: "yellow",
		muted: "gray",
		dim: "dimGray",
		text: "",
		thinkingText: "gray",

		selectedBg: "selectedBg",
		userMessageBg: "userMsgBg",
		userMessageText: "gray",
		assistantMessageText: "",
		customMessageBg: "customMsgBg",
		customMessageText: "",
		customMessageLabel: "#c084fc",
		toolPendingBg: "toolPendingBg",
		toolSuccessBg: "toolSuccessBg",
		toolErrorBg: "toolErrorBg",
		toolTitle: "#8a8a8a",
		toolOutput: "#6e6e6e",

		mdHeading: "#fbbf24",
		mdLink: "#60a5fa",
		mdLinkUrl: "dimGray",
		mdCode: "#5eead4",
		mdCodeBlock: "#86efac",
		mdCodeBlockBorder: "gray",
		mdQuote: "gray",
		mdQuoteBorder: "gray",
		mdHr: "gray",
		mdListBullet: "#2dd4bf",

		toolDiffAdded: "#22c55e",
		toolDiffRemoved: "#f43f5e",
		toolDiffContext: "gray",

		syntaxComment: "#6ee7b7",
		syntaxKeyword: "#60a5fa",
		syntaxFunction: "#fde68a",
		syntaxVariable: "#7dd3fc",
		syntaxString: "#fdba74",
		syntaxNumber: "#86efac",
		syntaxType: "#5eead4",
		syntaxOperator: "#e2e8f0",
		syntaxPunctuation: "#e2e8f0",

		thinkingOff: "darkGray",
		thinkingMinimal: "#8fa2d8",
		thinkingLow: "#38bdf8",
		thinkingMedium: "#2dd4bf",
		thinkingHigh: "#a78bfa",
		thinkingXhigh: "#f472b6",

		bashMode: "green",
	},
	export: {
		pageBg: "#0b1020",
		cardBg: "#121a30",
		infoBg: "#3b2f12",
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const builtinThemes: Record<string, ThemeJson> = {
	dark,
	light,
	"tui-classic": tuiClassic,
	vivid,
};
