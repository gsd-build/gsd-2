import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { isAllowedBrowsePath, getAdditionalRoots } from "../browse-scope.ts";

describe("isAllowedBrowsePath", () => {
  const devRoot = "/Users/alice/dev";
  const home = "/Users/alice";

  test("allows devRoot itself", () => {
    assert.equal(
      isAllowedBrowsePath("/Users/alice/dev", { devRoot, home, additionalRoots: [] }),
      true,
    );
  });

  test("allows children of devRoot", () => {
    assert.equal(
      isAllowedBrowsePath("/Users/alice/dev/proj-a/src", { devRoot, home, additionalRoots: [] }),
      true,
    );
  });

  test("allows the direct parent of devRoot", () => {
    assert.equal(
      isAllowedBrowsePath("/Users/alice", { devRoot, home, additionalRoots: [] }),
      true,
    );
  });

  test("allows the user's home directory even when not the parent of devRoot", () => {
    const dr = "/opt/dev";
    assert.equal(
      isAllowedBrowsePath("/Users/alice", { devRoot: dr, home, additionalRoots: [] }),
      true,
    );
  });

  test("allows arbitrary descendants of home", () => {
    assert.equal(
      isAllowedBrowsePath("/Users/alice/Documents/Workspaces", { devRoot, home, additionalRoots: [] }),
      true,
    );
  });

  test("allows additional roots (e.g. /Volumes on macOS)", () => {
    assert.equal(
      isAllowedBrowsePath("/Volumes/ExtDisk/projects", {
        devRoot,
        home,
        additionalRoots: ["/Volumes"],
      }),
      true,
    );
  });

  test("rejects unrelated absolute paths", () => {
    assert.equal(
      isAllowedBrowsePath("/etc/passwd", { devRoot, home, additionalRoots: [] }),
      false,
    );
  });

  test("rejects paths that share a prefix string but are not a path child", () => {
    // /Users/alice-evil is not under /Users/alice — guard against startsWith pitfalls
    assert.equal(
      isAllowedBrowsePath("/Users/alice-evil/secret", { devRoot, home, additionalRoots: [] }),
      false,
    );
  });
});

describe("getAdditionalRoots", () => {
  test("includes /Volumes on darwin (macOS)", () => {
    const roots = getAdditionalRoots("darwin", () => true);
    assert.ok(roots.includes("/Volumes"), `expected /Volumes in ${JSON.stringify(roots)}`);
  });

  test("includes Linux mount points when they exist", () => {
    const roots = getAdditionalRoots("linux", (p) => p === "/media" || p === "/mnt");
    assert.ok(roots.includes("/media"));
    assert.ok(roots.includes("/mnt"));
    assert.ok(!roots.some((r) => r.startsWith("/run/media")));
  });

  test("scopes /run/media to the current user on Linux", () => {
    const roots = getAdditionalRoots("linux", () => true, "alice");
    assert.ok(roots.includes("/run/media/alice"));
    assert.ok(!roots.includes("/run/media"));
    assert.ok(!roots.includes("/run/media/bob"));
  });

  test("omits /run/media when no username is provided", () => {
    const roots = getAdditionalRoots("linux", () => true);
    assert.ok(!roots.some((r) => r.startsWith("/run/media")));
  });

  test("enumerates existing drive letters on win32", () => {
    const present = new Set(["C:\\", "D:\\"]);
    const roots = getAdditionalRoots("win32", (p) => present.has(p));
    assert.deepEqual(roots, ["C:\\", "D:\\"]);
  });

  test("returns an empty array on win32 when no drives exist", () => {
    assert.deepEqual(getAdditionalRoots("win32", () => false), []);
  });

  test("skips roots that do not exist", () => {
    const roots = getAdditionalRoots("darwin", () => false);
    assert.deepEqual(roots, []);
  });
});
