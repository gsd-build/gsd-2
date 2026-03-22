import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "./system-prompt.js";

const dummySkill = {
	name: "test-skill",
	description: "A test skill",
	filePath: "/tmp/test-skill/SKILL.md",
	baseDir: "/tmp/test-skill",
	source: "project",
	body: "# Test Skill\n",
	disableModelInvocation: false,
};

describe("buildSystemPrompt skill catalog gating", () => {
	// ----- default prompt path -----

	it("includes skills when Skill tool is present but read is absent (default prompt)", () => {
		const prompt = buildSystemPrompt({
			selectedTools: ["bash", "edit", "Skill"],
			skills: [dummySkill],
		});
		assert.ok(
			prompt.includes("<available_skills>"),
			"Expected <available_skills> when Skill tool is in selectedTools",
		);
	});

	it("includes skills when both read and Skill tools are present (default prompt)", () => {
		const prompt = buildSystemPrompt({
			selectedTools: ["read", "bash", "edit", "Skill"],
			skills: [dummySkill],
		});
		assert.ok(
			prompt.includes("<available_skills>"),
			"Expected <available_skills> when both read and Skill are present",
		);
	});

	it("omits skills when neither read nor Skill tool is present (default prompt)", () => {
		const prompt = buildSystemPrompt({
			selectedTools: ["bash", "edit"],
			skills: [dummySkill],
		});
		assert.ok(
			!prompt.includes("<available_skills>"),
			"Should not include skills when Skill tool is absent",
		);
	});

	// ----- custom prompt path -----

	it("includes skills when Skill tool is present but read is absent (custom prompt)", () => {
		const prompt = buildSystemPrompt({
			customPrompt: "You are a custom agent.",
			selectedTools: ["bash", "Skill"],
			skills: [dummySkill],
		});
		assert.ok(
			prompt.includes("<available_skills>"),
			"Expected <available_skills> in custom prompt when Skill tool is present",
		);
	});

	it("includes skills when both read and Skill tools are present (custom prompt)", () => {
		const prompt = buildSystemPrompt({
			customPrompt: "You are a custom agent.",
			selectedTools: ["read", "Skill"],
			skills: [dummySkill],
		});
		assert.ok(
			prompt.includes("<available_skills>"),
			"Expected <available_skills> in custom prompt when both read and Skill are present",
		);
	});

	it("omits skills when neither read nor Skill tool is present (custom prompt)", () => {
		const prompt = buildSystemPrompt({
			customPrompt: "You are a custom agent.",
			selectedTools: ["bash", "edit"],
			skills: [dummySkill],
		});
		assert.ok(
			!prompt.includes("<available_skills>"),
			"Should not include skills in custom prompt when Skill tool is absent",
		);
	});

	// ----- backward compat: no selectedTools means all defaults -----

	it("includes skills when selectedTools is undefined (defaults include read)", () => {
		const prompt = buildSystemPrompt({
			skills: [dummySkill],
		});
		assert.ok(
			prompt.includes("<available_skills>"),
			"Expected <available_skills> when selectedTools is undefined (defaults apply)",
		);
	});
});
