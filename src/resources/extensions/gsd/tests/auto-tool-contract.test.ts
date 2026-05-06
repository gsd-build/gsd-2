import test from "node:test";
import assert from "node:assert/strict";

import { compileUnitToolContract } from "../auto/tool-contract.js";

test("compileUnitToolContract compiles known units with manifest policy and required tools", async () => {
  const rows = [
    {
      unitType: "execute-task",
      unitId: "M001/S001/T001",
      preconditions: ["repo-clean", "deps-installed"],
      expectedToolsMode: "all",
      expectedSourceWrites: true,
      expectedTool: "gsd_task_complete",
    },
    {
      unitType: "complete-slice",
      unitId: "M001/S001",
      preconditions: ["all-tasks-closed"],
      expectedToolsMode: "planning-dispatch",
      expectedSourceWrites: false,
      expectedTool: "gsd_slice_complete",
    },
  ] as const;

  for (const row of rows) {
    const result = await compileUnitToolContract(row);
    assert.equal(result.allow, true, `${row.unitType} should compile`);
    assert.ok(result.contract, `${row.unitType} should return a contract`);
    assert.equal(result.contract!.toolsPolicy?.mode, row.expectedToolsMode);
    assert.equal(result.contract!.sourceWrites, row.expectedSourceWrites);
    assert.ok(result.contract!.requiredWorkflowTools.includes(row.expectedTool));
    assert.deepEqual(result.contract!.preconditions, row.preconditions, "preconditions should be preserved");
  }
});

test("compileUnitToolContract soft-allows unknown units with warnings", async () => {
  const result = await compileUnitToolContract({
    unitType: "future-unit-type",
    unitId: "U001",
    preconditions: ["x"],
  });

  assert.equal(result.allow, true);
  assert.ok(result.contract);
  assert.equal(result.contract!.toolsPolicy, null);
  assert.equal(result.contract!.sourceWrites, true);
  assert.deepEqual(result.contract!.requiredWorkflowTools, []);
  assert.equal(result.contract!.warnings.length, 1);
});

test("compileUnitToolContract blocks invalid identities", async () => {
  const result = await compileUnitToolContract({
    unitType: "",
    unitId: "",
    preconditions: [],
  });

  assert.equal(result.allow, false);
  assert.match(result.reason ?? "", /missing unitType or unitId/i);
});
