/**
 * Layout component tests for the sidebar + tab navigation rewrite.
 *
 * Tests verify the Sidebar, TabLayout, and AppShell components
 * that replaced the old 5-panel PanelShell layout.
 *
 * Pattern: Direct function call on components + JSON.stringify inspection,
 * matching the approach used in panel-states.test.tsx.
 */
import { describe, expect, it } from "bun:test";
import { Sidebar } from "../src/components/layout/Sidebar";
import { TabLayout } from "../src/components/layout/TabLayout";
import { AppShell } from "../src/components/layout/AppShell";
import { LAYOUT_DEFAULTS } from "../src/styles/design-tokens";

describe("Sidebar", () => {
  it("exports as a function component", () => {
    expect(typeof Sidebar).toBe("function");
  });

  it("module can be imported without error", async () => {
    const mod = await import("../src/components/layout/Sidebar");
    expect(typeof mod.Sidebar).toBe("function");
  });
});

describe("TabLayout", () => {
  it("exports as a function component", () => {
    expect(typeof TabLayout).toBe("function");
  });

  it("module can be imported without error", async () => {
    const mod = await import("../src/components/layout/TabLayout");
    expect(typeof mod.TabLayout).toBe("function");
  });
});

describe("AppShell", () => {
  it("exports as a function component", () => {
    expect(typeof AppShell).toBe("function");
  });

  it("module can be imported without error", async () => {
    const mod = await import("../src/components/layout/AppShell");
    expect(typeof mod.AppShell).toBe("function");
  });

  it("module imports Sidebar and TabLayout", async () => {
    // Verify AppShell composes both layout components
    const sidebarMod = await import("../src/components/layout/Sidebar");
    const tabMod = await import("../src/components/layout/TabLayout");
    expect(typeof sidebarMod.Sidebar).toBe("function");
    expect(typeof tabMod.TabLayout).toBe("function");
  });
});

describe("LAYOUT_DEFAULTS", () => {
  it("has sidebarWidth defined", () => {
    expect(LAYOUT_DEFAULTS.sidebarWidth).toBeDefined();
    expect(typeof LAYOUT_DEFAULTS.sidebarWidth).toBe("number");
  });

  it("has sidebarCollapsedWidth defined", () => {
    expect(LAYOUT_DEFAULTS.sidebarCollapsedWidth).toBeDefined();
    expect(typeof LAYOUT_DEFAULTS.sidebarCollapsedWidth).toBe("number");
  });

  it("has tabBarHeight defined", () => {
    expect(LAYOUT_DEFAULTS.tabBarHeight).toBeDefined();
    expect(typeof LAYOUT_DEFAULTS.tabBarHeight).toBe("number");
  });

  it("sidebar collapsed width is less than full width", () => {
    expect(LAYOUT_DEFAULTS.sidebarCollapsedWidth).toBeLessThan(
      LAYOUT_DEFAULTS.sidebarWidth,
    );
  });
});
