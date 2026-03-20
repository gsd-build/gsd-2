/**
 * Shared test utilities for GSD extension tests.
 *
 * Provides cross-platform helpers for creating temporary git repos,
 * safe cleanup, file creation, and shell-free git operations.
 *
 * Usage:
 *   import { git, makeTempRepo, cleanup, createFile } from "./test-utils.ts";
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Shell-free git helper — uses execFileSync to bypass shell entirely.
 * No quoting issues, no Windows cmd.exe incompatibilities.
 *
 * @param cwd - Working directory for git command
 * @param args - Git arguments (e.g., "add", "-A")
 * @returns trimmed stdout
 */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
}

/**
 * Create a temporary git repository with an initial commit.
 * Configures user.email, user.name, and core.autocrlf=false for
 * consistent behavior across platforms.
 *
 * @param prefix - Optional prefix for the temp directory name
 * @returns absolute path to the temp repo
 */
export function makeTempRepo(prefix: string = "gsd-test-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  git(dir, "init");
  git(dir, "config", "user.email", "test@test.com");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "core.autocrlf", "false");
  writeFileSync(join(dir, "README.md"), "# init\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "init");
  git(dir, "branch", "-M", "main");
  return dir;
}

/**
 * Create a temporary directory (not a git repo).
 *
 * @param prefix - Optional prefix for the temp directory name
 * @returns absolute path to the temp directory
 */
export function makeTempDir(prefix: string = "gsd-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Safely clean up a temporary directory.
 * Non-fatal — Windows may hold file descriptors briefly.
 */
export function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore — Windows may hold file descriptors briefly after test
  }
}

/**
 * Create a file with intermediate directories.
 *
 * @param base - Base directory
 * @param relativePath - Relative path within base (e.g., "src/index.ts")
 * @param content - File content (defaults to empty string)
 * @returns absolute path to the created file
 */
export function createFile(base: string, relativePath: string, content: string = ""): string {
  const fullPath = join(base, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
  return fullPath;
}

/**
 * Safely read a file, returning null if it doesn't exist or is a directory.
 * Prevents EISDIR errors.
 */
export function safeReadFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    if (!statSync(filePath).isFile()) return null;
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Create a minimal GSD milestone structure in a temp directory.
 *
 * @param base - Base directory (should have .gsd/ or be a temp repo)
 * @param mid - Milestone ID (e.g., "M001")
 * @param options - What to create
 */
export function writeMilestoneFixture(
  base: string,
  mid: string,
  options: {
    roadmap?: string;
    context?: string;
    summary?: string;
    validation?: string;
    slices?: Array<{
      id: string;
      plan?: string;
      summary?: string;
      uat?: string;
    }>;
  } = {},
): void {
  const milestoneDir = join(base, ".gsd", "milestones", mid);
  mkdirSync(milestoneDir, { recursive: true });

  if (options.roadmap) {
    writeFileSync(join(milestoneDir, `${mid}-ROADMAP.md`), options.roadmap);
  }
  if (options.context) {
    writeFileSync(join(milestoneDir, `${mid}-CONTEXT.md`), options.context);
  }
  if (options.summary) {
    writeFileSync(join(milestoneDir, `${mid}-SUMMARY.md`), options.summary);
  }
  if (options.validation) {
    writeFileSync(join(milestoneDir, `${mid}-VALIDATION.md`), options.validation);
  }
  if (options.slices) {
    for (const slice of options.slices) {
      const sliceDir = join(milestoneDir, "slices", slice.id);
      mkdirSync(sliceDir, { recursive: true });
      if (slice.plan) {
        writeFileSync(join(sliceDir, `${slice.id}-PLAN.md`), slice.plan);
      }
      if (slice.summary) {
        writeFileSync(join(sliceDir, `${slice.id}-SUMMARY.md`), slice.summary);
      }
      if (slice.uat) {
        writeFileSync(join(sliceDir, `${slice.id}-UAT.md`), slice.uat);
      }
    }
  }
}
