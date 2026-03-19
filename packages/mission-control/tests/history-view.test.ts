/**
 * Tests for HistoryView component exports and VerifyView component.
 *
 * Pattern: Import verification (no direct hook/component calls with useState/useEffect).
 */
import { describe, expect, it } from "bun:test";
import { HistoryView } from "../src/components/views/HistoryView";
import { VerifyView } from "../src/components/views/VerifyView";

describe("HistoryView component", () => {
  it("exports HistoryView as a function component", () => {
    expect(typeof HistoryView).toBe("function");
  });

  it("module can be imported without error", async () => {
    const mod = await import("../src/components/views/HistoryView");
    expect(typeof mod.HistoryView).toBe("function");
  });
});

describe("VerifyView component", () => {
  it("exports VerifyView as a function component", () => {
    expect(typeof VerifyView).toBe("function");
  });

  it("module can be imported without error", async () => {
    const mod = await import("../src/components/views/VerifyView");
    expect(typeof mod.VerifyView).toBe("function");
  });
});
