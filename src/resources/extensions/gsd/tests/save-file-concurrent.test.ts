// Tests for saveFile() concurrent safety:
// - Parallel saveFile calls targeting the same path should not cause ENOENT
// - Each call uses a unique tmp file so rename() never collides

import { mkdtempSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { saveFile, loadFile } from "../files.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertTrue, report } = createTestContext();

let tmpDirs: string[] = [];

function createTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-savefile-test-"));
  tmpDirs.push(dir);
  return dir;
}

// ─── Test 1: Parallel saveFile calls to the same path don't throw ────────────

console.log("=== concurrent saveFile calls don't throw ===");
{
  const dir = createTmpDir();
  const target = join(dir, "DECISIONS.md");

  // Fire 5 concurrent saveFile calls to the same target
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      saveFile(target, `content from writer ${i}\n`),
    ),
  );

  const failures = results.filter(r => r.status === "rejected");
  assertTrue(failures.length === 0, `all concurrent saveFile calls should succeed, got ${failures.length} failures`);

  // File should exist and contain content from one of the writers
  const final = await loadFile(target);
  assertTrue(final !== null, "target file should exist after concurrent writes");
  assertTrue(final!.startsWith("content from writer "), "file content should be from one of the writers");
}

// ─── Test 2: No leftover .tmp files after concurrent writes ──────────────────

console.log("=== no leftover .tmp files ===");
{
  const dir = createTmpDir();
  const target = join(dir, "REQUIREMENTS.md");

  await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      saveFile(target, `req content ${i}\n`),
    ),
  );

  // Check directory for stray .tmp files
  const files = readdirSync(dir);
  const tmpFiles = files.filter(f => f.includes(".tmp."));
  assertTrue(tmpFiles.length === 0, `no leftover .tmp files should remain, found: ${tmpFiles.join(", ")}`);
}

// ─── Test 3: saveFile creates parent directories ─────────────────────────────

console.log("=== saveFile creates parent dirs ===");
{
  const dir = createTmpDir();
  const target = join(dir, "sub", "deep", "FILE.md");

  await saveFile(target, "nested content");
  const content = readFileSync(target, "utf-8");
  assertTrue(content === "nested content", "saveFile should create parent dirs and write content");
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

for (const d of tmpDirs) {
  try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
}

report();
