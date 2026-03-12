/**
 * Panel state component tests.
 *
 * These are smoke/import tests that verify components can be imported and
 * their types are correct. Full DOM rendering tests would require deeper
 * happy-dom + React integration. The key contracts are verified:
 * - PanelSkeleton accepts variant prop for each panel type
 * - PanelEmpty accepts title and description
 * - PanelError accepts error and optional onRetry
 */
import { describe, expect, it } from "bun:test";
import { PanelSkeleton } from "../src/components/states/PanelSkeleton";
import { PanelEmpty } from "../src/components/states/PanelEmpty";
import { PanelError } from "../src/components/states/PanelError";

describe("PanelSkeleton", () => {
  const variants = ["Sidebar", "Milestone", "Slice Detail", "Active Task", "Chat"] as const;

  for (const variant of variants) {
    it(`exports and can be called with variant "${variant}"`, () => {
      expect(typeof PanelSkeleton).toBe("function");
      // Verify the component can be invoked without throwing
      const result = PanelSkeleton({ variant });
      expect(result).toBeDefined();
    });
  }
});

describe("PanelEmpty", () => {
  it("exports as a function", () => {
    expect(typeof PanelEmpty).toBe("function");
  });

  it("renders with title and description", () => {
    const result = PanelEmpty({ title: "Test Title", description: "Test description" });
    expect(result).toBeDefined();
    // Verify the JSX tree contains our title and description
    const json = JSON.stringify(result);
    expect(json).toContain("Test Title");
    expect(json).toContain("Test description");
  });
});

describe("PanelError", () => {
  it("exports as a function", () => {
    expect(typeof PanelError).toBe("function");
  });

  it("renders error message", () => {
    const error = new Error("Something failed");
    const result = PanelError({ error });
    expect(result).toBeDefined();
    const json = JSON.stringify(result);
    expect(json).toContain("Something failed");
  });

  it("renders retry button when onRetry provided", () => {
    const error = new Error("fail");
    const onRetry = () => {};
    const result = PanelError({ error, onRetry });
    const json = JSON.stringify(result);
    expect(json).toContain("Retry");
  });

  it("hides retry button when onRetry omitted", () => {
    const error = new Error("fail");
    const result = PanelError({ error });
    const json = JSON.stringify(result);
    // Without onRetry, the button should not appear
    // The conditional {onRetry && ...} means no button element
    expect(json).not.toContain("Retry");
  });
});
