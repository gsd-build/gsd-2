// GSD Extension — Workflow Logger Tests
// Tests for the centralized warning/error accumulator.

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  logWarning,
  logError,
  drainLogs,
  peekLogs,
  hasErrors,
  hasWarnings,
  summarizeLogs,
  formatForNotification,
  _resetLogs,
} from "../workflow-logger.ts";

describe("workflow-logger", () => {
  beforeEach(() => {
    _resetLogs();
  });

  describe("accumulation", () => {
    it("logWarning adds an entry with severity warn", () => {
      logWarning("engine", "test warning");
      const entries = peekLogs();
      assert.equal(entries.length, 1);
      assert.equal(entries[0].severity, "warn");
      assert.equal(entries[0].component, "engine");
      assert.equal(entries[0].message, "test warning");
      assert.ok(entries[0].ts);
    });

    it("logError adds an entry with severity error", () => {
      logError("intercept", "blocked write", { path: "/foo/STATE.md" });
      const entries = peekLogs();
      assert.equal(entries.length, 1);
      assert.equal(entries[0].severity, "error");
      assert.equal(entries[0].component, "intercept");
      assert.deepEqual(entries[0].context, { path: "/foo/STATE.md" });
    });

    it("accumulates multiple entries in order", () => {
      logWarning("projection", "render failed");
      logError("intercept", "blocked write");
      logWarning("manifest", "write failed");
      assert.equal(peekLogs().length, 3);
      assert.equal(peekLogs()[0].component, "projection");
      assert.equal(peekLogs()[1].component, "intercept");
      assert.equal(peekLogs()[2].component, "manifest");
    });
  });

  describe("drain", () => {
    it("returns all entries and clears buffer", () => {
      logWarning("engine", "w1");
      logError("engine", "e1");
      const drained = drainLogs();
      assert.equal(drained.length, 2);
      assert.equal(peekLogs().length, 0);
    });

    it("returns empty array when no entries", () => {
      assert.deepEqual(drainLogs(), []);
    });
  });

  describe("hasErrors / hasWarnings", () => {
    it("hasErrors returns false when only warnings", () => {
      logWarning("engine", "just a warning");
      assert.equal(hasErrors(), false);
      assert.equal(hasWarnings(), true);
    });

    it("hasErrors returns true when errors present", () => {
      logWarning("engine", "warning");
      logError("intercept", "error");
      assert.equal(hasErrors(), true);
    });

    it("hasWarnings returns false when buffer empty", () => {
      assert.equal(hasWarnings(), false);
    });
  });

  describe("summarizeLogs", () => {
    it("returns null when empty", () => {
      assert.equal(summarizeLogs(), null);
    });

    it("summarizes errors and warnings separately", () => {
      logError("intercept", "blocked STATE.md");
      logWarning("projection", "render failed");
      logWarning("manifest", "write failed");
      const summary = summarizeLogs()!;
      assert.ok(summary.includes("1 error(s)"));
      assert.ok(summary.includes("blocked STATE.md"));
      assert.ok(summary.includes("2 warning(s)"));
    });

    it("only shows errors section when no warnings", () => {
      logError("intercept", "blocked");
      const summary = summarizeLogs()!;
      assert.ok(summary.includes("1 error(s)"));
      assert.ok(!summary.includes("warning"));
    });
  });

  describe("formatForNotification", () => {
    it("returns empty string for empty array", () => {
      assert.equal(formatForNotification([]), "");
    });

    it("formats single entry without line breaks", () => {
      logError("intercept", "blocked write");
      const entries = drainLogs();
      const formatted = formatForNotification(entries);
      assert.equal(formatted, "[intercept] blocked write");
    });

    it("formats multiple entries with line breaks", () => {
      logWarning("projection", "render failed");
      logError("intercept", "blocked write");
      const entries = drainLogs();
      const formatted = formatForNotification(entries);
      assert.ok(formatted.includes("[projection] render failed"));
      assert.ok(formatted.includes("[intercept] blocked write"));
      assert.ok(formatted.includes("\n"));
    });
  });

  describe("buffer limit", () => {
    it("caps at 100 entries, dropping oldest", () => {
      for (let i = 0; i < 110; i++) {
        logWarning("engine", `msg-${i}`);
      }
      const entries = peekLogs();
      assert.equal(entries.length, 100);
      // Oldest should be msg-10 (first 10 dropped)
      assert.equal(entries[0].message, "msg-10");
      assert.equal(entries[99].message, "msg-109");
    });
  });
});
