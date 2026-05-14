import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDiscussArgs as _parseDiscussArgsForTest } from "../commands/handlers/discuss-args.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));


  test("parses positional milestone and slice targets", () => {
    assert.deepEqual(_parseDiscussArgsForTest("M014"), { target: "M014", error: null });
    assert.deepEqual(_parseDiscussArgsForTest("M014/S03"), { target: "M014/S03", error: null });
  });

  test("parses --milestone and --slice flags", () => {
    assert.deepEqual(_parseDiscussArgsForTest("--milestone M014"), { target: "M014", error: null });
    assert.deepEqual(_parseDiscussArgsForTest("--slice M014/S03"), { target: "M014/S03", error: null });
  });

  test("guided flow exposes future/planned milestone action copy", () => {
    const src = readFileSync(join(__dirname, "..", "guided-flow.ts"), "utf-8");
    assert.match(src, /Discuss a future\/planned milestone/);
  });
});
