import type { Theme } from "@gsd/pi-coding-agent";
import { truncateToWidth, visibleWidth, matchesKey, Key } from "@gsd/pi-tui";
import { loadVisualizerData, type VisualizerData } from "./visualizer-data.js";
import {
  renderProgressView,
  renderDepsView,
  renderMetricsView,
  renderTimelineView,
} from "./visualizer-views.js";

const TAB_LABELS = ["1 Progress", "2 Deps", "3 Metrics", "4 Timeline"];

export class GSDVisualizerOverlay {
  private tui: { requestRender: () => void };
  private theme: Theme;
  private onClose: () => void;

  activeTab = 0;
  scrollOffsets: number[] = [0, 0, 0, 0];
  loading = true;
  disposed = false;
  cachedWidth?: number;
  cachedLines?: string[];
  refreshTimer: ReturnType<typeof setInterval>;
  data: VisualizerData | null = null;
  basePath: string;

  constructor(
    tui: { requestRender: () => void },
    theme: Theme,
    onClose: () => void,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.onClose = onClose;
    this.basePath = process.cwd();

    loadVisualizerData(this.basePath).then((d) => {
      this.data = d;
      this.loading = false;
      this.tui.requestRender();
    });

    this.refreshTimer = setInterval(() => {
      loadVisualizerData(this.basePath).then((d) => {
        if (this.disposed) return;
        this.data = d;
        this.invalidate();
        this.tui.requestRender();
      });
    }, 2000);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.dispose();
      this.onClose();
      return;
    }

    if (matchesKey(data, Key.tab)) {
      this.activeTab = (this.activeTab + 1) % 4;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (data === "1" || data === "2" || data === "3" || data === "4") {
      this.activeTab = parseInt(data, 10) - 1;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
      this.scrollOffsets[this.activeTab]++;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
      this.scrollOffsets[this.activeTab] = Math.max(0, this.scrollOffsets[this.activeTab] - 1);
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (data === "g") {
      this.scrollOffsets[this.activeTab] = 0;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (data === "G") {
      this.scrollOffsets[this.activeTab] = 999;
      this.invalidate();
      this.tui.requestRender();
      return;
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const th = this.theme;
    const innerWidth = width - 4;
    const content: string[] = [];

    // Tab bar
    const tabs = TAB_LABELS.map((label, i) => {
      if (i === this.activeTab) {
        return th.fg("accent", `[${label}]`);
      }
      return th.fg("dim", `[${label}]`);
    });
    content.push(" " + tabs.join("  "));
    content.push("");

    if (this.loading) {
      const loadingText = "Loading…";
      const vis = visibleWidth(loadingText);
      const leftPad = Math.max(0, Math.floor((innerWidth - vis) / 2));
      content.push(" ".repeat(leftPad) + loadingText);
    } else if (this.data) {
      let viewLines: string[] = [];
      switch (this.activeTab) {
        case 0:
          viewLines = renderProgressView(this.data, th, innerWidth);
          break;
        case 1:
          viewLines = renderDepsView(this.data, th, innerWidth);
          break;
        case 2:
          viewLines = renderMetricsView(this.data, th, innerWidth);
          break;
        case 3:
          viewLines = renderTimelineView(this.data, th, innerWidth);
          break;
      }
      content.push(...viewLines);
    }

    // Apply scroll
    const viewportHeight = Math.max(5, process.stdout.rows ? process.stdout.rows - 8 : 24);
    const chromeHeight = 2;
    const visibleContentRows = Math.max(1, viewportHeight - chromeHeight);
    const maxScroll = Math.max(0, content.length - visibleContentRows);
    this.scrollOffsets[this.activeTab] = Math.min(this.scrollOffsets[this.activeTab], maxScroll);
    const offset = this.scrollOffsets[this.activeTab];
    const visibleContent = content.slice(offset, offset + visibleContentRows);

    const lines = this.wrapInBox(visibleContent, width);

    // Footer hint
    const hint = th.fg("dim", "Tab/1-4 switch · ↑↓ scroll · g/G top/end · esc close");
    const hintVis = visibleWidth(hint);
    const hintPad = Math.max(0, Math.floor((width - hintVis) / 2));
    lines.push(" ".repeat(hintPad) + hint);

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  private wrapInBox(inner: string[], width: number): string[] {
    const th = this.theme;
    const border = (s: string) => th.fg("borderAccent", s);
    const innerWidth = width - 4;
    const lines: string[] = [];
    lines.push(border("╭" + "─".repeat(width - 2) + "╮"));
    for (const line of inner) {
      const truncated = truncateToWidth(line, innerWidth);
      const padWidth = Math.max(0, innerWidth - visibleWidth(truncated));
      lines.push(border("│") + " " + truncated + " ".repeat(padWidth) + " " + border("│"));
    }
    lines.push(border("╰" + "─".repeat(width - 2) + "╯"));
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.refreshTimer);
  }
}
