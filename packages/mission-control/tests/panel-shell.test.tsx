// PanelShell replaced by AppShell in Phase 03.1
// These tests are kept for backward compatibility since PANEL_DEFAULTS still exists
// alongside LAYOUT_DEFAULTS. The PanelShell component is dead code but still compiles.
import { describe, expect, it } from "bun:test";
import { PANEL_DEFAULTS } from "../src/styles/design-tokens";

describe("PanelShell contract (legacy - replaced by AppShell in Phase 03.1)", () => {
  it("PANEL_DEFAULTS still exist for backward compatibility", () => {
    expect(PANEL_DEFAULTS).toEqual({
      sidebar: 14,
      milestone: 22,
      sliceDetail: 19,
      activeTask: 21,
      chat: 24,
    });
  });

  it("panel defaults sum to 100%", () => {
    const sum = Object.values(PANEL_DEFAULTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it("has exactly 5 panel entries", () => {
    expect(Object.keys(PANEL_DEFAULTS).length).toBe(5);
  });

  it("PanelShell module can still be imported (kept as dead code)", async () => {
    // PanelShell is no longer used in App.tsx but kept for reference
    const mod = await import("../src/components/layout/PanelShell");
    expect(typeof mod.PanelShell).toBe("function");
  });
});
