import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from "node:fs";
import { join } from "node:path";

const srcPath = join(import.meta.dirname, "..", "auto-start.ts");
const src = readFileSync(srcPath, "utf-8");

test('#2841: cold DB opened before initial deriveState', () => {
  const helperIdx = src.indexOf("async function openProjectDbIfPresent");
  assert.ok(helperIdx >= 0, "auto-start.ts defines a helper for pre-derive DB open (#2841)");

  const helperRegion = helperIdx >= 0 ? src.slice(helperIdx, helperIdx + 500) : "";
  assert.ok(
    helperRegion.includes("resolveProjectRootDbPath(basePath)"),
    "pre-derive DB helper resolves the project-root DB path (#2841)",
  );
  assert.ok(
    helperRegion.includes("openDatabase(gsdDbPath)"),
    "pre-derive DB helper opens the resolved DB path (#2841)",
  );

  const firstDeriveIdx = src.indexOf("let state = await deriveState(base);");
  assert.ok(firstDeriveIdx > 0, "auto-start.ts has the initial deriveState(base) call");

  const preDeriveRegion = firstDeriveIdx > 0 ? src.slice(0, firstDeriveIdx) : "";
  const preDeriveOpenIdx = preDeriveRegion.lastIndexOf("await openProjectDbIfPresent(base);");

  assert.ok(
    preDeriveOpenIdx > 0,
    "bootstrapAutoSession opens the DB before the first deriveState(base) call (#2841)",
  );
});
