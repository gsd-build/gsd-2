// Project/App: GSD-2
// File Purpose: Tests for opt-in GSD tool surface reduction.

import assert from "node:assert/strict";
import test from "node:test";

import { buildMinimalAutoGsdToolSet, buildMinimalGsdToolSet, buildMinimalGsdWorkflowToolSet, buildRequestScopedGsdToolSet, MINIMAL_AUTO_BASE_TOOL_NAMES, MINIMAL_GSD_TOOL_NAMES, restoreGsdWorkflowTools, scopeGsdWorkflowToolsForDispatch } from "../bootstrap/register-hooks.ts";

test("buildMinimalGsdToolSet preserves non-GSD tools and replaces broad GSD surface", () => {
  const result = buildMinimalGsdToolSet([
    "bash",
    "read",
    "browser_open",
    "gsd_plan_milestone",
    "gsd_task_complete",
    "gsd_exec",
    "gsd_exec_search",
    "gsd_resume",
    "gsd_milestone_status",
    "gsd_checkpoint_db",
    "memory_query",
    "capture_thought",
    "gsd_graph",
  ]);

  assert.ok(result.includes("bash"));
  assert.ok(result.includes("read"));
  assert.ok(result.includes("browser_open"));
  for (const toolName of MINIMAL_GSD_TOOL_NAMES) {
    assert.ok(result.includes(toolName), `expected ${toolName}`);
  }
  assert.ok(!result.includes("gsd_plan_milestone"));
  assert.ok(!result.includes("gsd_task_complete"));
  assert.ok(!result.includes("gsd_graph"));
});

test("buildMinimalGsdToolSet deduplicates preserved and minimal tools", () => {
  const result = buildMinimalGsdToolSet(["bash", "bash", "memory_query"]);

  assert.deepEqual(result.filter((toolName) => toolName === "bash"), ["bash"]);
  assert.deepEqual(result.filter((toolName) => toolName === "memory_query"), ["memory_query"]);
});

test("buildMinimalGsdToolSet does not reintroduce provider-filtered GSD tools", () => {
  const result = buildMinimalGsdToolSet(["bash", "read", "memory_query"]);

  assert.deepEqual(result, ["bash", "read", "memory_query"]);
  assert.ok(!result.includes("gsd_exec"));
});

test("buildMinimalAutoGsdToolSet keeps unit-specific completion tools without aliases", () => {
  const result = buildMinimalAutoGsdToolSet([
    "ask_user_questions",
    "bash",
    "read",
    "lsp",
    "browser_click",
    "gsd_task_complete",
    "gsd_complete_task",
    "gsd_exec",
    "gsd_exec_search",
    "gsd_resume",
    "gsd_milestone_status",
    "gsd_checkpoint_db",
    "gsd_slice_complete",
    "gsd_complete_slice",
    "memory_query",
    "capture_thought",
  ], "execute-task");

  assert.ok(result.includes("ask_user_questions"));
  assert.ok(result.includes("bash"));
  assert.ok(result.includes("read"));
  assert.ok(result.includes("gsd_task_complete"));
  assert.ok(result.includes("memory_query"));
  assert.ok(!result.includes("lsp"));
  assert.ok(!result.includes("browser_click"));
  assert.ok(!result.includes("gsd_complete_task"));
  assert.ok(!result.includes("gsd_slice_complete"));
  assert.ok(!result.includes("gsd_complete_slice"));
});

test("buildMinimalAutoGsdToolSet keeps only the auto base non-GSD tools", () => {
  const result = buildMinimalAutoGsdToolSet([
    "ask_user_questions",
    "bash",
    "bg_shell",
    "browser_wait_for",
    "edit",
    "glob",
    "grep",
    "lsp",
    "ls",
    "mac_find",
    "read",
    "subagent",
    "write",
    "gsd_exec",
    "gsd_exec_search",
    "gsd_resume",
    "gsd_milestone_status",
    "gsd_checkpoint_db",
    "memory_query",
    "capture_thought",
  ], "execute-task");

  for (const toolName of MINIMAL_AUTO_BASE_TOOL_NAMES) {
    assert.ok(result.includes(toolName), `expected ${toolName}`);
  }
  assert.ok(!result.includes("browser_wait_for"));
  assert.ok(!result.includes("lsp"));
  assert.ok(!result.includes("mac_find"));
  assert.ok(!result.includes("subagent"));
});

test("buildMinimalAutoGsdToolSet includes closeout tool for complete-slice", () => {
  const result = buildMinimalAutoGsdToolSet([
    "bash",
    "read",
    "subagent",
    "gsd_exec",
    "gsd_exec_search",
    "gsd_resume",
    "gsd_milestone_status",
    "gsd_checkpoint_db",
    "gsd_task_complete",
    "gsd_slice_complete",
    "gsd_complete_slice",
    "memory_query",
    "capture_thought",
  ], "complete-slice");

  assert.ok(result.includes("gsd_slice_complete"));
  assert.ok(result.includes("subagent"));
  assert.ok(result.includes("capture_thought"));
  assert.ok(!result.includes("gsd_task_complete"));
  assert.ok(!result.includes("gsd_complete_slice"));
});

test("buildMinimalAutoGsdToolSet covers execute-task-simple", () => {
  const result = buildMinimalAutoGsdToolSet([
    "bash",
    "read",
    "gsd_task_complete",
    "gsd_decision_save",
    "gsd_plan_task",
    "memory_query",
    "capture_thought",
  ], "execute-task-simple");

  assert.ok(result.includes("gsd_task_complete"));
  assert.ok(result.includes("gsd_decision_save"));
  assert.ok(!result.includes("gsd_plan_task"));
});

test("buildMinimalGsdWorkflowToolSet keeps workflow GSD tools but drops broad non-GSD tools", () => {
  const result = buildMinimalGsdWorkflowToolSet([
    "ask_user_questions",
    "bash",
    "bg_shell",
    "browser_wait_for",
    "edit",
    "lsp",
    "mac_find",
    "read",
    "subagent",
    "write",
    "gsd_plan_milestone",
    "gsd_complete_milestone",
    "gsd_task_complete",
    "gsd_summary_save",
    "memory_query",
    "capture_thought",
    "gsd_exec",
    "gsd_exec_search",
    "gsd_resume",
    "gsd_milestone_status",
    "gsd_checkpoint_db",
    "gsd_graph",
  ]);

  assert.ok(result.includes("ask_user_questions"));
  assert.ok(result.includes("bash"));
  assert.ok(result.includes("bg_shell"));
  assert.ok(result.includes("read"));
  assert.ok(result.includes("write"));
  assert.ok(result.includes("gsd_plan_milestone"));
  assert.ok(result.includes("gsd_complete_milestone"));
  assert.ok(result.includes("gsd_task_complete"));
  assert.ok(result.includes("gsd_summary_save"));
  assert.ok(!result.includes("browser_wait_for"));
  assert.ok(!result.includes("lsp"));
  assert.ok(!result.includes("mac_find"));
  assert.ok(!result.includes("subagent"));
  assert.ok(!result.includes("gsd_graph"));
});

test("buildRequestScopedGsdToolSet scopes queued workflow custom-message requests", () => {
  const result = buildRequestScopedGsdToolSet([
    "ask_user_questions",
    "bash",
    "browser_wait_for",
    "lsp",
    "read",
    "write",
    "gsd_plan_milestone",
    "gsd_complete_milestone",
    "gsd_task_complete",
    "gsd_graph",
    "memory_query",
    "capture_thought",
  ], [{ customType: "gsd-run" }, { customType: "gsd-memory" }]);

  assert.ok(result);
  assert.ok(result.includes("ask_user_questions"));
  assert.ok(result.includes("bash"));
  assert.ok(result.includes("read"));
  assert.ok(result.includes("write"));
  assert.ok(result.includes("gsd_plan_milestone"));
  assert.ok(result.includes("gsd_complete_milestone"));
  assert.ok(!result.includes("browser_wait_for"));
  assert.ok(!result.includes("lsp"));
  assert.ok(!result.includes("gsd_graph"));
});

test("buildRequestScopedGsdToolSet ignores stale workflow messages outside the current request tail", () => {
  assert.equal(buildRequestScopedGsdToolSet(["bash", "gsd_plan_milestone"], []), undefined);
});

test("scopeGsdWorkflowToolsForDispatch applies and restores per-unit skill visibility", () => {
  const calls: Array<{ kind: "tools" | "skills"; value: string[] | undefined }> = [];
  let activeTools = [
    "bash",
    "read",
    "lsp",
    "gsd_plan_milestone",
    "gsd_decision_save",
    "memory_query",
    "capture_thought",
  ];
  let visibleSkills: string[] | undefined = ["previous-skill"];

  const state = scopeGsdWorkflowToolsForDispatch({
    getActiveTools: () => activeTools,
    setActiveTools: (names) => {
      activeTools = names;
      calls.push({ kind: "tools", value: names });
    },
    getVisibleSkills: () => visibleSkills,
    setVisibleSkills: (names) => {
      visibleSkills = names;
      calls.push({ kind: "skills", value: names });
    },
  }, "plan-milestone");

  assert.ok(state);
  assert.deepEqual(visibleSkills, [
    "write-milestone-brief",
    "decompose-into-slices",
    "design-an-interface",
    "grill-me",
    "write-docs",
    "api-design",
    "tdd",
    "verify-before-complete",
  ]);
  assert.ok(!activeTools.includes("lsp"));

  restoreGsdWorkflowTools({
    setActiveTools: (names) => {
      activeTools = names;
      calls.push({ kind: "tools", value: names });
    },
    setVisibleSkills: (names) => {
      visibleSkills = names;
      calls.push({ kind: "skills", value: names });
    },
  }, state);

  assert.deepEqual(activeTools, [
    "bash",
    "read",
    "lsp",
    "gsd_plan_milestone",
    "gsd_decision_save",
    "memory_query",
    "capture_thought",
  ]);
  assert.deepEqual(visibleSkills, ["previous-skill"]);
  assert.equal(calls.filter((call) => call.kind === "skills").length, 2);
});
