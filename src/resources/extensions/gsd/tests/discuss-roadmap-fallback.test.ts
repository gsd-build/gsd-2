import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openDatabase, closeDatabase, getMilestoneSlices } from "../gsd-db.ts";
import { normalizeDiscussSlices } from "../guided-flow.ts";

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-discuss-fallback-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  return base;
}

test("showDiscuss slice normalization falls back to roadmap when DB is open but empty", () => {
  const base = createFixtureBase();
  try {
    const roadmapPath = join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md");
    writeFileSync(
      roadmapPath,
      `# M001: Discuss fallback\n\n## Slices\n\n- [ ] **S01: One Slice** \`risk:low\` \`depends:[]\`\n  > After this: still needs discussion.\n`,
    );

    const dbPath = join(base, ".gsd", "gsd.db");
    assert.equal(openDatabase(dbPath), true, "should open an empty DB");
    const dbSlices = getMilestoneSlices("M001");
    assert.deepStrictEqual(dbSlices, [], "fixture DB should be open but empty for the milestone");

    const roadmapContent = readFileSync(roadmapPath, "utf-8");
    const slices = normalizeDiscussSlices(dbSlices, roadmapContent);

    assert.equal(slices.length, 1, "roadmap slice should be used when DB is empty");
    assert.equal(slices[0]?.id, "S01");
    assert.equal(slices[0]?.done, false);
    assert.equal(slices[0]?.title, "One Slice");
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});
