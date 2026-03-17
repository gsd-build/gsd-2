import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { discoverAgents } from "../agents.js";

function createTempAgentDir(agents: Array<{ filename: string; content: string }>): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-test-"));
	const agentsDir = path.join(tmpDir, ".pi", "agents");
	fs.mkdirSync(agentsDir, { recursive: true });
	for (const agent of agents) {
		fs.writeFileSync(path.join(agentsDir, agent.filename), agent.content);
	}
	return tmpDir;
}

describe("agents.ts conflicts_with parsing", () => {
	it("parses conflicts_with from frontmatter", () => {
		const dir = createTempAgentDir([
			{
				filename: "planner.md",
				content: [
					"---",
					"name: planner",
					"description: Plans things",
					"conflicts_with: plan-milestone, plan-slice",
					"---",
					"You are a planner.",
				].join("\n"),
			},
		]);

		const result = discoverAgents(dir, "project");
		const planner = result.agents.find((a) => a.name === "planner");
		assert.ok(planner, "planner agent should be discovered");
		assert.deepStrictEqual(planner.conflictsWith, ["plan-milestone", "plan-slice"]);

		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("handles missing conflicts_with gracefully", () => {
		const dir = createTempAgentDir([
			{
				filename: "scout.md",
				content: [
					"---",
					"name: scout",
					"description: Explores codebases",
					"---",
					"You are a scout.",
				].join("\n"),
			},
		]);

		const result = discoverAgents(dir, "project");
		const scout = result.agents.find((a) => a.name === "scout");
		assert.ok(scout, "scout agent should be discovered");
		assert.equal(scout.conflictsWith, undefined);

		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("handles empty conflicts_with", () => {
		const dir = createTempAgentDir([
			{
				filename: "worker.md",
				content: [
					"---",
					"name: worker",
					"description: Does work",
					"conflicts_with: ",
					"---",
					"You are a worker.",
				].join("\n"),
			},
		]);

		const result = discoverAgents(dir, "project");
		const worker = result.agents.find((a) => a.name === "worker");
		assert.ok(worker, "worker agent should be discovered");
		assert.equal(worker.conflictsWith, undefined);

		fs.rmSync(dir, { recursive: true, force: true });
	});
});
