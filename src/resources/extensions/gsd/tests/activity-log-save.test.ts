// Tests for saveActivityLog performance behavior:
// - cache next sequence per activity directory instead of rescanning every save
// - skip rewriting identical snapshots for the same unit
// - recover safely if another writer creates the cached next sequence

import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { saveActivityLog } from "../activity-log.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

let tmpDirs: string[] = [];

function createBaseDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-activity-save-test-"));
  tmpDirs.push(dir);
  return dir;
}

function activityDir(baseDir: string): string {
  return join(baseDir, ".gsd", "activity");
}

function listActivityFiles(baseDir: string): string[] {
  const dir = activityDir(baseDir);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

function createCtx(entries: unknown[]) {
  return {
    sessionManager: {
      getEntries: () => entries,
    },
  };
}

function cleanup(): void {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
}

process.on("exit", cleanup);

async function main(): Promise<void> {
  console.log("\n── (a) cache next sequence instead of rescanning every save");
  {
    const baseDir = createBaseDir();
    saveActivityLog(createCtx([{ kind: "first", n: 1 }]) as any, baseDir, "execute-task", "M001/S01/T01");

    writeFileSync(
      join(activityDir(baseDir), "999-external-manual.jsonl"),
      '{"external":true}\n',
      "utf-8",
    );

    saveActivityLog(createCtx([{ kind: "second", n: 2 }]) as any, baseDir, "execute-task", "M001/S01/T02");

    const files = listActivityFiles(baseDir);
    assertTrue(files.includes("001-execute-task-M001-S01-T01.jsonl"), "(a) first save uses sequence 001");
    assertTrue(files.includes("002-execute-task-M001-S01-T02.jsonl"), "(a) second save uses cached next sequence 002");
    assertTrue(files.includes("999-external-manual.jsonl"), "(a) externally added file remains present");
    assertTrue(!files.some(file => file.startsWith("1000-")), "(a) second save did not rescan and jump to sequence 1000");
  }

  console.log("\n── (b) skip rewriting identical snapshots for the same unit");
  {
    const baseDir = createBaseDir();
    const ctx = createCtx([{ role: "assistant", content: "same snapshot" }]);

    saveActivityLog(ctx as any, baseDir, "plan-slice", "M002/S01");
    saveActivityLog(ctx as any, baseDir, "plan-slice", "M002/S01");

    let files = listActivityFiles(baseDir);
    assertEq(files.length, 1, "(b) identical repeated save writes only one activity file");
    assertTrue(files[0] === "001-plan-slice-M002-S01.jsonl", "(b) the original sequence is preserved");

    saveActivityLog(createCtx([{ role: "assistant", content: "changed snapshot" }]) as any, baseDir, "plan-slice", "M002/S01");
    files = listActivityFiles(baseDir);
    assertEq(files.length, 2, "(b) changed snapshot writes a new activity file");
    assertTrue(files.includes("002-plan-slice-M002-S01.jsonl"), "(b) deduped save did not consume the next sequence");
  }

  console.log("\n── (c) recover if another writer creates the exact cached target file");
  {
    const baseDir = createBaseDir();
    saveActivityLog(createCtx([{ turn: 1 }]) as any, baseDir, "execute-task", "M003/S02/T01");

    writeFileSync(
      join(activityDir(baseDir), "002-execute-task-M003-S02-T02.jsonl"),
      '{"collision":true}\n',
      "utf-8",
    );

    saveActivityLog(createCtx([{ turn: 2 }]) as any, baseDir, "execute-task", "M003/S02/T02");

    const files = listActivityFiles(baseDir);
    assertTrue(files.includes("002-execute-task-M003-S02-T02.jsonl"), "(c) exact collision file is preserved");
    assertTrue(files.includes("003-execute-task-M003-S02-T02.jsonl"), "(c) logger rescans only on collision and advances to 003");
  }

  console.log("\n── (d) dedupe is tracked per unit, not just the last write in the directory");
  {
    const baseDir = createBaseDir();
    const repeatedCtx = createCtx([{ role: "assistant", content: "same-for-unit-a" }]);

    saveActivityLog(repeatedCtx as any, baseDir, "execute-task", "M004/S01/T01");
    saveActivityLog(createCtx([{ role: "assistant", content: "other-unit" }]) as any, baseDir, "execute-task", "M004/S01/T02");
    saveActivityLog(repeatedCtx as any, baseDir, "execute-task", "M004/S01/T01");

    const files = listActivityFiles(baseDir);
    assertEq(files.length, 2, "(d) interleaving another unit does not force a duplicate rewrite for unit A");
    assertTrue(files.includes("001-execute-task-M004-S01-T01.jsonl"), "(d) original unit A snapshot is retained");
    assertTrue(files.includes("002-execute-task-M004-S01-T02.jsonl"), "(d) unit B snapshot is retained");
  }

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
