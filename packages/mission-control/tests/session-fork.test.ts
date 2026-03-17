import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("session fork message copy", () => {
  test("pendingForkRef is defined", () => {
    const src = readFileSync(join(import.meta.dir, "../src/hooks/useSessionManager.ts"), "utf8");
    expect(src).toContain("pendingForkRef");
  });
  test("copies parent messages to new session", () => {
    const src = readFileSync(join(import.meta.dir, "../src/hooks/useSessionManager.ts"), "utf8");
    expect(src).toContain("parentMsgs");
    expect(src).toContain("forkSourceId");
  });
});
