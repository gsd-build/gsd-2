// GSD-2 — Guided smart entry complete-state behavior tests.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { deriveState } from "../state.js";
import { showSmartEntry } from "../guided-flow.js";
import { closeDatabase, insertMilestone, insertSlice, openDatabase } from "../gsd-db.js";

function writeCompleteMilestone(base: string): void {
  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  mkdirSync(milestoneDir, { recursive: true });
  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    [
      "# M001: Complete Milestone",
      "",
      "## Slices",
      "- [x] **S01: Done slice** `risk:low` `depends:[]`",
      "  > Done.",
    ].join("\n"),
  );
  writeFileSync(join(milestoneDir, "M001-SUMMARY.md"), "# M001 Summary\n\nComplete.");
}

test("deriveState reports the last completed milestone when all milestone slices are done", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-smart-entry-complete-"));
  try {
    writeCompleteMilestone(base);
    const state = await deriveState(base);
    assert.equal(state.phase, "complete");
    assert.equal(state.lastCompletedMilestone?.id, "M001");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("showSmartEntry stops instead of opening next-action choices when complete and non-interactive", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-smart-entry-complete-"));
  const notifications: Array<{ message: string; level: string }> = [];
  try {
    writeCompleteMilestone(base);
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Complete Milestone", status: "complete" });
    insertSlice({ id: "S01", milestoneId: "M001", title: "Done slice", status: "complete", risk: "low", depends: [] });

    await showSmartEntry(
      {
        hasUI: false,
        ui: {
          notify: (message: string, level: string) => notifications.push({ message, level }),
          setStatus: () => {},
        },
      } as any,
      {
        sendMessage: () => {
          throw new Error("complete non-interactive smart entry must not dispatch a prompt");
        },
        getActiveTools: () => [],
        setActiveTools: () => {},
      } as any,
      base,
    );

    assert.deepEqual(notifications.at(-1), {
      message: "Auto-mode stopped — All milestones complete.",
      level: "info",
    });
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});
