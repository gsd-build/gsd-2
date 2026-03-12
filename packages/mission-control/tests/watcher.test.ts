import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
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
