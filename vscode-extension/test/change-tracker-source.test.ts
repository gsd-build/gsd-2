import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dirname, "..", "src", "change-tracker.ts"), "utf8");
const extensionSource = readFileSync(join(import.meta.dirname, "..", "src", "extension.ts"), "utf8");

test("change tracker consumes RPC tool args and toolCallId fields", () => {
	assert.match(source, /evt\.args \?\? evt\.toolInput \?\? evt\.input/);
	assert.match(source, /evt\.toolCallId \?\? evt\.toolUseId/);
});

test("change tracker recognizes lowercase core write and edit tools", () => {
	assert.match(source, /toolName\.toLowerCase\(\)/);
	assert.match(source, /toolName === "write"/);
	assert.match(source, /toolName === "edit"/);
	assert.doesNotMatch(source, /toolName !== "Write" && toolName !== "Edit"/);
});

test("change tracker resolves relative tool paths from the workspace root", () => {
	assert.match(source, /path\.resolve\(this\.workspaceRoot, rawPath\)/);
	assert.match(extensionSource, /new GsdChangeTracker\(client, cwd\)/);
});

test("change tracker models new files as absent snapshots", () => {
	assert.match(source, /snapshots: Map<string, string \| null>/);
	assert.match(source, /this\.originals\.set\(filePath, null\)/);
	assert.match(source, /await fs\.promises\.rm\(filePath, \{ force: true \}\)/);
});

test("checkpoints capture current tracked file contents, not original session contents", () => {
	assert.match(source, /snapshots: this\.captureCurrentSnapshots\(\)/);
	assert.match(source, /fs\.readFileSync\(filePath, "utf8"\)/);
	assert.doesNotMatch(source, /snapshots: new Map\(this\.originals\)/);
});
