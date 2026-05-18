// Project/App: GSD-2
// File Purpose: Regression tests for agent workflow trigger guard policy.

import assert from "node:assert/strict";
import test from "node:test";

import {
  findAllowedNonWriteUserExpansions,
  formatFindings,
} from "../workflow-non-write-users-check.mjs";

test("findAllowedNonWriteUserExpansions flags added non-write-user trigger config", () => {
  const findings = findAllowedNonWriteUserExpansions([
    {
      filename: ".github/workflows/agent.yml",
      patch: [
        "@@ -8,3 +8,5 @@",
        " with:",
        "+  allowed_non_write_users: \"*\"",
        "+  prompt: review",
      ].join("\n"),
    },
  ]);

  assert.deepEqual(findings, [
    {
      filename: ".github/workflows/agent.yml",
      line: 'allowed_non_write_users: "*"',
    },
  ]);
});

test("findAllowedNonWriteUserExpansions ignores removals and non-workflow files", () => {
  const findings = findAllowedNonWriteUserExpansions([
    {
      filename: ".github/workflows/agent.yml",
      patch: [
        "@@ -8,3 +8,2 @@",
        "-  allowed_non_write_users: \"*\"",
        "   prompt: review",
      ].join("\n"),
    },
    {
      filename: "docs/example.yml",
      patch: "+allowed_non_write_users: \"*\"",
    },
  ]);

  assert.equal(findings.length, 0);
});

test("formatFindings explains why the workflow guard blocks the PR", () => {
  const message = formatFindings([
    {
      filename: ".github/workflows/agent.yml",
      line: "allowed_non_write_users: team",
    },
  ]);

  assert.match(message, /expands non-write-user triggers/);
  assert.match(message, /\.github\/workflows\/agent\.yml/);
});
