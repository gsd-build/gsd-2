import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("CodeMirror FileEditor", () => {
  test("FileEditor.tsx exists", () => {
    expect(existsSync(join(import.meta.dir, "../src/components/code-explorer/FileEditor.tsx"))).toBe(true);
  });
  test("FileEditor uses CodeMirror", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/code-explorer/FileEditor.tsx"), "utf8");
    expect(src).toContain("EditorView");
    expect(src).toContain("oneDark");
    expect(src).toContain("Mod-s");
  });
});
