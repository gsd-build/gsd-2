// Project/App: GSD-2
// File Purpose: Tests for interactive terminal tool execution rendering.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import stripAnsi from "strip-ansi";
import { ToolExecutionComponent, ToolPhaseSummaryComponent, type ToolExecutionPhase } from "../tool-execution.js";
import { initTheme } from "../../theme/theme.js";

initTheme("dark", false);

function renderTool(
	toolName: string,
	args: Record<string, unknown>,
	result?: {
		content: Array<{ type: string; text?: string }>;
		isError: boolean;
		details?: Record<string, unknown>;
	},
	toolDefinition?: { label?: string; renderCall?: (...args: any[]) => any; renderResult?: (...args: any[]) => any },
): string {
	const component = new ToolExecutionComponent(
		toolName,
		args,
		{},
		toolDefinition as any,
		{ requestRender() {} } as any,
	);
	component.setExpanded(true);
	if (result) component.updateResult(result);
	return stripAnsi(component.render(120).join("\n"));
}

function renderToolCollapsed(
	toolName: string,
	args: Record<string, unknown>,
	result?: {
		content: Array<{ type: string; text?: string }>;
		isError: boolean;
		details?: Record<string, unknown>;
	},
	toolDefinition?: { label?: string; renderCall?: (...args: any[]) => any; renderResult?: (...args: any[]) => any },
): string {
	const component = new ToolExecutionComponent(
		toolName,
		args,
		{},
		toolDefinition as any,
		{ requestRender() {} } as any,
	);
	if (result) component.updateResult(result);
	return stripAnsi(component.render(120).join("\n"));
}

describe("ToolExecutionComponent", () => {
	test("renders framed header with running status while tool is partial", () => {
		const rendered = renderToolCollapsed("mcp__demo__do_thing", { ok: true });

		assert.match(rendered, /demo\u00b7do_thing/);
		assert.doesNotMatch(rendered, /Tool demo\u00b7do_thing/);
		assert.match(rendered, /running/);
		assert.match(rendered, /running · \d+(ms|s)/);
	});

	test("does not duplicate running generic tool labels before args", () => {
		const rendered = renderToolCollapsed(
			"Agent",
			{
				description: "Scout habit tracker codebase",
				subagent_type: "Explore",
				prompt: "Read these files and give me a concise summary of each.",
			},
		);

		const labelMatches = rendered.match(/Agent/g) ?? [];
		assert.equal(labelMatches.length, 1, `expected only the card title to contain Agent:\n${rendered}`);
		assert.doesNotMatch(rendered, /description="Scout habit tracker codebase"/);
		assert.doesNotMatch(rendered, /subagent_type="Explore"/);
		assert.match(rendered, /running · \d+(ms|s)/);
	});

	test("renders framed header with failed status for failed tool result", () => {
		const rendered = renderTool(
			"mcp__demo__do_thing",
			{ ok: true },
			{ content: [{ type: "text", text: "boom" }], isError: true },
		);

		assert.match(rendered, /demo\u00b7do_thing/);
		assert.doesNotMatch(rendered, /Tool demo\u00b7do_thing/);
		assert.match(rendered, /failed/);
		assert.match(rendered, /failed · \d+(ms|s)/);
		assert.match(rendered, /boom/);
	});

	test("collapses successful low-signal tool cards by default", () => {
		const rendered = renderToolCollapsed(
			"mcp__demo__noop",
			{ ok: true },
			{ content: [], isError: false },
		);

		assert.match(rendered, /success · \d+(ms|s)/);
		assert.match(rendered, /demo\u00b7noop/);
		assert.doesNotMatch(rendered, /Completed/);
		assert.doesNotMatch(rendered, /ok=true/);
	});

	test("does not duplicate generic tool labels in collapsed cards", () => {
		const rendered = renderToolCollapsed(
			"TodoWrite",
			{ todos: [{ content: "Ship it", status: "pending" }] },
			{ content: [{ type: "text", text: "TodoWrite" }], isError: false },
		);

		const labelMatches = rendered.match(/TodoWrite/g) ?? [];
		assert.equal(labelMatches.length, 1, `expected only the card title to contain TodoWrite:\n${rendered}`);
		assert.match(rendered, /output hidden/);
		assert.match(rendered, /ctrl\+o expand/);
	});

	test("exposes phase metadata for successful low-signal tool rows", () => {
		const component = new ToolExecutionComponent(
			"gsd_requirement_update",
			{ id: "R001" },
			{},
			{ label: "Update Requirement" } as any,
			{ requestRender() {} } as any,
		);
		component.updateResult({ content: [], isError: false });

		assert.deepEqual(component.getRollupPhase()?.label, "Requirement writes");
	});

	test("exposes phase metadata for collapsed output-bearing generic tools", () => {
		const component = new ToolExecutionComponent(
			"mcp__demo__do_thing",
			{ ok: true },
			{},
			undefined,
			{ requestRender() {} } as any,
		);
		component.updateResult({ content: [{ type: "text", text: "important output" }], isError: false });

		assert.deepEqual(component.getRollupPhase()?.label, "Other tool actions");
	});

	test("renders compact read rows with target metadata", () => {
		const rendered = renderToolCollapsed(
			"read",
			{ path: "src/Inspector.tsx" },
			{
				content: [{ type: "text", text: "source" }],
				isError: false,
				details: {
					target: {
						kind: "file",
						action: "read",
						inputPath: "src/Inspector.tsx",
						resolvedPath: "/tmp/project/src/Inspector.tsx",
						range: { start: 4, end: 12 },
					},
				},
			},
		);

		assert.match(rendered, /Read/);
		assert.match(rendered, /src\/Inspector\.tsx:4-12/);
		assert.doesNotMatch(rendered, /source/);
		assert.doesNotMatch(rendered, /output hidden\n\s*│\s*ctrl\+o expand/);
	});

	test("renders compact capitalized read rows from file_path args", () => {
		const rendered = renderToolCollapsed(
			"Read",
			{ file_path: "~/Github/gsd-2/src/resources/extensions/gsd/health-widget-core.ts" },
			{ content: [{ type: "text", text: "hidden body output" }], isError: false },
		);

		assert.match(rendered, /Read/);
		assert.match(rendered, /health-widget-core\.ts/);
		assert.doesNotMatch(rendered, /hidden body output/);
	});

	test("renders compact read rows from direct result details path", () => {
		const rendered = renderToolCollapsed(
			"read",
			{},
			{
				content: [{ type: "text", text: "hidden body output" }],
				isError: false,
				details: {
					path: "/tmp/project/src/resources/extensions/gsd/health-widget-core.ts",
					range: { start: 1, end: 12 },
				},
			},
		);

		assert.match(rendered, /Read/);
		assert.match(rendered, /health-widget-core\.ts:1-12/);
		assert.doesNotMatch(rendered, /hidden body output/);
	});

	test("renders compact edit rows with target metadata", () => {
		const rendered = renderToolCollapsed(
			"edit",
			{ path: "src/Inspector.tsx" },
			{
				content: [{ type: "text", text: "Updated src/Inspector.tsx" }],
				isError: false,
				details: {
					target: {
						kind: "file",
						action: "edit",
						inputPath: "src/Inspector.tsx",
						resolvedPath: "/tmp/project/src/Inspector.tsx",
						line: 42,
					},
				},
			},
		);

		assert.match(rendered, /Edit/);
		assert.match(rendered, /src\/Inspector\.tsx:42/);
		assert.doesNotMatch(rendered, /Updated src\/Inspector\.tsx/);
	});

	test("renders running edit rows with title and target on the top line", () => {
		const rendered = renderToolCollapsed("edit", { path: "src/Inspector.tsx" });

		const labelMatches = rendered.match(/Edit/g) ?? [];
		assert.equal(labelMatches.length, 1, `expected tool name only in the card title:\n${rendered}`);
		assert.match(rendered, /src\/Inspector\.tsx/);
		assert.match(rendered, /Edit src\/Inspector\.tsx/);
		assert.match(rendered, /running · \d+(ms|s)/);
	});

	test("renders compact write rows with target metadata", () => {
		const rendered = renderToolCollapsed(
			"write",
			{ path: "src/output.ts", content: "ok" },
			{
				content: [{ type: "text", text: "Successfully wrote 2 bytes to src/output.ts" }],
				isError: false,
				details: {
					target: {
						kind: "file",
						action: "write",
						inputPath: "src/output.ts",
						resolvedPath: "/tmp/project/src/output.ts",
					},
				},
			},
		);

		assert.match(rendered, /Write/);
		assert.match(rendered, /src\/output\.ts/);
		assert.doesNotMatch(rendered, /Successfully wrote/);
	});

	test("omits default cwd placeholders for collapsed search tools", () => {
		const rendered = renderToolCollapsed(
			"Grep",
			{},
			{ content: [{ type: "text", text: "hidden body output" }], isError: false },
		);

		assert.match(rendered, /Grep/);
		assert.doesNotMatch(rendered, /^│\.\s+│/m, `expected no placeholder cwd body:\n${rendered}`);
		assert.match(rendered, /output hidden/);
		assert.doesNotMatch(rendered, /hidden body output/);
		assert.doesNotMatch(rendered, /^│\s+output hidden/m, `expected compact footer text on the top row:\n${rendered}`);
	});

	test("keeps meaningful collapsed search targets", () => {
		const rendered = renderToolCollapsed(
			"Grep",
			{ pattern: "Project Initialized", path: "src/resources/extensions/gsd", glob: "*.ts" },
			{ content: [{ type: "text", text: "hidden body output" }], isError: false },
		);

		assert.match(rendered, /Project Initialized in src\/resources\/extensions\/gsd \(\*\.ts\)/);
		assert.doesNotMatch(rendered, /hidden body output/);
	});

	test("renders compact bash rows with command preview", () => {
		const rendered = renderToolCollapsed(
			"bash",
			{ command: "npm run typecheck -- --watch false" },
			{ content: [{ type: "text", text: "ok" }], isError: false, details: { cwd: "/tmp/project" } },
		);

		assert.match(rendered, /\$ npm run typecheck -- --watch false/);
		assert.doesNotMatch(rendered, /├/, "collapsed command cards should not include internal divider lines");
		assert.doesNotMatch(rendered, /\bok\b/);
	});

	test("keeps failed tools expanded and error visible", () => {
		const rendered = renderToolCollapsed(
			"edit",
			{ path: "src/Inspector.tsx" },
			{
				content: [{ type: "text", text: "Could not find target text" }],
				isError: true,
				details: {
					target: {
						kind: "file",
						action: "edit",
						inputPath: "src/Inspector.tsx",
						resolvedPath: "/tmp/project/src/Inspector.tsx",
					},
				},
			},
		);

		assert.match(rendered, /Could not find target text/);
		assert.match(rendered, /edit/);
	});

	test("renders phase-based summaries for rolled-up tool executions", () => {
		const phases: ToolExecutionPhase[] = [
			{ label: "Setup / shell", count: 6, durationMs: 12 },
			{
				label: "Context reads",
				count: 4,
				durationMs: 6,
				actionLabel: "read",
				targets: ["/tmp/project/src/a.ts", "/tmp/project/src/b.ts"],
			},
			{
				label: "File changes",
				count: 3,
				durationMs: 5,
				actionLabel: "edit",
				targets: ["/tmp/project/src/Inspector.tsx:42", "/tmp/project/src/CompareView.tsx:8"],
			},
			{ label: "Requirement writes", count: 4, durationMs: 4 },
			{ label: "Memory lookups", count: 4, durationMs: 4 },
			{ label: "Finalization", count: 1, durationMs: 1 },
		];
		const rendered = stripAnsi(new ToolPhaseSummaryComponent(phases).render(120).join("\n"));

		assert.match(rendered, /Setup \/ shell 6 actions\s+success · 12ms/);
		assert.match(rendered, /Context reads · 2 files\s+success · 6ms/);
		assert.match(rendered, /src\/a\.ts/);
		assert.match(rendered, /File changes · 2 files, 3 edits\s+success · 5ms/);
		assert.match(rendered, /src\/Inspector\.tsx:42/);
		assert.match(rendered, /Requirement writes 4 actions\s+success · 4ms/);
		assert.match(rendered, /Memory lookups 4 actions\s+success · 4ms/);
		assert.match(rendered, /Finalization 1 action\s+success · 1ms/);
	});

	test("passes failed result status to custom result renderers", () => {
		const rendered = renderTool(
			"gsd_requirement_save",
			{ id: "R001" },
			{ content: [{ type: "text", text: "saved" }], isError: true },
			{
				label: "Save Requirement",
				renderResult(result: { isError?: boolean }) {
					return {
						render: () => [result.isError ? "custom saw error" : "custom saw success"],
						invalidate() {},
					};
				},
			},
		);

		assert.match(rendered, /failed/);
		assert.match(rendered, /custom saw error/);
		assert.doesNotMatch(rendered, /custom saw success/);
	});

	test("renders capitalized Claude Code Bash tool names with bash output instead of generic args JSON", () => {
		const rendered = renderTool(
			"Bash",
			{ command: "pwd" },
			{ content: [{ type: "text", text: "/tmp/gsd-pr-fix" }], isError: false },
		);

		assert.match(rendered, /\$ pwd/);
		assert.match(rendered, /\/tmp\/gsd-pr-fix/);
		assert.doesNotMatch(rendered, /^\{\s*\}$/m);
	});

	test("renders capitalized Claude Code Read tool names with read output", () => {
		const rendered = renderTool(
			"Read",
			{ path: "/tmp/demo.txt" },
			{ content: [{ type: "text", text: "hello\nworld" }], isError: false },
		);

		assert.match(rendered, /read .*demo\.txt/);
		assert.match(rendered, /hello/);
		assert.match(rendered, /world/);
	});

	test("generic fallback strips mcp__<server>__ prefix and shows server·tool title", () => {
		const rendered = renderTool(
			"mcp__context7__resolve_library_id",
			{ name: "react" },
			{ content: [{ type: "text", text: "react@18.3.1" }], isError: false },
		);

		assert.match(rendered, /context7\u00b7resolve_library_id/);
		assert.doesNotMatch(rendered, /mcp__/);
		assert.match(rendered, /name="react"/);
		assert.match(rendered, /react@18\.3\.1/);
	});

	test("generic fallback renders compact key=value args for primitive args", () => {
		const rendered = renderTool(
			"some_unknown_tool",
			{ count: 3, enabled: true, label: "hello" },
		);

		assert.match(rendered, /Some Unknown Tool/);
		assert.match(rendered, /count=3/);
		assert.match(rendered, /enabled=true/);
		assert.match(rendered, /label="hello"/);
		assert.doesNotMatch(rendered, /^\{$/m);
	});

	test("frame header prefers toolDefinition.label over raw tool name", () => {
		const rendered = renderToolCollapsed(
			"gsd_slice_complete",
			{ sliceId: "S03" },
			undefined,
			{ label: "Complete Slice" },
		);

		assert.match(rendered, /Complete Slice/);
		assert.doesNotMatch(rendered, /Tool Complete Slice/);
		assert.doesNotMatch(rendered, /gsd_slice_complete/);
	});

	test("frame header strips gsd_ prefix and title-cases when no label is registered", () => {
		const rendered = renderToolCollapsed("gsd_requirement_update", { id: "R005" });

		assert.match(rendered, /Requirement Update/);
		assert.doesNotMatch(rendered, /Tool Requirement Update/);
		assert.doesNotMatch(rendered, /gsd_requirement_update/);
	});

	test("collapsed generic running tools hide primitive args", () => {
		const longPath = "/Users/alice/.gsd/projects/4dce7b775013/worktrees/slice-S03-some-long-path-that-exceeds-limit";
		const rendered = renderToolCollapsed("gsd_slice_complete", {
			sliceId: "S03",
			milestoneId: "M001",
			worktree: longPath,
		});

		assert.match(rendered, /Slice Complete/);
		assert.match(rendered, /running · \d+(ms|s)/);
		assert.doesNotMatch(rendered, /sliceId="S03"/);
		assert.doesNotMatch(rendered, /milestoneId="M001"/);
		assert.doesNotMatch(rendered, /worktree=/);
		assert.doesNotMatch(rendered, /"sliceId":\s*"S03"/);
	});

	test("formatCompactArgs shows full string values when expanded", () => {
		const longPath = "/Users/alice/.gsd/projects/4dce7b775013/worktrees/slice-S03-some-long-path-that-exceeds-limit";
		const rendered = renderTool("gsd_slice_complete", {
			sliceId: "S03",
			worktree: longPath,
		});

		assert.match(rendered, new RegExp(longPath.replace(/\//g, "\\/")));
		assert.doesNotMatch(rendered, /…/);
	});

	test("generic fallback collapses successful output rows until expanded", () => {
		const longOutput = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join("\n");
		const rendered = renderToolCollapsed(
			"mcp__demo__do_thing",
			{ ok: true },
			{ content: [{ type: "text", text: longOutput }], isError: false },
		);

		assert.match(rendered, /demo\u00b7do_thing/);
		assert.match(rendered, /success · \d+(ms|s)/);
		assert.doesNotMatch(rendered, /line 1\b/);
		assert.doesNotMatch(rendered, /\(15 more lines/);
	});

	test("generic fallback falls back to truncated JSON for complex args", () => {
		const rendered = renderTool(
			"mcp__demo__nested",
			{ payload: { nested: { deeply: ["a", "b", "c"] } }, name: "x" },
		);

		assert.match(rendered, /demo\u00b7nested/);
		// Multi-line JSON dump for the complex payload
		assert.match(rendered, /"payload"/);
		assert.match(rendered, /"nested"/);
	});
});
