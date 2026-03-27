// GSD-2 — Tests for plan-time capability validation (ADR-004/005)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePlanCapabilities,
  formatCapabilityWarnings,
  type CapabilityWarning,
} from "../auto-model-selection.js";

describe("Plan-Time Capability Validation (ADR-004/005)", () => {

  // ─── validatePlanCapabilities ──────────────────────────────────────────────

  describe("validatePlanCapabilities", () => {
    const anthropicModel = { id: "claude-sonnet-4-6", api: "anthropic-messages" };
    const openaiModel = { id: "gpt-4o", api: "openai-responses" };
    const mistralModel = { id: "mistral-large", api: "mistral-conversations" };

    test("returns empty array when all models support all capabilities", () => {
      const tasks = [{
        taskId: "T01",
        title: "Add screenshot tests",
        description: "Capture screenshots for visual regression testing",
        files: ["tests/screenshots/home.png"],
      }];
      // Anthropic supports images
      const warnings = validatePlanCapabilities(tasks, [anthropicModel]);
      assert.deepEqual(warnings, []);
    });

    test("warns when task needs images but no model supports imageToolResults", () => {
      const tasks = [{
        taskId: "T01",
        title: "Capture login screenshot",
        description: "Take a screenshot of the login page for UAT evidence",
        files: ["evidence/login.png"],
      }];
      // OpenAI does NOT support image tool results
      const warnings = validatePlanCapabilities(tasks, [openaiModel]);
      assert.ok(warnings.length > 0, "should have at least one warning");
      assert.equal(warnings[0].taskId, "T01");
      assert.equal(warnings[0].capability, "imageToolResults");
    });

    test("warns on image file extensions even without keyword in description", () => {
      const tasks = [{
        taskId: "T02",
        title: "Update logo",
        description: "Replace the old logo with the new one",
        files: ["public/logo.svg", "public/favicon.png"],
      }];
      const warnings = validatePlanCapabilities(tasks, [openaiModel, mistralModel]);
      assert.ok(warnings.length > 0, "should detect image files");
      assert.equal(warnings[0].capability, "imageToolResults");
      assert.ok(warnings[0].detail.includes("logo.svg") || warnings[0].detail.includes("favicon.png"));
    });

    test("no warning when at least one model supports the capability", () => {
      const tasks = [{
        taskId: "T01",
        title: "Take screenshot",
        description: "Capture screenshots",
        files: ["test.png"],
      }];
      // Mixed pool: Anthropic supports images, OpenAI doesn't
      const warnings = validatePlanCapabilities(tasks, [anthropicModel, openaiModel]);
      assert.deepEqual(warnings, []);
    });

    test("returns empty array for empty tasks", () => {
      const warnings = validatePlanCapabilities([], [anthropicModel]);
      assert.deepEqual(warnings, []);
    });

    test("returns empty array for empty models", () => {
      const tasks = [{
        taskId: "T01", title: "task", description: "desc", files: [],
      }];
      const warnings = validatePlanCapabilities(tasks, []);
      assert.deepEqual(warnings, []);
    });

    test("does not warn for tasks without capability requirements", () => {
      const tasks = [{
        taskId: "T01",
        title: "Refactor auth module",
        description: "Extract validation logic into separate function",
        files: ["src/auth.ts", "src/validation.ts"],
      }];
      const warnings = validatePlanCapabilities(tasks, [openaiModel]);
      assert.deepEqual(warnings, []);
    });

    test("detects multiple tasks with capability gaps", () => {
      const tasks = [
        {
          taskId: "T01",
          title: "Add visual regression tests",
          description: "Capture screenshots for visual comparison",
          files: ["tests/visual/home.png"],
        },
        {
          taskId: "T02",
          title: "Render diagram",
          description: "Generate architecture diagram as SVG",
          files: ["docs/architecture.svg"],
        },
        {
          taskId: "T03",
          title: "Fix bug in parser",
          description: "Handle edge case in CSV parsing",
          files: ["src/parser.ts"],
        },
      ];
      const warnings = validatePlanCapabilities(tasks, [mistralModel]);
      // T01 and T02 should have warnings, T03 should not
      const warningTaskIds = warnings.map(w => w.taskId);
      assert.ok(warningTaskIds.includes("T01"), "T01 should have a warning");
      assert.ok(warningTaskIds.includes("T02"), "T02 should have a warning");
      assert.ok(!warningTaskIds.includes("T03"), "T03 should NOT have a warning");
    });
  });

  // ─── formatCapabilityWarnings ────────────────────────────────────────────

  describe("formatCapabilityWarnings", () => {
    test("returns empty string for no warnings", () => {
      assert.equal(formatCapabilityWarnings([]), "");
    });

    test("formats single warning with header and recommendation", () => {
      const warnings: CapabilityWarning[] = [{
        taskId: "T01",
        taskTitle: "Take screenshot",
        capability: "imageToolResults",
        detail: "No model supports image tool results.",
      }];
      const output = formatCapabilityWarnings(warnings);
      assert.ok(output.includes("## Capability Warnings"));
      assert.ok(output.includes("T01"));
      assert.ok(output.includes("imageToolResults"));
      assert.ok(output.includes("Consider configuring"));
    });

    test("formats multiple warnings", () => {
      const warnings: CapabilityWarning[] = [
        { taskId: "T01", taskTitle: "Screenshots", capability: "imageToolResults", detail: "No image support." },
        { taskId: "T02", taskTitle: "Diagrams", capability: "imageToolResults", detail: "No image support." },
      ];
      const output = formatCapabilityWarnings(warnings);
      assert.ok(output.includes("T01"));
      assert.ok(output.includes("T02"));
    });
  });
});
