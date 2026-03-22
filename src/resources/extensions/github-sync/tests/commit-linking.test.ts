import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTaskCommitMessage } from "../../gsd/git-service.ts";

describe("commit linking", () => {
  it("appends Resolves #N when issueNumber is set", () => {
    const msg = buildTaskCommitMessage({
      taskId: "S01/T02",
      taskTitle: "implement auth",
      issueNumber: 43,
    });
    assert.ok(msg.includes("Resolves #43"), "should include Resolves trailer");
    assert.ok(msg.startsWith("feat(S01/T02):"), "subject line unchanged");
  });

  it("includes both key files and Resolves #N", () => {
    const msg = buildTaskCommitMessage({
      taskId: "S01/T02",
      taskTitle: "implement auth",
      keyFiles: ["src/auth.ts"],
      issueNumber: 43,
    });
    assert.ok(msg.includes("- src/auth.ts"), "key files present");
    assert.ok(msg.includes("Resolves #43"), "Resolves trailer present");
    // Resolves should come after key files
    const keyFilesIdx = msg.indexOf("- src/auth.ts");
    const resolvesIdx = msg.indexOf("Resolves #43");
    assert.ok(resolvesIdx > keyFilesIdx, "Resolves after key files");
  });

  it("no Resolves trailer when issueNumber is not set", () => {
    const msg = buildTaskCommitMessage({
      taskId: "S01/T02",
      taskTitle: "implement auth",
    });
    assert.ok(!msg.includes("Resolves"), "no Resolves when no issueNumber");
    assert.ok(!msg.includes("\n"), "no body when no issueNumber or keyFiles");
  });
});
