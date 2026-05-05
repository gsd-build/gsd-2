import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { isAllowedBrowsePath } from "../directory-browser.ts";

describe("browse directory route authorization", () => {
  test("does not treat filesystem root shortcut as an authorization root", () => {
    const devRoot = "/home/user/project";
    const browseRoots = ["/", "/Volumes"];

    assert.equal(isAllowedBrowsePath("/home/user/project/src", devRoot, browseRoots), true);
    assert.equal(isAllowedBrowsePath("/home/user", devRoot, browseRoots), true);
    assert.equal(isAllowedBrowsePath("/Volumes/ExternalProject", devRoot, browseRoots), true);
    assert.equal(isAllowedBrowsePath("/", devRoot, browseRoots), true);
    assert.equal(isAllowedBrowsePath("/etc", devRoot, browseRoots), false);
  });
});
