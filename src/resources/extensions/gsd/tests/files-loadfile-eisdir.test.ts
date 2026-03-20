import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { loadFile } from "../files.ts";

test("loadFile returns null for directory paths instead of throwing EISDIR", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-loadfile-eisdir-"));
  const dirPath = path.join(tmp, "tasks");
  fs.mkdirSync(dirPath);

  try {
    const result = await loadFile(dirPath);
    assert.equal(result, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
