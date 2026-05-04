import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import {
  resolveBundledGsdExtensionModule,
  resolveBundledResourcesDirFromPackageRoot,
} from "../bundled-resource-path.ts";

test("partial dist/resources falls back to src/resources", () => {
  const pkg = "/pkg";
  const existing = new Set([
    join(pkg, "dist", "resources", "extensions"),
  ]);

  const result = resolveBundledResourcesDirFromPackageRoot(pkg, (p) => existing.has(p));

  assert.equal(result, join(pkg, "src", "resources"));
});

test("complete dist/resources is selected when expected roots exist", () => {
  const pkg = "/pkg";
  const existing = new Set([
    join(pkg, "dist", "resources", "agents"),
    join(pkg, "dist", "resources", "extensions"),
  ]);

  const result = resolveBundledResourcesDirFromPackageRoot(pkg, (p) => existing.has(p));

  assert.equal(result, join(pkg, "dist", "resources"));
});

test("GSD extension module resolution falls back to source when dist module is missing", () => {
  const pkg = "/pkg";
  const fakeImportUrl = `file://${join(pkg, "src", "worktree-cli.ts")}`;
  const existing = new Set([
    join(pkg, "dist", "resources", "agents"),
    join(pkg, "dist", "resources", "extensions"),
  ]);

  const result = resolveBundledGsdExtensionModule(
    fakeImportUrl,
    "worktree-root.ts",
    (p) => existing.has(p),
  );

  assert.equal(result, join(pkg, "src", "resources", "extensions", "gsd", "worktree-root.ts"));
});

test("GSD extension module resolution uses compiled dist module when available", () => {
  const pkg = "/pkg";
  const fakeImportUrl = `file://${join(pkg, "src", "worktree-cli.ts")}`;
  const existing = new Set([
    join(pkg, "dist", "resources", "agents"),
    join(pkg, "dist", "resources", "extensions"),
    join(pkg, "dist", "resources", "extensions", "gsd", "worktree-manager.js"),
  ]);

  const result = resolveBundledGsdExtensionModule(
    fakeImportUrl,
    "worktree-manager.ts",
    (p) => existing.has(p),
  );

  assert.equal(result, join(pkg, "dist", "resources", "extensions", "gsd", "worktree-manager.js"));
});
