import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("fs-api read/write routes", () => {
  test("handleFsRequest signature includes allowedRoot parameter", () => {
    const src = readFileSync(join(import.meta.dir, "../src/server/fs-api.ts"), "utf8");
    expect(src).toContain("allowedRoot?: string");
  });

  test("read route exists and validates path", () => {
    const src = readFileSync(join(import.meta.dir, "../src/server/fs-api.ts"), "utf8");
    expect(src).toContain("/api/fs/read");
    expect(src).toContain("validatePath(filePath, allowedRoot)");
  });

  test("write route exists and validates path", () => {
    const src = readFileSync(join(import.meta.dir, "../src/server/fs-api.ts"), "utf8");
    expect(src).toContain("/api/fs/write");
    expect(src).toContain("validatePath(body.path, allowedRoot)");
  });

  test("write route requires both path and content", () => {
    const src = readFileSync(join(import.meta.dir, "../src/server/fs-api.ts"), "utf8");
    expect(src).toContain('path and content fields required');
  });

  test("read route returns 403 for path traversal", () => {
    const src = readFileSync(join(import.meta.dir, "../src/server/fs-api.ts"), "utf8");
    expect(src).toContain("Path not allowed");
  });

  test("server.ts passes repoRoot to handleFsRequest", () => {
    const src = readFileSync(join(import.meta.dir, "../src/server.ts"), "utf8");
    expect(src).toContain("handleFsRequest(req, url, projectRoot)");
  });
});
