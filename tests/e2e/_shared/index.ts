/**
 * GSD-2 e2e harness barrel.
 *
 * Tests in tests/e2e/ should import from this single entry point so the
 * harness surface stays small and stable. New helpers go in their own file
 * here, then are re-exported from this barrel.
 */

export * from "./spawn.ts";
export * from "./tmp-project.ts";
export * from "./artifacts.ts";
export * from "./fake-llm.ts";
