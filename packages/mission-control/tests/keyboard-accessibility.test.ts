/**
 * Tests for keyboard accessibility — Phase 10 (KEYS-01 through KEYS-06).
 *
 * Tests the pure state logic via direct function calls:
 *   - shouldOpenCommandPalette (KEYS-01)
 *   - shouldSwitchPanel (KEYS-02)
 *
 * Pattern: Pure function extraction for direct assertion without React renderer
 * — same as shouldTogglePreview in usePreview.ts and shouldPulseOnTaskChange in Phase 07.
 *
 * Note: KeyboardEvent is not available in the bun test environment,
 * so we use plain objects cast to KeyboardEvent for event stubs.
 */
import { describe, test, expect } from "bun:test";
import { shouldOpenCommandPalette } from "../src/hooks/useCommandPalette";
import { shouldSwitchPanel } from "../src/hooks/usePanelFocus";

// CommandPalette module smoke test — added in plan 03 after cmdk installed

// Minimal KeyboardEvent-like object for testing
type MinimalKeyEvent = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

function makeKeyEvent(opts: MinimalKeyEvent): MinimalKeyEvent {
  return { ctrlKey: false, metaKey: false, shiftKey: false, ...opts };
}

// -- KEYS-01: shouldOpenCommandPalette --

describe("KEYS-01: shouldOpenCommandPalette", () => {
  test("returns true for Ctrl+Shift+P", () => {
    const e = makeKeyEvent({ key: "P", ctrlKey: true, shiftKey: true });
    expect(shouldOpenCommandPalette(e as KeyboardEvent)).toBe(true);
  });

  test("returns true for Cmd+Shift+P (metaKey+Shift+P)", () => {
    const e = makeKeyEvent({ key: "P", metaKey: true, shiftKey: true });
    expect(shouldOpenCommandPalette(e as KeyboardEvent)).toBe(true);
  });

  test("returns false for Ctrl+P without Shift (lowercase p)", () => {
    const e = makeKeyEvent({ key: "p", ctrlKey: true, shiftKey: false });
    expect(shouldOpenCommandPalette(e as KeyboardEvent)).toBe(false);
  });

  test("returns false for Ctrl+Shift+p (lowercase p — wrong case)", () => {
    const e = makeKeyEvent({ key: "p", ctrlKey: true, shiftKey: true });
    expect(shouldOpenCommandPalette(e as KeyboardEvent)).toBe(false);
  });
});

// -- KEYS-02: shouldSwitchPanel --

describe("KEYS-02: shouldSwitchPanel", () => {
  test("returns '1' for Ctrl+1", () => {
    const e = makeKeyEvent({ key: "1", ctrlKey: true, shiftKey: false });
    expect(shouldSwitchPanel(e as KeyboardEvent)).toBe("1");
  });

  test("returns '5' for Ctrl+5", () => {
    const e = makeKeyEvent({ key: "5", ctrlKey: true, shiftKey: false });
    expect(shouldSwitchPanel(e as KeyboardEvent)).toBe("5");
  });

  test("returns null for Ctrl+Shift+1 (Shift held — not a panel shortcut)", () => {
    const e = makeKeyEvent({ key: "1", ctrlKey: true, shiftKey: true });
    expect(shouldSwitchPanel(e as KeyboardEvent)).toBeNull();
  });

  test("returns null for 1 with no modifier", () => {
    const e = makeKeyEvent({ key: "1", ctrlKey: false });
    expect(shouldSwitchPanel(e as KeyboardEvent)).toBeNull();
  });
});

// -- KEYS-01: command registry --

describe("KEYS-01: command registry", () => {
  test("getAllCommands() returns a non-empty array", async () => {
    const { getAllCommands } = await import("../src/lib/slash-commands");
    const commands = getAllCommands();
    expect(Array.isArray(commands)).toBe(true);
    expect(commands.length).toBeGreaterThan(0);
  });
});

// -- KEYS-01: CommandPalette module --

describe("KEYS-01: CommandPalette module", () => {
  test("useCommandPalette exports a function", async () => {
    const mod = await import("../src/hooks/useCommandPalette");
    expect(typeof mod.useCommandPalette).toBe("function");
  });

  test("CommandPalette component exports a function", async () => {
    const mod = await import("../src/components/command-palette/CommandPalette");
    expect(typeof mod.CommandPalette).toBe("function");
  });
});

// -- KEYS-06: usePanelFocus module --

describe("KEYS-06: usePanelFocus module", () => {
  test("shouldSwitchPanel is exported from usePanelFocus", async () => {
    const mod = await import("../src/hooks/usePanelFocus");
    expect(typeof mod.shouldSwitchPanel).toBe("function");
  });
});

// -- KEYS-03: heading hierarchy (structural stub) --

describe("KEYS-03: heading hierarchy", () => {
  test.todo("check heading hierarchy — each view renders a single h1 as the first heading");
});

// -- KEYS-04: aria-label presence (structural stub) --

describe("KEYS-04: aria-label presence", () => {
  test.todo("check aria-label on interactive controls — buttons and inputs have descriptive labels");
});

// -- KEYS-05: touch targets (structural stub) --

describe("KEYS-05: touch targets", () => {
  test.todo("check touch targets — interactive elements meet 44x44px minimum size");
});
