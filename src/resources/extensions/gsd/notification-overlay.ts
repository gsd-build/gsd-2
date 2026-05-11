// Project/App: GSD-2
// File Purpose: Notification history overlay with severity filtering and width-safe TUI rendering.

import type { Theme } from "@gsd/pi-coding-agent";
import { truncateToWidth, visibleWidth, matchesKey, Key } from "@gsd/pi-tui";

import {
  readNotifications,
  markAllRead,
  clearNotifications,
  onNotificationStoreChange,
  type NotificationEntry,
  type NotifySeverity,
} from "./notification-store.js";
import { formattedShortcutPair } from "./shortcut-defs.js";
import {
  padRightVisible,
  renderFrame,
  renderKeyHints,
  rightAlign,
  wrapVisibleText,
} from "./tui/render-kit.js";

type FilterMode = "all" | "error" | "warning" | "success" | "info";
const FILTER_CYCLE: FilterMode[] = ["all", "error", "warning", "success", "info"];
const OVERLAY_WIDTH = "58%";
const OVERLAY_MIN_WIDTH = 68;
const OVERLAY_MAX_HEIGHT_PERCENT = 52;
const OVERLAY_MARGIN = { top: 2, right: 2, bottom: 6, left: 2 } as const;

export function notificationOverlayOptions() {
  return {
    width: OVERLAY_WIDTH,
    minWidth: OVERLAY_MIN_WIDTH,
    maxHeight: `${OVERLAY_MAX_HEIGHT_PERCENT}%`,
    anchor: "top-center",
    row: "24%",
    margin: OVERLAY_MARGIN,
    backdrop: true,
  } as const;
}

function severityIcon(severity: NotifySeverity): string {
  switch (severity) {
    case "error": return "✗";
    case "warning": return "⚠";
    case "success": return "✓";
    case "info":
    default: return "●";
  }
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs < 60_000) return "just now";
    if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)}h ago`;
    return `${Math.floor(diffMs / 86400_000)}d ago`;
  } catch {
    return ts.slice(11, 19); // fallback: HH:MM:SS
  }
}

function notificationSignature(entries: readonly NotificationEntry[]): string {
  return entries
    .map((entry) => `${entry.ts}|${entry.severity}|${entry.read ? 1 : 0}|${entry.message}`)
    .join("\n");
}

export class GSDNotificationOverlay {
  private tui: { requestRender: () => void };
  private theme: Theme;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];
  private scrollOffset = 0;
  private filterIndex = 0;
  private entries: NotificationEntry[] = [];
  private entriesSignature = "";
  private refreshTimer: ReturnType<typeof setInterval>;
  private disposed = false;
  private resizeHandler: (() => void) | null = null;
  private unsubscribeStore: (() => void) | null = null;

  constructor(
    tui: { requestRender: () => void },
    theme: Theme,
    onClose: () => void,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.onClose = onClose;

    // Mark all as read on open
    markAllRead();
    this.entries = readNotifications();
    this.entriesSignature = notificationSignature(this.entries);

    // Resize handler
    this.resizeHandler = () => {
      if (this.disposed) return;
      this.invalidate();
      this.tui.requestRender();
    };
    process.stdout.on("resize", this.resizeHandler);

    // Subscribe to store mutations for immediate updates
    this.unsubscribeStore = onNotificationStoreChange(() => {
      if (this.disposed) return;
      this._refreshFromDisk();
    });

    // 30s safety-net for cross-process edits (web subprocess, parallel workers)
    this.refreshTimer = setInterval(() => {
      if (this.disposed) return;
      this._refreshFromDisk();
    }, 30_000);
  }

  private get filter(): FilterMode {
    return FILTER_CYCLE[this.filterIndex]!;
  }

  private get filteredEntries(): NotificationEntry[] {
    if (this.filter === "all") return this.entries;
    return this.entries.filter((e) => e.severity === this.filter);
  }

  handleInput(data: string): void {
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl("c")) ||
      matchesKey(data, Key.ctrlAlt("n")) ||
      matchesKey(data, Key.ctrlShift("n"))
    ) {
      this.dispose();
      this.onClose();
      return;
    }

    // Scroll
    if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
      this.scrollOffset++;
      this.invalidate();
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.invalidate();
      this.tui.requestRender();
      return;
    }
    if (data === "g") {
      this.scrollOffset = 0;
      this.invalidate();
      this.tui.requestRender();
      return;
    }
    if (data === "G") {
      this.scrollOffset = 999;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    // Filter cycle
    if (data === "f") {
      this.filterIndex = (this.filterIndex + 1) % FILTER_CYCLE.length;
      this.scrollOffset = 0;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    // Clear all
    if (data === "c") {
      clearNotifications();
      this.entries = [];
      this.entriesSignature = notificationSignature(this.entries);
      this.scrollOffset = 0;
      this.invalidate();
      this.tui.requestRender();
      return;
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const content = this.buildContentLines(width);
    const terminalRows = process.stdout.rows || 32;
    const availableRows = Math.max(1, terminalRows - OVERLAY_MARGIN.top - OVERLAY_MARGIN.bottom);
    const overlayRows = Math.min(
      availableRows,
      Math.max(1, Math.floor((terminalRows * OVERLAY_MAX_HEIGHT_PERCENT) / 100)),
    );
    const maxVisibleRows = Math.max(5, overlayRows - 2);
    const visibleContentRows = Math.min(content.length, maxVisibleRows);
    const maxScroll = Math.max(0, content.length - visibleContentRows);
    this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
    const visibleContent = content.slice(this.scrollOffset, this.scrollOffset + visibleContentRows);

    const lines = renderFrame(this.theme, visibleContent, width);

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedLines = undefined;
    this.cachedWidth = undefined;
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.refreshTimer);
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    if (this.resizeHandler) {
      process.stdout.removeListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
  }

  private _refreshFromDisk(): void {
    const fresh = readNotifications();
    const signature = notificationSignature(fresh);
    if (signature !== this.entriesSignature) {
      markAllRead();
      this.entries = readNotifications();
      this.entriesSignature = notificationSignature(this.entries);
      this.invalidate();
      this.tui.requestRender();
    }
  }

  private buildContentLines(width: number): string[] {
    const th = this.theme;
    const shellWidth = Math.max(1, width - 4);
    const contentWidth = shellWidth;
    const lines: string[] = [];

    const row = (content = ""): string => {
      const truncated = truncateToWidth(content, contentWidth);
      return padRightVisible(truncated, contentWidth);
    };
    const blank = () => row("");
    const hr = () => row(th.fg("dim", "─".repeat(contentWidth)));

    // Header
    const title = th.fg("accent", th.bold("Notifications"));
    const filterLabel = this.filter === "all"
      ? th.fg("dim", "all")
      : th.fg(
        this.filter === "error" ? "error"
          : this.filter === "warning" ? "warning"
            : this.filter === "success" ? "success"
              : "dim",
        this.filter,
      );
    const count = `${this.filteredEntries.length} entries`;
    lines.push(row(rightAlign(
      `${title}  ${th.fg("dim", "filter:")} ${filterLabel}`,
      th.fg("dim", count),
      contentWidth,
    )));
    lines.push(hr());

    // Controls
    const closeShortcut = formattedShortcutPair("notifications");
    lines.push(row(renderKeyHints(th, ["↑/↓ scroll", "f filter", "c clear", `Esc/${closeShortcut} close`], contentWidth)));
    lines.push(blank());

    // Entries
    const filtered = this.filteredEntries;
    if (filtered.length === 0) {
      lines.push(blank());
      lines.push(row(th.fg("dim", this.entries.length === 0
        ? "No notifications yet."
        : `No ${this.filter} notifications.`)));
      lines.push(blank());
      return lines;
    }

    for (const entry of filtered) {
      const icon = severityIcon(entry.severity);
      const coloredIcon = entry.severity === "error" ? th.fg("error", icon)
        : entry.severity === "warning" ? th.fg("warning", icon)
          : entry.severity === "success" ? th.fg("success", icon)
            : th.fg("dim", icon);
      const time = th.fg("dim", formatTimestamp(entry.ts));
      const source = entry.source === "workflow-logger" ? th.fg("dim", " [engine]") : "";

      // Measure actual prefix width for wrapping
      const prefix = `${coloredIcon} ${time}${source}  `;
      const prefixWidth = visibleWidth(prefix);
      const msgMaxWidth = Math.max(10, contentWidth - prefixWidth);

      // Wrap long messages onto continuation lines indented to align with message start
      const msgLines = wrapVisibleText(entry.message, msgMaxWidth);
      const indent = " ".repeat(prefixWidth);
      for (let i = 0; i < msgLines.length; i++) {
        if (i === 0) {
          lines.push(row(`${prefix}${msgLines[i]}`));
        } else {
          lines.push(row(`${indent}${msgLines[i]}`));
        }
      }
    }

    return lines;
  }
}
