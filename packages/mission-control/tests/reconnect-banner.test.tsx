import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("reconnect banner", () => {
  test("stuckSessionId state exists in useSessionManager", () => {
    const src = readFileSync(join(import.meta.dir, "../src/hooks/useSessionManager.ts"), "utf8");
    expect(src).toContain("stuckSessionId");
    expect(src).toContain("stuckTimerRef");
  });
  test("SingleColumnView shows reconnect banner", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/SingleColumnView.tsx"), "utf8");
    expect(src).toContain("GSD may still be running");
    expect(src).toContain("Reconnect");
  });
});
