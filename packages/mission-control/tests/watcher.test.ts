import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createFileWatcher } from "../src/server/watcher";

let tempDir: string;
let cleanup: (() => void) | null = null;

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "watcher-test-"));
  return dir;
}

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

describe("COMPAT-01: watcher .gsd dotfile exception", () => {
  test("allows events under .gsd/ subdirectory (dotfile exception)", async () => {
    tempDir = makeTempDir();

    // Create .gsd/ subdirectory inside the watched root
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });

    const receivedFiles: string[] = [];
    const done = new Promise<void>((resolve) => {
      const watcher = createFileWatcher({
        planningDir: tempDir,
        debounceMs: 50,
        onChange: (files) => {
          for (const f of files) receivedFiles.push(f);
          resolve();
        },
      });
      cleanup = () => watcher.close();
    });

    await Bun.sleep(100);
    writeFileSync(join(gsdDir, "STATE.md"), "gsd content");

    await Promise.race([done, Bun.sleep(3000)]);

    // At least STATE.md (or .gsd/STATE.md) should have been received
    const hasGsdFile = receivedFiles.some(
      (f) => f.includes("STATE.md") || f.startsWith(".gsd")
    );
    expect(hasGsdFile).toBe(true);
  });

  test("filters out events under other dotfile directories (not .gsd/)", async () => {
    tempDir = makeTempDir();

    // Create .planning/ and .gsd/ alongside each other
    const planningDir = join(tempDir, ".planning");
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(planningDir, { recursive: true });
    mkdirSync(gsdDir, { recursive: true });

    const receivedFiles: string[] = [];

    const watcher = createFileWatcher({
      planningDir: tempDir,
      debounceMs: 50,
      onChange: (files) => {
        for (const f of files) receivedFiles.push(f);
      },
    });
    cleanup = () => watcher.close();

    await Bun.sleep(100);

    // Write to .planning/ — should be filtered out (non-.gsd dotdir)
    writeFileSync(join(planningDir, "STATE.md"), "planning content");

    await Bun.sleep(300);

    // .planning/STATE.md should NOT appear in received files
    const hasPlanningFile = receivedFiles.some((f) => f.startsWith(".planning"));
    expect(hasPlanningFile).toBe(false);
  });
});

describe("createFileWatcher", () => {
  test("calls onChange with set of changed filenames after debounce window", async () => {
    tempDir = makeTempDir();
    let received: Set<string> | null = null;
    const done = new Promise<void>((resolve) => {
      const watcher = createFileWatcher({
        planningDir: tempDir,
        debounceMs: 50,
        onChange: (files) => {
          received = files;
          resolve();
        },
      });
      cleanup = () => watcher.close();
    });

    // Write a file after a short delay to ensure watcher is ready
    await Bun.sleep(100);
    writeFileSync(join(tempDir, "STATE.md"), "test content");

    await Promise.race([done, Bun.sleep(3000)]);
    expect(received).not.toBeNull();
    expect(received!.size).toBeGreaterThan(0);
  });

  test("ignores temp files (.swp, ~) and .mission-control-session.json", async () => {
    tempDir = makeTempDir();
    const receivedFiles: string[] = [];
    let callCount = 0;

    const watcher = createFileWatcher({
      planningDir: tempDir,
      debounceMs: 50,
      onChange: (files) => {
        callCount++;
        for (const f of files) receivedFiles.push(f);
      },
    });
    cleanup = () => watcher.close();

    await Bun.sleep(100);

    // Write ignored files
    writeFileSync(join(tempDir, "file.swp"), "swap");
    writeFileSync(join(tempDir, "file~"), "backup");
    writeFileSync(join(tempDir, ".mission-control-session.json"), "{}");

    // Wait for potential callbacks
    await Bun.sleep(200);

    // None of the ignored files should have triggered onChange
    const hasIgnored = receivedFiles.some(
      (f) => f.endsWith(".swp") || f.endsWith("~") || f === ".mission-control-session.json"
    );
    expect(hasIgnored).toBe(false);
  });

  test("coalesces multiple rapid events into single onChange call (debounce)", async () => {
    tempDir = makeTempDir();
    let callCount = 0;
    let lastFiles: Set<string> | null = null;

    const watcher = createFileWatcher({
      planningDir: tempDir,
      debounceMs: 100,
      onChange: (files) => {
        callCount++;
        lastFiles = files;
      },
    });
    cleanup = () => watcher.close();

    await Bun.sleep(100);

    // Write multiple files rapidly
    writeFileSync(join(tempDir, "file1.md"), "a");
    writeFileSync(join(tempDir, "file2.md"), "b");
    writeFileSync(join(tempDir, "file3.md"), "c");

    // Wait for debounce to fire
    await Bun.sleep(500);

    // Should have coalesced into 1 call (or at most very few)
    expect(callCount).toBeLessThanOrEqual(2);
    // At least some files should be collected
    if (lastFiles) {
      expect(lastFiles.size).toBeGreaterThan(0);
    }
  });

  test("watcher.close() stops watching without errors", async () => {
    tempDir = makeTempDir();
    let callCount = 0;

    const watcher = createFileWatcher({
      planningDir: tempDir,
      debounceMs: 50,
      onChange: () => {
        callCount++;
      },
    });

    await Bun.sleep(100);

    // Close watcher
    watcher.close();
    cleanup = null; // already closed

    const countAfterClose = callCount;

    // Write file after close -- should not trigger
    writeFileSync(join(tempDir, "after-close.md"), "should not trigger");
    await Bun.sleep(200);

    expect(callCount).toBe(countAfterClose);
  });
});
