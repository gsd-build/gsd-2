import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Import the extension module and extract the execute function
// Since the extension exports a function that registers the tool,
// we need to mock pi.registerTool to capture the tool definition
// and test the execute function directly.

describe("FSM Verifier Tool", () => {
  let executeFn: any;

  // Before tests, load the extension and capture the tool execute function
  // This is a bit hacky, but allows testing without full ExtensionAPI setup
  test("setup", async () => {
    const mockPi = {
      registerTool: (tool: any) => {
        executeFn = tool.execute;
      }
    };

    // Load the extension
    const extension = (await import("../fsm-verifier.ts")).default;
    extension(mockPi);
  });

  test("valid FSM with simple transitions", async () => {
    const params = {
      states: ["start", "middle", "end"],
      transitions: [
        { from: "start", to: "middle" },
        { from: "middle", to: "end" }
      ],
      initial_state: "start",
      final_states: ["end"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("FSM Verification Complete"));
    assert(content.includes("Passed: 100"));
    assert(content.includes("Failed: 0"));
    assert(!content.includes("Errors"));
  });

  test("FSM with unreachable states", async () => {
    const params = {
      states: ["start", "middle", "end", "unreachable"],
      transitions: [
        { from: "start", to: "middle" },
        { from: "middle", to: "end" }
      ],
      initial_state: "start",
      final_states: ["end"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("Unreachable states: unreachable"));
  });

  test("FSM with invalid initial state", async () => {
    const params = {
      states: ["start", "middle", "end"],
      transitions: [
        { from: "start", to: "middle" },
        { from: "middle", to: "end" }
      ],
      initial_state: "invalid",
      final_states: ["end"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("Initial state 'invalid' not in states list"));
  });

  test("FSM with dead end (no transitions from a non-final state)", async () => {
    const params = {
      states: ["start", "dead", "end"],
      transitions: [
        { from: "start", to: "dead" }
        // No transition from dead to end
      ],
      initial_state: "start",
      final_states: ["end"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("Passed: 0"));
    assert(content.includes("Failed: 100"));
    assert(content.includes("Errors"));
    assert(content.includes("dead end"));
  });

  test("signal aborted", async () => {
    const params = {
      states: ["start", "end"],
      transitions: [{ from: "start", to: "end" }],
      initial_state: "start",
      final_states: ["end"]
    };

    const signal = { aborted: true };
    const result = await executeFn("test-id", params, signal, null, {});

    assert.strictEqual(result.content[0].text, "FSM verification cancelled");
  });
});