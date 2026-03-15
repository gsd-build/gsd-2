import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	computeEditDiff,
	fuzzyFindText,
	generateDiffString,
	normalizeForFuzzyMatch,
} from "./edit-diff.ts";

describe("edit-diff", () => {
	it("normalizes quotes, dashes, spaces, and trailing whitespace", () => {
		const input = "“hello”\u00A0world — test  \nnext\t\t\n";
		assert.equal(normalizeForFuzzyMatch(input), "\"hello\" world - test\nnext\n");
	});

	it("falls back to fuzzy matching when unicode punctuation differs", () => {
		const result = fuzzyFindText("const title = “Hello”;\n", "const title = \"Hello\";\n");
		assert.equal(result.found, true);
		assert.equal(result.usedFuzzyMatch, true);
		assert.equal(result.contentForReplacement, "const title = \"Hello\";\n");
	});

	it("renders numbered diffs with the first changed line", () => {
		const result = generateDiffString("line 1\nline 2\nline 3\n", "line 1\nline two\nline 3\n");
		assert.equal(result.firstChangedLine, 2);
		assert.match(result.diff, /-2 line 2/);
		assert.match(result.diff, /\+2 line two/);
	});

	it("computes diffs for preview without native helpers", async () => {
		const dir = mkdtempSync(join(tmpdir(), "edit-diff-test-"));
		try {
			const file = join(dir, "sample.ts");
			writeFileSync(file, "const title = “Hello”;\n", "utf-8");

			const result = await computeEditDiff(
				file,
				"const title = \"Hello\";\n",
				"const title = \"Hi\";\n",
				dir,
			);

			assert.ok(!("error" in result), "expected a diff result");
			if (!("error" in result)) {
				assert.equal(result.firstChangedLine, 1);
				assert.match(result.diff, /\+1 const title = "Hi";/);
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
