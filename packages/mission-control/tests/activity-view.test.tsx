/**
 * Tests for ActivityView component exports and pure helpers,
 * plus useActivity hook type exports.
 *
 * Pattern: Import verification + pure function testing (no direct hook/component calls).
 */
import { describe, expect, it } from "bun:test";
import { ActivityView, ACTIVITY_ICONS, relativeTime } from "../src/components/views/ActivityView";
import type { ActivityItem } from "../src/hooks/useActivity";

describe("ActivityView component", () => {
  it("exports ActivityView as a function component", () => {
    expect(typeof ActivityView).toBe("function");
  });

  it("module can be imported without error", async () => {
    const mod = await import("../src/components/views/ActivityView");
    expect(typeof mod.ActivityView).toBe("function");
  });
});

describe("ACTIVITY_ICONS", () => {
  it("has icon for tool_use", () => {
    expect(ACTIVITY_ICONS.tool_use).toBeDefined();
  });

  it("has icon for text", () => {
    expect(ACTIVITY_ICONS.text).toBeDefined();
  });

  it("has icon for thinking", () => {
    expect(ACTIVITY_ICONS.thinking).toBeDefined();
  });

  it("has icon for result", () => {
    expect(ACTIVITY_ICONS.result).toBeDefined();
  });

  it("covers all ActivityItem types", () => {
    const types: ActivityItem["type"][] = ["tool_use", "text", "thinking", "result"];
    for (const t of types) {
      expect(ACTIVITY_ICONS[t]).toBeTruthy();
    }
  });
});

describe("relativeTime", () => {
  it("returns seconds ago for recent timestamps", () => {
    const result = relativeTime(Date.now() - 5000);
    expect(result).toMatch(/\ds ago/);
  });

  it("returns minutes ago for older timestamps", () => {
    const result = relativeTime(Date.now() - 120_000);
    expect(result).toMatch(/\dm ago/);
  });

  it("returns hours ago for much older timestamps", () => {
    const result = relativeTime(Date.now() - 7200_000);
    expect(result).toMatch(/\dh ago/);
  });

  it("returns 0s ago for current timestamp", () => {
    const result = relativeTime(Date.now());
    expect(result).toBe("0s ago");
  });
});

describe("useActivity hook", () => {
  it("exports useActivity function", async () => {
    const mod = await import("../src/hooks/useActivity");
    expect(typeof mod.useActivity).toBe("function");
  });

  it("exports ActivityItem type (module importable)", async () => {
    const mod = await import("../src/hooks/useActivity");
    expect(mod).toBeDefined();
  });
});
