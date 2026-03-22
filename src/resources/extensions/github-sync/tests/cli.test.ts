import test, { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ghIsAvailable, _resetGhCache } from "../cli.ts";

describe("cli", () => {
  beforeEach(() => {
    _resetGhCache();
  });

  it("ghIsAvailable returns boolean", () => {
    const result = ghIsAvailable();
    assert.equal(typeof result, "boolean");
  });

  it("ghIsAvailable caches result", () => {
    const first = ghIsAvailable();
    const second = ghIsAvailable();
    assert.equal(first, second);
  });
});
