import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("scrollbar-thin utility", () => {
  test("globals.css has Firefox scrollbar properties", () => {
    const src = readFileSync(join(import.meta.dir, "../src/styles/globals.css"), "utf8");
    expect(src).toContain("scrollbar-width: thin");
    expect(src).toContain("scrollbar-color");
  });
  test("Sidebar uses scrollbar-thin class", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/Sidebar.tsx"), "utf8");
    expect(src).toContain("scrollbar-thin");
  });
});
