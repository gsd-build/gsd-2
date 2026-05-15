// GSD-2 + Repository registry seam tests.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepositoryRegistryFromPreferences } from "../repository-registry.ts";

test("repository registry includes implicit project root and declared child repos", (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-repo-registry-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  mkdirSync(join(base, "frontend"), { recursive: true });
  mkdirSync(join(base, "backend"), { recursive: true });

  const registry = createRepositoryRegistryFromPreferences(base, {
    workspace: {
      mode: "parent",
      repositories: {
        frontend: { path: "frontend", role: "web UI", verification: ["npm test"] },
        backend: { path: "./backend", role: "API", commit_policy: "skip" },
      },
    },
  });

  assert.equal(registry.mode, "parent");
  assert.equal(registry.projectRoot, base);
  assert.equal(registry.byId.get("project")?.root, base);
  assert.equal(registry.byId.get("frontend")?.root, join(base, "frontend"));
  assert.equal(registry.byId.get("backend")?.root, join(base, "backend"));
  assert.deepEqual(registry.byId.get("frontend")?.verification, ["npm test"]);
  assert.equal(registry.byId.get("backend")?.commitPolicy, "skip");
});

test("repository registry rejects repositories outside project root", (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-repo-registry-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  mkdirSync(join(base, ".gsd"), { recursive: true });

  assert.throws(
    () => createRepositoryRegistryFromPreferences(base, {
      workspace: {
        mode: "parent",
        repositories: {
          unsafe: { path: "../outside" },
        },
      },
    }),
    /outside project root/,
  );
});
