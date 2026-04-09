/**
 * Tests for shared utility modules created in the shared-utils refactor.
 * Covers: error-utils, safe-fs, time-utils, display-utils, shell-utils,
 * string-utils, milestone-id-utils additions.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── error-utils ─────────────────────────────────────────────────────────────

import { getErrorMessage, getErrnoCode, isErrnoCode } from "../error-utils.ts";

describe("error-utils", () => {
  describe("getErrorMessage", () => {
    test("extracts message from Error instance", () => {
      assert.equal(getErrorMessage(new Error("boom")), "boom");
    });

    test("converts string to string", () => {
      assert.equal(getErrorMessage("oops"), "oops");
    });

    test("converts number to string", () => {
      assert.equal(getErrorMessage(42), "42");
    });

    test("converts null to string", () => {
      assert.equal(getErrorMessage(null), "null");
    });
  });

  describe("getErrnoCode", () => {
    test("extracts code from NodeJS-style error", () => {
      const err = Object.assign(new Error("not found"), { code: "ENOENT" });
      assert.equal(getErrnoCode(err), "ENOENT");
    });

    test("returns undefined for plain Error", () => {
      assert.equal(getErrnoCode(new Error("plain")), undefined);
    });

    test("returns undefined for non-object", () => {
      assert.equal(getErrnoCode("string error"), undefined);
    });

    test("returns undefined for non-string code", () => {
      assert.equal(getErrnoCode({ code: 123 }), undefined);
    });
  });

  describe("isErrnoCode", () => {
    test("returns true for matching code", () => {
      const err = Object.assign(new Error("busy"), { code: "EBUSY" });
      assert.equal(isErrnoCode(err, "EBUSY"), true);
    });

    test("returns false for non-matching code", () => {
      const err = Object.assign(new Error("busy"), { code: "EBUSY" });
      assert.equal(isErrnoCode(err, "ENOENT"), false);
    });

    test("returns false for plain Error", () => {
      assert.equal(isErrnoCode(new Error("x"), "ENOENT"), false);
    });
  });
});

// ── safe-fs ─────────────────────────────────────────────────────────────────

import { safeReadFile, ensureParentDir } from "../safe-fs.ts";

describe("safe-fs", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "gsd-safe-fs-")); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  describe("safeReadFile", () => {
    test("reads existing file", () => {
      const f = join(tmp, "hello.txt");
      writeFileSync(f, "world", "utf-8");
      assert.equal(safeReadFile(f), "world");
    });

    test("returns null for missing file", () => {
      assert.equal(safeReadFile(join(tmp, "nope.txt")), null);
    });

    test("returns null for directory path", () => {
      assert.equal(safeReadFile(tmp), null);
    });
  });

  describe("ensureParentDir", () => {
    test("creates nested parent directories", () => {
      const f = join(tmp, "a", "b", "c", "file.json");
      const result = ensureParentDir(f);
      assert.equal(result, true);
      assert.equal(existsSync(join(tmp, "a", "b", "c")), true);
    });

    test("succeeds when parent already exists", () => {
      const f = join(tmp, "file.json");
      assert.equal(ensureParentDir(f), true);
    });
  });
});

// ── time-utils ──────────────────────────────────────────────────────────────

import { makeSafeTimestamp, formatDuration, formatRelativeTime, nowIso } from "../time-utils.ts";

describe("time-utils", () => {
  describe("makeSafeTimestamp", () => {
    test("produces 19-char filesystem-safe string", () => {
      const ts = makeSafeTimestamp(new Date("2026-04-08T12:30:45.123Z"));
      assert.equal(ts, "2026-04-08T12-30-45");
      assert.equal(ts.length, 19);
    });

    test("contains no colons or dots", () => {
      const ts = makeSafeTimestamp();
      assert.equal(ts.includes(":"), false);
      assert.equal(ts.includes("."), false);
    });
  });

  describe("formatDuration", () => {
    test("formats seconds", () => {
      assert.equal(formatDuration(5000), "5s");
    });

    test("formats minutes", () => {
      assert.equal(formatDuration(120_000), "2m");
    });

    test("formats hours with remainder", () => {
      assert.equal(formatDuration(5_400_000), "1h 30m");
    });

    test("returns expired for zero", () => {
      assert.equal(formatDuration(0), "expired");
    });

    test("returns expired for negative", () => {
      assert.equal(formatDuration(-1000), "expired");
    });
  });

  describe("formatRelativeTime", () => {
    test("returns just now for recent timestamps", () => {
      assert.equal(formatRelativeTime(Date.now() - 30_000), "just now");
    });

    test("returns minutes ago", () => {
      assert.equal(formatRelativeTime(Date.now() - 300_000), "5m ago");
    });

    test("returns hours ago", () => {
      assert.equal(formatRelativeTime(Date.now() - 7_200_000), "2h ago");
    });

    test("returns days ago", () => {
      assert.equal(formatRelativeTime(Date.now() - 172_800_000), "2d ago");
    });
  });

  describe("nowIso", () => {
    test("returns ISO-8601 string", () => {
      const iso = nowIso();
      assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});

// ── display-utils ───────────────────────────────────────────────────────────

import { shortModelName } from "../display-utils.ts";

describe("display-utils", () => {
  describe("shortModelName", () => {
    test("strips claude- prefix", () => {
      assert.equal(shortModelName("claude-3-5-sonnet-20241022"), "3-5-sonnet-20241022");
    });

    test("strips anthropic/ prefix", () => {
      assert.equal(shortModelName("anthropic/claude-3-5-sonnet"), "claude-3-5-sonnet");
    });

    test("passes through unknown models", () => {
      assert.equal(shortModelName("gpt-4o"), "gpt-4o");
    });
  });
});

// ── shell-utils ─────────────────────────────────────────────────────────────

import { tryExec, commandExists } from "../shell-utils.ts";

describe("shell-utils", () => {
  describe("tryExec", () => {
    test("returns trimmed stdout on success", () => {
      const result = tryExec("echo hello", process.cwd());
      assert.equal(result, "hello");
    });

    test("returns null on failure", () => {
      const result = tryExec("false", process.cwd());
      assert.equal(result, null);
    });

    test("returns null for nonexistent command", () => {
      const result = tryExec("__nonexistent_cmd_xyz__", process.cwd());
      assert.equal(result, null);
    });
  });

  describe("commandExists", () => {
    test("returns true for node", () => {
      assert.equal(commandExists("node", process.cwd()), true);
    });

    test("returns false for nonexistent command", () => {
      assert.equal(commandExists("__nonexistent_cmd_xyz__", process.cwd()), false);
    });
  });
});

// ── string-utils ────────────────────────────────────────────────────────────

import { slugify, normalizeWhitespace } from "../string-utils.ts";

describe("string-utils", () => {
  describe("slugify", () => {
    test("lowercases and replaces non-alnum with hyphens", () => {
      assert.equal(slugify("Hello World!"), "hello-world");
    });

    test("strips leading/trailing hyphens", () => {
      assert.equal(slugify("--test--"), "test");
    });

    test("truncates to maxLen", () => {
      const result = slugify("a".repeat(60), 10);
      assert.equal(result.length <= 10, true);
    });

    test("handles empty string", () => {
      assert.equal(slugify(""), "");
    });
  });

  describe("normalizeWhitespace", () => {
    test("collapses multiple spaces", () => {
      assert.equal(normalizeWhitespace("a   b   c"), "a b c");
    });

    test("trims leading and trailing", () => {
      assert.equal(normalizeWhitespace("  hello  "), "hello");
    });

    test("collapses tabs and newlines", () => {
      assert.equal(normalizeWhitespace("a\t\nb"), "a b");
    });
  });
});

// ── milestone-id-utils ──────────────────────────────────────────────────────

import { milestoneIdFromBranch } from "../milestone-id-utils.ts";

describe("milestone-id-utils", () => {
  describe("milestoneIdFromBranch", () => {
    test("strips milestone/ prefix", () => {
      assert.equal(milestoneIdFromBranch("milestone/M001"), "M001");
    });

    test("strips milestone/ with unique suffix", () => {
      assert.equal(milestoneIdFromBranch("milestone/M001-abc123"), "M001-abc123");
    });

    test("returns raw name if no milestone/ prefix", () => {
      assert.equal(milestoneIdFromBranch("feature/cool-thing"), "feature/cool-thing");
    });
  });
});
