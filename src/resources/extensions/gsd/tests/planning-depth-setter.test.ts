// GSD-2 — Deep planning mode setPlanningDepth helper.
// Verifies the helper correctly creates and updates .gsd/PREFERENCES.md while
// preserving existing frontmatter keys and body content.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parse as parseYaml } from "yaml";

import { setPlanningDepth } from "../planning-depth.ts";

function makeBase(): string {
  const base = join(tmpdir(), `gsd-planning-depth-${randomUUID()}`);
  mkdirSync(base, { recursive: true });
  return base;
}

function readFrontmatter(path: string): { frontmatter: Record<string, unknown>; body: string } {
  const content = readFileSync(path, "utf-8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  assert.ok(match, "PREFERENCES.md must have frontmatter delimiters");
  const parsed = parseYaml(match[1]);
  assert.ok(parsed && typeof parsed === "object", "frontmatter must parse to an object");
  return { frontmatter: parsed as Record<string, unknown>, body: match[2] };
}

test("Deep mode: setPlanningDepth creates PREFERENCES.md when missing", (t) => {
  const base = makeBase();
  t.after(() => { try { rmSync(base, { recursive: true, force: true }); } catch {} });

  setPlanningDepth(base, "deep");

  const path = join(base, ".gsd", "PREFERENCES.md");
  assert.ok(existsSync(path), "PREFERENCES.md must be created");
  const { frontmatter } = readFrontmatter(path);
  assert.strictEqual(frontmatter.planning_depth, "deep");
});

test("Deep mode: setPlanningDepth updates existing planning_depth", (t) => {
  const base = makeBase();
  t.after(() => { try { rmSync(base, { recursive: true, force: true }); } catch {} });

  mkdirSync(join(base, ".gsd"), { recursive: true });
  writeFileSync(join(base, ".gsd", "PREFERENCES.md"), "---\nplanning_depth: light\n---\n");
  setPlanningDepth(base, "deep");

  const { frontmatter } = readFrontmatter(join(base, ".gsd", "PREFERENCES.md"));
  assert.strictEqual(frontmatter.planning_depth, "deep");
});

test("Deep mode: setPlanningDepth preserves other frontmatter keys", (t) => {
  const base = makeBase();
  t.after(() => { try { rmSync(base, { recursive: true, force: true }); } catch {} });

  mkdirSync(join(base, ".gsd"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "PREFERENCES.md"),
    "---\nversion: 1\nmode: solo\nuat_dispatch: true\n---\n",
  );
  setPlanningDepth(base, "deep");

  const { frontmatter } = readFrontmatter(join(base, ".gsd", "PREFERENCES.md"));
  assert.strictEqual(frontmatter.planning_depth, "deep");
  assert.strictEqual(frontmatter.version, 1);
  assert.strictEqual(frontmatter.mode, "solo");
  assert.strictEqual(frontmatter.uat_dispatch, true);
});

test("Deep mode: setPlanningDepth preserves body content", (t) => {
  const base = makeBase();
  t.after(() => { try { rmSync(base, { recursive: true, force: true }); } catch {} });

  mkdirSync(join(base, ".gsd"), { recursive: true });
  const original = "---\nversion: 1\n---\n\n# User notes\n\nKeep this body intact.\n";
  writeFileSync(join(base, ".gsd", "PREFERENCES.md"), original);
  setPlanningDepth(base, "deep");

  const content = readFileSync(join(base, ".gsd", "PREFERENCES.md"), "utf-8");
  assert.ok(content.includes("# User notes"), "body header must survive");
  assert.ok(content.includes("Keep this body intact."), "body text must survive");
});

test("Deep mode: setPlanningDepth handles file without frontmatter delimiters", (t) => {
  const base = makeBase();
  t.after(() => { try { rmSync(base, { recursive: true, force: true }); } catch {} });

  mkdirSync(join(base, ".gsd"), { recursive: true });
  // Some agents write preferences without frontmatter delimiters (#2036 case)
  writeFileSync(join(base, ".gsd", "PREFERENCES.md"), "version: 1\nmode: solo\n");
  setPlanningDepth(base, "deep");

  const content = readFileSync(join(base, ".gsd", "PREFERENCES.md"), "utf-8");
  assert.ok(content.startsWith("---\n"), "result must have frontmatter delimiters");
  const { frontmatter, body } = readFrontmatter(join(base, ".gsd", "PREFERENCES.md"));
  assert.strictEqual(frontmatter.planning_depth, "deep");
  // The legacy non-frontmatter content is preserved as body
  assert.ok(body.includes("version: 1"), "legacy content preserved as body");
});

test("Deep mode: setPlanningDepth can flip back to light", (t) => {
  const base = makeBase();
  t.after(() => { try { rmSync(base, { recursive: true, force: true }); } catch {} });

  setPlanningDepth(base, "deep");
  setPlanningDepth(base, "light");

  const { frontmatter } = readFrontmatter(join(base, ".gsd", "PREFERENCES.md"));
  assert.strictEqual(frontmatter.planning_depth, "light");
});
