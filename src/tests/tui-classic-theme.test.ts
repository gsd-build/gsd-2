// GSD2 TUI Tests - Built-in terminal theme palette coverage.
import test from "node:test";
import assert from "node:assert/strict";

const { builtinThemes } = await import("../../packages/pi-coding-agent/src/modes/interactive/theme/themes.ts");

test("tui-classic built-in theme preserves legacy PR palette tokens", () => {
  assert.ok("tui-classic" in builtinThemes, "tui-classic should be available as a built-in theme");
  const theme = builtinThemes["tui-classic"];

  assert.equal(theme.vars?.accent, "#8abeb7");
  assert.equal(theme.vars?.cyan, "#00d7ff");
  assert.equal(theme.colors.warning, "yellow");
	assert.equal(theme.colors.toolPendingBg, "toolPendingBg");
});

test("dark built-in theme uses the terminal card prototype palette", () => {
	assert.ok("dark" in builtinThemes, "dark should be available as a built-in theme");
	const theme = builtinThemes.dark;

	assert.equal(theme.vars?.accent, "#8db7ff");
	assert.equal(theme.vars?.line, "#a7ba78");
	assert.equal(theme.vars?.userMsgBg, "#232c3a");
	assert.equal(theme.vars?.toolPendingBg, "#171c26");
	assert.equal(theme.vars?.toolSuccessBg, "#171c26");
	assert.equal(theme.vars?.toolErrorBg, "#241b22");
	assert.equal(theme.colors.border, "line");
	assert.equal(theme.colors.borderAccent, "accent");
	assert.equal(theme.colors.toolRunning, "accent");
	assert.equal(theme.colors.toolSuccess, "green");
	assert.equal(theme.colors.toolError, "red");
});
