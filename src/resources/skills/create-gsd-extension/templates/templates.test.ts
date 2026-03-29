// GSD-2 — Extension template import path validation
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("extension templates use @gsd/* imports", () => {
	const templates = ["extension-skeleton.ts", "stateful-tool-skeleton.ts"];

	for (const template of templates) {
		it(`${template} uses @gsd/pi-coding-agent (not @mariozechner)`, () => {
			const content = readFileSync(join(__dirname, template), "utf-8");
			assert.ok(content.includes("@gsd/pi-coding-agent"), `Expected @gsd/pi-coding-agent import in ${template}`);
			assert.ok(!content.includes("@mariozechner/"), `Found stale @mariozechner/ import in ${template}`);
		});
	}

	it("extension-skeleton.ts uses @gsd/pi-ai for StringEnum", () => {
		const content = readFileSync(join(__dirname, "extension-skeleton.ts"), "utf-8");
		assert.ok(content.includes("@gsd/pi-ai"), "Expected @gsd/pi-ai import");
	});

	it("stateful-tool-skeleton.ts uses @gsd/pi-tui", () => {
		const content = readFileSync(join(__dirname, "stateful-tool-skeleton.ts"), "utf-8");
		assert.ok(content.includes("@gsd/pi-tui"), "Expected @gsd/pi-tui import");
	});
});
