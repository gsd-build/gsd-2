import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTO_TS_PATH = join(__dirname, "..", "auto.ts");

function getAutoTsSource(): string {
  return readFileSync(AUTO_TS_PATH, "utf-8");
}

test("pauseAuto marks paused before abort and awaits abort completion", () => {
  const source = getAutoTsSource();
  const fnStart = source.indexOf("export async function pauseAuto");
  assert.ok(fnStart > -1, "pauseAuto must exist in auto.ts");

  const fnBody = source.slice(fnStart, source.indexOf("\n/**", fnStart + 100));
  const setActiveIdx = fnBody.indexOf("s.active = false;");
  const setPausedIdx = fnBody.indexOf("s.paused = true;");
  const abortIdx = fnBody.indexOf("await Promise.resolve(ctx.abort())");

  assert.ok(setActiveIdx > -1, "pauseAuto must set s.active = false");
  assert.ok(setPausedIdx > -1, "pauseAuto must set s.paused = true");
  assert.ok(abortIdx > -1, "pauseAuto must await abort completion");
  assert.ok(
    setActiveIdx < abortIdx && setPausedIdx < abortIdx,
    "pauseAuto must mark paused before awaiting abort to avoid re-entrant pause handling",
  );
});
