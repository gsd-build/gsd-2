// GSD2 — Regression test for next-action-ui ctx.hasUI short-circuit (bare /gsd lockup)

/**
 * Regression test for the bare /gsd lockup investigated in
 * .planning/reports/2026-04-30-gsd-bare-and-new-project-investigation.md.
 *
 * showNextAction() awaits ctx.ui.custom() to render a TUI prompt. In a
 * headless context (no UI bound, ctx.hasUI === false), both ctx.ui.custom
 * and ctx.ui.select resolve to undefined, but the call still pays for two
 * sequential awaits before reaching the safe "not_yet" default. This test
 * asserts the proactive short-circuit: when ctx.hasUI is false,
 * showNextAction returns "not_yet" immediately without touching either
 * UI method.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { showNextAction } from "../next-action-ui.js";

describe("showNextAction ctx.hasUI guard (#5125 lockup root protection)", () => {
  it("returns 'not_yet' immediately when ctx.hasUI is false (no UI calls)", async () => {
    let customCalled = 0;
    let selectCalled = 0;

    const ctx = {
      hasUI: false,
      ui: {
        custom: async () => {
          customCalled++;
          return undefined as never;
        },
        select: async () => {
          selectCalled++;
          return undefined;
        },
      },
    };

    const result = await showNextAction(ctx as any, {
      title: "GSD — test",
      actions: [
        { id: "a", label: "Option A", description: "first", recommended: true },
        { id: "b", label: "Option B", description: "second" },
      ],
    });

    assert.equal(result, "not_yet", "should short-circuit to safe default");
    assert.equal(customCalled, 0, "ctx.ui.custom must not be called when hasUI is false");
    assert.equal(selectCalled, 0, "ctx.ui.select must not be called when hasUI is false");
  });

  it("uses ctx.ui.select fallback when ctx.hasUI is true and custom returns undefined", async () => {
    let customCalled = 0;
    let selectCalled = 0;

    const ctx = {
      hasUI: true,
      ui: {
        custom: async () => {
          customCalled++;
          return undefined as never;
        },
        select: async (_title: string, options: string[]) => {
          selectCalled++;
          return options[0];
        },
      },
    };

    const result = await showNextAction(ctx as any, {
      title: "GSD — test",
      actions: [
        { id: "alpha", label: "Alpha", description: "first", recommended: true },
        { id: "beta", label: "Beta", description: "second" },
      ],
    });

    assert.equal(customCalled, 1, "ctx.ui.custom must be tried first when hasUI is true");
    assert.equal(selectCalled, 1, "ctx.ui.select must run as fallback when custom returns undefined");
    assert.equal(result, "alpha", "fallback should map the picked label back to the chosen action id");
  });

  it("returns the resolved id when ctx.ui.custom completes normally", async () => {
    let selectCalled = 0;

    const ctx = {
      hasUI: true,
      ui: {
        custom: async (_factory: any) => {
          // Simulate user selecting action "beta" via the TUI widget.
          return "beta" as never;
        },
        select: async () => {
          selectCalled++;
          return undefined;
        },
      },
    };

    const result = await showNextAction(ctx as any, {
      title: "GSD — test",
      actions: [
        { id: "alpha", label: "Alpha", description: "first", recommended: true },
        { id: "beta", label: "Beta", description: "second" },
      ],
    });

    assert.equal(result, "beta", "TUI selection should be returned verbatim");
    assert.equal(selectCalled, 0, "ctx.ui.select fallback must NOT fire when custom returns a value");
  });
});
