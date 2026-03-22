/**
 * Resolve the correct module path and Node.js arguments for web-service
 * subprocesses that execute GSD extension modules.
 *
 * Node ≥ 22.12 refuses --experimental-strip-types for files under
 * node_modules/, which breaks the packaged standalone where all source lives
 * inside the installed npm package. The compiled dist/ output must be used
 * instead.
 *
 * Resolution priority:
 *   1. Compiled dist/resources/extensions/gsd/<name>.js  — preferred when it exists
 *   2. Source  src/resources/extensions/gsd/<name>.ts    — fallback (dev / source builds)
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface ResolvedSubprocessModule {
  /** Absolute path to the module file to execute. */
  modulePath: string;
  /** Node.js argv to prepend before "--eval <script>". */
  nodeArgs: string[];
}

/**
 * Resolve the module path and node args for a given GSD extension module.
 *
 * @param packageRoot  Absolute path to the gsd-pi package root.
 * @param relSrcPath   Path relative to src/resources/extensions/gsd/, e.g. "auto.ts"
 * @param checkExistsFn  Optional existsSync override for testing.
 */
export function resolveSubprocessModule(
  packageRoot: string,
  relSrcPath: string,
  checkExistsFn: (p: string) => boolean = existsSync,
): ResolvedSubprocessModule {
  // Strip leading slash if provided accidentally
  const rel = relSrcPath.replace(/^\//, "");

  // Compiled path: dist/resources/extensions/gsd/<name>.js
  const compiledPath = join(
    packageRoot,
    "dist",
    "resources",
    "extensions",
    "gsd",
    rel.replace(/\.ts$/, ".js"),
  );

  if (checkExistsFn(compiledPath)) {
    return {
      modulePath: compiledPath,
      nodeArgs: ["--input-type=module", "--eval"],
    };
  }

  // Source path: src/resources/extensions/gsd/<name>.ts
  const sourcePath = join(packageRoot, "src", "resources", "extensions", "gsd", rel);
  const tsLoaderPath = join(
    packageRoot,
    "src",
    "resources",
    "extensions",
    "gsd",
    "tests",
    "resolve-ts.mjs",
  );

  if (!checkExistsFn(tsLoaderPath) || !checkExistsFn(sourcePath)) {
    throw new Error(
      `GSD extension module not found; checked compiled=${compiledPath}, source=${sourcePath}`,
    );
  }

  return {
    modulePath: sourcePath,
    nodeArgs: [
      "--import",
      pathToFileURL(tsLoaderPath).href,
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
    ],
  };
}
