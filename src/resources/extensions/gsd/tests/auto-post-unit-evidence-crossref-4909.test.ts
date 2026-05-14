import test from "node:test";
import assert from "node:assert/strict";

import { _hasExecutionToolCallsInSessionForTest } from "../auto-post-unit.ts";

test("suppresses empty-evidence warning when session contains bash tool calls", () => {
  const entries = [
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            toolName: "bash",
            arguments: { command: "python -m pytest tests/test_types.py -q" },
          },
        ],
      },
    },
  ];

  assert.equal(_hasExecutionToolCallsInSessionForTest(entries), true);
});

test("does not suppress when session has no execution tool calls", () => {
  const entries = [
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            toolName: "read",
            arguments: { file_path: "README.md" },
          },
        ],
      },
    },
  ];

  assert.equal(_hasExecutionToolCallsInSessionForTest(entries), false);
});
