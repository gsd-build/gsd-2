import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("GsdLogo SVG", () => {
  test("GsdLogo renders SVG source, not PNG", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/sidebar/GsdLogo.tsx"), "utf8");
    expect(src).toContain("gsd-2-mission-control-logo.svg");
  });
});
