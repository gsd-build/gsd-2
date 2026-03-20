/**
 * Terminal capability detection for keyboard shortcut support.
 *
 * Ctrl+Alt shortcuts require the Kitty keyboard protocol or modifyOtherKeys.
 * Terminals that lack this support silently swallow the key combos.
 */

const UNSUPPORTED_TERMS = ["apple_terminal", "warpterm"];

export function isCmuxTerminal(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.CMUX_WORKSPACE_ID && env.CMUX_SURFACE_ID);
}

export function supportsCtrlAltShortcuts(): boolean {
  const term = (process.env.TERM_PROGRAM || "").toLowerCase();
  const jetbrains = (process.env.TERMINAL_EMULATOR || "").toLowerCase().includes("jetbrains");
  if (isCmuxTerminal()) return true;
  return !UNSUPPORTED_TERMS.some((t) => term.includes(t)) && !jetbrains;
}

/**
 * Returns a shortcut description that includes a slash-command fallback hint
 * when the current terminal likely can't fire Ctrl+Alt combos.
 */
export function shortcutDesc(base: string, fallbackCmd: string): string {
  if (supportsCtrlAltShortcuts()) return base;
  return `${base} — shortcut may not work in this terminal, use ${fallbackCmd}`;
}
