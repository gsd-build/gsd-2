/**
 * COMPAT-07: SettingsView renders GSD 2 fields and omits v1 fields
 *
 * RED state: These tests fail until Plan 12-05 updates SettingsView.
 * Currently SettingsView renders v1 fields ("Skip permissions", "Allowed tools")
 * and does NOT render GSD 2 fields ("Budget ceiling", "Skill discovery", per-phase models).
 *
 * Strategy: Read SettingsView source text and assert expected GSD 2 strings are present
 * or absent. This is a static analysis approach that avoids React hook rendering
 * complexity while still gating on production code changes. The test fails until
 * the production file is updated with the required GSD 2 field labels.
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SettingsView source path — adjust if directory structure changes
const SETTINGS_VIEW_PATH = join(
  import.meta.dir,
  "../src/components/views/SettingsView.tsx"
);

// Verify the import can be resolved (if file is missing, this will throw)
import { SettingsView } from "../src/components/views/SettingsView";

describe("COMPAT-07: SettingsView renders GSD 2 fields", () => {
  const source = readFileSync(SETTINGS_VIEW_PATH, "utf-8");

  it("SettingsView is importable (module resolves without error)", () => {
    // This test passes even in RED state — it is a guard against import errors.
    expect(typeof SettingsView).toBe("function");
  });

  it("renders a 'Budget ceiling' field (budget_ceiling)", () => {
    // Fails until GSD 2 settings fields are added to SettingsView
    expect(source).toContain("Budget ceiling");
  });

  it("renders a 'Skill discovery' select with options auto/suggest/off", () => {
    // Fails until Skill discovery select is added to SettingsView
    expect(source).toContain("Skill discovery");
  });

  it("renders per-phase model fields (research, planning, execution, completion)", () => {
    // Fails until per-phase model selectors are added
    expect(source).toContain("research");
    expect(source).toContain("planning");
    expect(source).toContain("execution");
    expect(source).toContain("completion");
  });

  it("does NOT render a 'Skip permissions' toggle", () => {
    // Currently fails: SettingsView has a ToggleRow with label "Skip permissions"
    expect(source).not.toContain("Skip permissions");
  });

  it("does NOT render an 'Allowed tools' field", () => {
    // Currently fails: SettingsView has a TextAreaRow with label "Allowed tools"
    expect(source).not.toContain("Allowed tools");
  });
});
