import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { processStreamChunk } from "@gsd/native/stream-process";

const require_ = createRequire(import.meta.url);
const { native } = require_("../../dist/native.js");

describe("processStreamChunk", () => {
  test("processes a single chunk without state", () => {
    const result = processStreamChunk(Buffer.from("hello world\n"));
    assert.equal(result.text, "hello world\n");
    assert.ok(Array.isArray(result.state.utf8Pending));
    assert.ok(Array.isArray(result.state.ansiPending));
  });

  test("processes multiple chunks passing state between calls", () => {
    const result1 = processStreamChunk(Buffer.from("first\n"));
    assert.equal(result1.text, "first\n");

    // This was the crash: passing state back caused
    // "Given napi value is not an array on StreamState.utf8Pending"
    // when state arrays were wrapped in Buffer.from() instead of Array.from()
    const result2 = processStreamChunk(Buffer.from("second\n"), result1.state);
    assert.equal(result2.text, "second\n");

    const result3 = processStreamChunk(Buffer.from("third\n"), result2.state);
    assert.equal(result3.text, "third\n");
  });

  test("state fields are plain arrays, not Buffers", () => {
    const result = processStreamChunk(Buffer.from("test\n"));
    assert.ok(Array.isArray(result.state.utf8Pending), "utf8Pending should be a plain array");
    assert.ok(Array.isArray(result.state.ansiPending), "ansiPending should be a plain array");
    assert.ok(!(result.state.utf8Pending instanceof Buffer), "utf8Pending should not be a Buffer");
    assert.ok(!(result.state.ansiPending instanceof Buffer), "ansiPending should not be a Buffer");
  });

  test("falls back when the native stream symbol is missing", () => {
    const original = native.processStreamChunk;
    native.processStreamChunk = undefined;
    try {
      const result = processStreamChunk(Buffer.from("\x1b[32mgreen\x1b[0m\n"));
      assert.equal(result.text, "green\n");
      assert.deepEqual(result.state, { utf8Pending: [], ansiPending: [] });
    } finally {
      native.processStreamChunk = original;
    }
  });

  test("fallback carries split ANSI sequences across chunks", () => {
    const original = native.processStreamChunk;
    native.processStreamChunk = undefined;
    try {
      const first = processStreamChunk(Buffer.from("\x1b[31"));
      assert.equal(first.text, "");
      assert.ok(first.state.ansiPending.length > 0);

      const second = processStreamChunk(
        Buffer.from("mOK\x1b[0m\n"),
        first.state,
      );
      assert.equal(second.text, "OK\n");
      assert.deepEqual(second.state, { utf8Pending: [], ansiPending: [] });
    } finally {
      native.processStreamChunk = original;
    }
  });

  test("fallback carries split UTF-8 sequences across chunks", () => {
    const original = native.processStreamChunk;
    native.processStreamChunk = undefined;
    try {
      const check = Buffer.from("✓");
      const first = processStreamChunk(
        Buffer.concat([Buffer.from("OK "), check.subarray(0, 1)]),
      );
      assert.equal(first.text, "OK ");
      assert.ok(first.state.utf8Pending.length > 0);

      const second = processStreamChunk(check.subarray(1), first.state);
      assert.equal(second.text, "✓");
      assert.deepEqual(second.state, { utf8Pending: [], ansiPending: [] });
    } finally {
      native.processStreamChunk = original;
    }
  });
});
