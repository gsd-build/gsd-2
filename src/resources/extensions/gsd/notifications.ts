// GSD Extension — Desktop Notification Helper
// Cross-platform desktop notifications for auto-mode events.

import { execFileSync } from "node:child_process";
import type { NotificationPreferences } from "./types.js";
import { loadEffectiveGSDPreferences } from "./preferences.js";
import { CmuxClient, emitOsc777Notification, resolveCmuxConfig } from "../cmux/index.js";

export type NotifyLevel = "info" | "success" | "warning" | "error";
export type NotificationKind = "complete" | "error" | "budget" | "milestone" | "attention" | "chat_response";

interface NotificationCommand {
  file: string;
  args: string[];
}

/**
 * Send a native desktop notification. Non-blocking, non-fatal.
 * macOS: osascript, Linux: notify-send, Windows: skipped.
 */
export function sendDesktopNotification(
  title: string,
  message: string,
  level: NotifyLevel = "info",
  kind: NotificationKind = "complete",
): void {
  const loaded = loadEffectiveGSDPreferences()?.preferences;
  if (!shouldSendDesktopNotification(kind, loaded?.notifications)) return;

  const cmux = resolveCmuxConfig(loaded);
  if (cmux.notifications) {
    const delivered = CmuxClient.fromPreferences(loaded).notify(title, message);
    if (delivered) return;
    emitOsc777Notification(title, message);
  }

  try {
    const command = buildDesktopNotificationCommand(process.platform, title, message, level);
    if (!command) return;
    execFileSync(command.file, command.args, { timeout: 3000, stdio: "ignore" });
  } catch {
    // Non-fatal — desktop notifications are best-effort
  }
}

export function shouldSendDesktopNotification(
  kind: NotificationKind,
  preferences: NotificationPreferences | undefined = loadEffectiveGSDPreferences()?.preferences.notifications,
): boolean {
  if (preferences?.enabled === false) return false;

  switch (kind) {
    case "error":
      return preferences?.on_error ?? true;
    case "budget":
      return preferences?.on_budget ?? true;
    case "milestone":
      return preferences?.on_milestone ?? true;
    case "attention":
      return preferences?.on_attention ?? true;
    case "chat_response":
      return preferences?.on_chat_response ?? true;
    case "complete":
    default:
      return preferences?.on_complete ?? true;
  }
}

export function buildDesktopNotificationCommand(
  platform: NodeJS.Platform,
  title: string,
  message: string,
  level: NotifyLevel = "info",
): NotificationCommand | null {
  const normalizedTitle = normalizeNotificationText(title);
  const normalizedMessage = normalizeNotificationText(message);

  if (platform === "darwin") {
    const sound = level === "error" ? 'sound name "Basso"' : 'sound name "Glass"';
    const script = `display notification "${escapeAppleScript(normalizedMessage)}" with title "${escapeAppleScript(normalizedTitle)}" ${sound}`;
    return { file: "osascript", args: ["-e", script] };
  }

  if (platform === "linux") {
    const urgency = level === "error" ? "critical" : level === "warning" ? "normal" : "low";
    return { file: "notify-send", args: ["-u", urgency, normalizedTitle, normalizedMessage] };
  }

  return null;
}

function normalizeNotificationText(s: string): string {
  return s.replace(/\r?\n/g, " ").trim();
}

function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Check if the terminal app is currently frontmost (user is looking at it).
 * Uses TERM_PROGRAM env var to identify the terminal, then queries via AppleScript.
 * Returns true if focused (skip notification), false if not focused or unknown.
 */
export function isTerminalFocused(): boolean {
  if (process.platform !== "darwin") return false;

  const termProgram = process.env.TERM_PROGRAM;
  const bundleMap: Record<string, string> = {
    "ghostty": "com.mitchellh.ghostty",
    "iTerm.app": "com.googlecode.iterm2",
    "Apple_Terminal": "com.apple.Terminal",
    "WarpTerminal": "dev.warp.Warp-Stable",
    "vscode": "com.microsoft.VSCode",
    "Alacritty": "org.alacritty",
    "kitty": "net.kovidgoyal.kitty",
  };

  const appIdentifier = (termProgram && bundleMap[termProgram]) || termProgram;
  if (!appIdentifier) return false;

  try {
    // Use the native AppleScript name for known apps, fall back to System Events
    if (termProgram && bundleMap[termProgram]) {
      // Known app — query directly by name (more reliable than System Events)
      const appName = termProgram === "ghostty" ? "Ghostty"
        : termProgram === "iTerm.app" ? "iTerm"
        : termProgram === "Apple_Terminal" ? "Terminal"
        : termProgram;
      const result = execFileSync("osascript", [
        "-e", `tell application "${appName}" to return frontmost`,
      ], { timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      return result === "true";
    }
    return false;
  } catch {
    return false; // Can't detect — notify to be safe
  }
}

/**
 * Send a chat response notification, suppressing if the terminal is focused.
 * Used by the agent_end hook for interactive (non-auto) sessions.
 */
export function sendChatResponseNotification(title: string, message: string): void {
  if (isTerminalFocused()) return;
  sendDesktopNotification(title, message, "info", "chat_response");
}
