/**
 * Tests for ErrorBoundaryFrame component.
 *
 * Pattern: Direct class instance testing — React 19 renderToString no longer
 * triggers error boundary lifecycle, so we test getDerivedStateFromError
 * and componentDidCatch via direct class instantiation.
 *
 * Decision [11.1-03]: React 19 renderToString no longer triggers error boundary
 * lifecycle — error-boundary test updated to direct class instance testing.
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const BOUNDARY_PATH = join(
  import.meta.dir,
  "../src/components/preview/ErrorBoundaryFrame.tsx"
);

// -- Source file existence and structure --

describe("ErrorBoundaryFrame source", () => {
  test("file exists at expected path", () => {
    const source = readFileSync(BOUNDARY_PATH, "utf-8");
    expect(source.length).toBeGreaterThan(0);
  });

  test("contains getDerivedStateFromError", () => {
    const source = readFileSync(BOUNDARY_PATH, "utf-8");
    expect(source).toContain("getDerivedStateFromError");
  });

  test("contains componentDidCatch", () => {
    const source = readFileSync(BOUNDARY_PATH, "utf-8");
    expect(source).toContain("componentDidCatch");
  });

  test("contains Preview unavailable fallback text", () => {
    const source = readFileSync(BOUNDARY_PATH, "utf-8");
    expect(source).toContain("Preview unavailable");
  });

  test("exports ErrorBoundaryFrame as named class export", () => {
    const source = readFileSync(BOUNDARY_PATH, "utf-8");
    expect(source).toContain("export class ErrorBoundaryFrame");
  });

  test("has resetError method", () => {
    const source = readFileSync(BOUNDARY_PATH, "utf-8");
    expect(source).toContain("resetError");
  });
});

// -- Direct class instance tests --

describe("ErrorBoundaryFrame class behavior", () => {
  test("getDerivedStateFromError returns { hasError: true, error }", async () => {
    const { ErrorBoundaryFrame } = await import(
      "../src/components/preview/ErrorBoundaryFrame"
    );
    const testError = new Error("test crash");
    const state = ErrorBoundaryFrame.getDerivedStateFromError(testError);
    expect(state.hasError).toBe(true);
    expect(state.error).toBe(testError);
  });

  test("getDerivedStateFromError: hasError is true for any error", async () => {
    const { ErrorBoundaryFrame } = await import(
      "../src/components/preview/ErrorBoundaryFrame"
    );
    const state = ErrorBoundaryFrame.getDerivedStateFromError(
      new Error("iframe load failed")
    );
    expect(state.hasError).toBe(true);
  });

  test("is a class component (has prototype.render)", async () => {
    const { ErrorBoundaryFrame } = await import(
      "../src/components/preview/ErrorBoundaryFrame"
    );
    expect(typeof ErrorBoundaryFrame.prototype.render).toBe("function");
  });

  test("has static getDerivedStateFromError method", async () => {
    const { ErrorBoundaryFrame } = await import(
      "../src/components/preview/ErrorBoundaryFrame"
    );
    expect(typeof ErrorBoundaryFrame.getDerivedStateFromError).toBe("function");
  });
});
