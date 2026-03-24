import { mkdtempSync, mkdirSync, rmSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

import { gsdRoot, _clearGsdRootCache } from "../paths.ts";

/** Create a tmp dir and resolve symlinks + 8.3 short names (macOS /var→/private/var, Windows RUNNER~1→runneradmin). */
function tmp(): string {
  const p = mkdtempSync(join(tmpdir(), "gsd-paths-test-"));
  try { return realpathSync.native(p); } catch { return p; }
}

function cleanup(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function initGit(dir: string): void {
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: dir });
}

// ── tests ──────────────────────────────────────────────────────────────────

test("Case 1: .gsd exists at basePath — fast path", () => {
  const root = tmp();
  try {
    mkdirSync(join(root, ".gsd"));
    _clearGsdRootCache();
    const result = gsdRoot(root);
    assert.equal(result, join(root, ".gsd"), "fast path: returns basePath/.gsd");
  } finally { cleanup(root); }
});

test("Case 2: .gsd exists at git root, cwd is a subdirectory", () => {
  const root = tmp();
  try {
    initGit(root);
    mkdirSync(join(root, ".gsd"));
    const sub = join(root, "src", "deep");
    mkdirSync(sub, { recursive: true });
    _clearGsdRootCache();
    const result = gsdRoot(sub);
    assert.equal(result, join(root, ".gsd"), "git-root probe: finds .gsd at git root from subdirectory");
  } finally { cleanup(root); }
});

test("Case 3: .gsd in an ancestor — walk-up finds it", () => {
  const root = tmp();
  try {
    initGit(root);
    const project = join(root, "project");
    mkdirSync(join(project, ".gsd"), { recursive: true });
    const deep = join(project, "src", "deep");
    mkdirSync(deep, { recursive: true });
    _clearGsdRootCache();
    const result = gsdRoot(deep);
    assert.equal(result, join(project, ".gsd"), "walk-up: finds .gsd in ancestor when git root has none");
  } finally { cleanup(root); }
});

test("Case 4: .gsd nowhere — fallback returns basePath/.gsd", () => {
  const root = tmp();
  try {
    initGit(root);
    const sub = join(root, "src");
    mkdirSync(sub, { recursive: true });
    _clearGsdRootCache();
    const result = gsdRoot(sub);
    assert.equal(result, join(sub, ".gsd"), "fallback: returns basePath/.gsd when .gsd not found anywhere");
  } finally { cleanup(root); }
});

test("Case 5: cache — second call returns same value without re-probing", () => {
  const root = tmp();
  try {
    mkdirSync(join(root, ".gsd"));
    _clearGsdRootCache();
    const first = gsdRoot(root);
    const second = gsdRoot(root);
    assert.equal(first, second, "cache: same result returned on second call");
    assert.ok(first === second, "cache: identity check (same string)");
  } finally { cleanup(root); }
});

test("Case 6: git-root .gsd takes precedence over subdirectory .gsd (#2255)", () => {
  const outer = tmp();
  try {
    initGit(outer);
    mkdirSync(join(outer, ".gsd"));
    const inner = join(outer, "nested");
    mkdirSync(join(inner, ".gsd"), { recursive: true });
    _clearGsdRootCache();
    const result = gsdRoot(inner);
    assert.equal(result, join(outer, ".gsd"), "precedence: git-root .gsd wins over subdirectory .gsd");
  } finally { cleanup(outer); }
});

test("Case 7: subdirectory .gsd symlink does not shadow git-root .gsd (#2255)", () => {
  const outer = tmp();
  const emptyExternal = tmp();
  try {
    initGit(outer);
    mkdirSync(join(outer, ".gsd", "milestones"), { recursive: true });
    const sub = join(outer, "apps", "my_app", "scripts");
    mkdirSync(sub, { recursive: true });
    symlinkSync(emptyExternal, join(sub, ".gsd"), "junction");
    _clearGsdRootCache();
    const result = gsdRoot(sub);
    assert.equal(result, join(outer, ".gsd"), "subdirectory symlink: git-root .gsd wins over sub-dir symlink");
  } finally { cleanup(outer); cleanup(emptyExternal); }
});

test("Case 8: populated subdirectory symlink still loses to git-root .gsd (#2255)", () => {
  const outer = tmp();
  const populatedExternal = tmp();
  try {
    initGit(outer);
    mkdirSync(join(outer, ".gsd", "milestones", "M001"), { recursive: true });
    const sub = join(outer, "packages", "app");
    mkdirSync(sub, { recursive: true });
    mkdirSync(join(populatedExternal, "milestones", "M002"), { recursive: true });
    symlinkSync(populatedExternal, join(sub, ".gsd"), "junction");
    _clearGsdRootCache();
    const result = gsdRoot(sub);
    assert.equal(result, join(outer, ".gsd"), "populated subdirectory symlink: git-root .gsd still wins");
  } finally { cleanup(outer); cleanup(populatedExternal); }
});
