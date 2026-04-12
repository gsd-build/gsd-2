import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const autoPromptsPath = join(__dirname, "..", "auto-prompts.ts");

test("auto-prompts normalizes workingDirectory to POSIX paths", () => {
  const src = readFileSync(autoPromptsPath, "utf-8");

  const normalizedAssignments = src.match(/workingDirectory:\s*toPosixPath\(base\),/g) ?? [];
  const rawAssignments = src.match(/workingDirectory:\s*base,/g) ?? [];

  assert.equal(rawAssignments.length, 0, "workingDirectory should not use raw base paths");
  assert.ok(
    normalizedAssignments.length >= 10,
    "expected multiple workingDirectory assignments to be POSIX-normalized",
  );
});
