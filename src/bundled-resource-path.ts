import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve bundled raw resource files from the package root.
 *
 * Both `src/*.ts` and compiled `dist/*.js` entry points need to load the same
 * raw `.ts` resource modules via jiti. Those modules are shipped under
 * `src/resources/**`, not next to the compiled entry point.
 */
export function resolveBundledSourceResource(
  importUrl: string,
  ...segments: string[]
): string {
  const moduleDir = dirname(fileURLToPath(importUrl));
  const packageRoot = resolve(moduleDir, "..");
  return join(packageRoot, "src", "resources", ...segments);
}
