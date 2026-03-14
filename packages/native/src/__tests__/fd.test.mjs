import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import * as os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load the native addon directly
const addonDir = path.resolve(__dirname, "..", "..", "..", "..", "native", "addon");
const platformTag = `${process.platform}-${process.arch}`;
const candidates = [
  path.join(addonDir, `gsd_engine.${platformTag}.node`),
  path.join(addonDir, "gsd_engine.dev.node"),
];

let native;
for (const candidate of candidates) {
  try {
    native = require(candidate);
    break;
  } catch {
    // try next
  }
}

if (!native) {
  console.error("Native addon not found. Run `npm run build:native -w @gsd/native` first.");
  process.exit(1);
}

describe("native fd: fuzzyFind()", () => {
  test("finds files matching a query", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-fd-test-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    fs.writeFileSync(path.join(tmpDir, "main.rs"), "fn main() {}");
    fs.writeFileSync(path.join(tmpDir, "lib.rs"), "pub mod lib;");
    fs.writeFileSync(path.join(tmpDir, "utils.ts"), "export {}");
    fs.mkdirSync(path.join(tmpDir, "src"));
    fs.writeFileSync(path.join(tmpDir, "src", "helper.rs"), "fn helper() {}");

    const result = native.fuzzyFind({ query: "main", path: tmpDir });

    assert.ok(result.matches.length > 0, "Should find at least one match");
    assert.equal(result.matches[0].path, "main.rs");
    assert.equal(result.matches[0].isDirectory, false);
    assert.ok(result.matches[0].score > 0);
  });

  test("returns empty results for non-matching query", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-fd-test-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    fs.writeFileSync(path.join(tmpDir, "hello.txt"), "hello");

    const result = native.fuzzyFind({
      query: "zzzznotexist",
      path: tmpDir,
    });

    assert.equal(result.matches.length, 0);
    assert.equal(result.totalMatches, 0);
  });

  test("respects maxResults limit", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-fd-test-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(tmpDir, `file${i}.txt`), "content");
    }

    const result = native.fuzzyFind({
      query: "file",
      path: tmpDir,
      maxResults: 3,
    });

    assert.equal(result.matches.length, 3);
    assert.ok(result.totalMatches >= 3);
  });

  test("directories have trailing slash and bonus score", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-fd-test-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    fs.mkdirSync(path.join(tmpDir, "models"));
    fs.writeFileSync(path.join(tmpDir, "models.ts"), "export {}");

    const result = native.fuzzyFind({ query: "models", path: tmpDir });

    const dirMatch = result.matches.find((m) => m.isDirectory);
    const fileMatch = result.matches.find((m) => !m.isDirectory);

    assert.ok(dirMatch, "Should find a directory match");
    assert.ok(fileMatch, "Should find a file match");
    assert.ok(dirMatch.path.endsWith("/"), "Directory should have trailing slash");
    assert.ok(dirMatch.score > fileMatch.score, "Directory should score higher");
  });

  test("empty query returns all entries", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-fd-test-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    fs.writeFileSync(path.join(tmpDir, "a.txt"), "a");
    fs.writeFileSync(path.join(tmpDir, "b.txt"), "b");
    fs.writeFileSync(path.join(tmpDir, "c.txt"), "c");

    const result = native.fuzzyFind({ query: "", path: tmpDir });

    assert.equal(result.matches.length, 3);
  });

  test("errors on non-existent path", () => {
    assert.throws(
      () => native.fuzzyFind({ query: "test", path: "/nonexistent/path" }),
      { message: /Path not found/ },
    );
  });

  test("fuzzy subsequence matching works", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-fd-test-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    fs.writeFileSync(path.join(tmpDir, "MyComponentFile.tsx"), "export {}");
    fs.writeFileSync(path.join(tmpDir, "other.txt"), "other");

    // "mcf" should fuzzy-match "MyComponentFile" via subsequence
    const result = native.fuzzyFind({ query: "mcf", path: tmpDir });

    assert.ok(result.matches.length > 0, "Fuzzy subsequence should match");
    assert.ok(
      result.matches.some((m) => m.path.includes("MyComponentFile")),
      "Should find MyComponentFile via fuzzy match",
    );
  });

  test("reuses the shared fs scan cache until invalidated", (t) => {
    const previousTtl = process.env.FS_SCAN_CACHE_TTL_MS;
    process.env.FS_SCAN_CACHE_TTL_MS = "10000";

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-fd-test-"));
    t.after(() => {
      native.invalidateFsScanCache(tmpDir);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      if (previousTtl === undefined) {
        delete process.env.FS_SCAN_CACHE_TTL_MS;
      } else {
        process.env.FS_SCAN_CACHE_TTL_MS = previousTtl;
      }
    });

    fs.writeFileSync(path.join(tmpDir, "cached.txt"), "cached");
    native.invalidateFsScanCache(tmpDir);

    const warm = native.fuzzyFind({ query: "cached", path: tmpDir });
    assert.ok(warm.matches.some((m) => m.path === "cached.txt"));

    fs.unlinkSync(path.join(tmpDir, "cached.txt"));

    const cached = native.fuzzyFind({ query: "cached", path: tmpDir });
    assert.ok(
      cached.matches.some((m) => m.path === "cached.txt"),
      "should serve warm results from the shared fs scan cache",
    );

    native.invalidateFsScanCache(tmpDir);

    const refreshed = native.fuzzyFind({ query: "cached", path: tmpDir });
    assert.equal(refreshed.matches.length, 0);
  });

  test("results are sorted by score descending", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-fd-test-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    fs.writeFileSync(path.join(tmpDir, "main.ts"), "");
    fs.writeFileSync(path.join(tmpDir, "my_main.ts"), "");
    fs.mkdirSync(path.join(tmpDir, "src"));
    fs.writeFileSync(path.join(tmpDir, "src", "main.rs"), "");

    const result = native.fuzzyFind({
      query: "main",
      path: tmpDir,
      maxResults: 100,
    });

    for (let i = 1; i < result.matches.length; i++) {
      assert.ok(
        result.matches[i - 1].score >= result.matches[i].score,
        `Match ${i - 1} (score ${result.matches[i - 1].score}) should be >= match ${i} (score ${result.matches[i].score})`,
      );
    }
  });
});
