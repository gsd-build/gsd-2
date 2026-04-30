import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { createRootShortcuts, pathDisplayName } from "../directory-browser.ts";

describe("directory browser shortcuts", () => {
  test("labels filesystem root explicitly", () => {
    assert.equal(pathDisplayName("/"), "Filesystem Root");
  });

  test("labels absolute mount paths by basename", () => {
    assert.equal(pathDisplayName("/Volumes"), "Volumes");
    assert.equal(pathDisplayName("/mnt/"), "mnt");
  });

  test("creates deduplicated root shortcuts", () => {
    assert.deepEqual(createRootShortcuts(["/", "/Volumes", "/Volumes"]), [
      { name: "Filesystem Root", path: "/" },
      { name: "Volumes", path: "/Volumes" },
    ]);
  });
});
