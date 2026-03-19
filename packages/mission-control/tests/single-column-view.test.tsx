import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("SingleColumnView layout", () => {
  test("does not render project name header bar in right panel", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/SingleColumnView.tsx"), "utf8");
    // A1 polish: project name header removed from right panel (shown only in sidebar)
    expect(src).not.toContain("FolderOpen");
  });
  test("renders main element with flex column layout", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/SingleColumnView.tsx"), "utf8");
    expect(src).toContain("flex flex-col");
  });
  test("has animate-in fade-in on view switch", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/SingleColumnView.tsx"), "utf8");
    expect(src).toContain("animate-in fade-in");
  });
});
