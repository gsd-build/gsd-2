import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { AutoDashboardData } from "./bridge-service.ts";
import { resolveTypeStrippingFlag, isUnderNodeModules } from "./ts-subprocess-flags.ts"

const AUTO_DASHBOARD_MAX_BUFFER = 1024 * 1024;
const TEST_AUTO_DASHBOARD_MODULE_ENV = "GSD_WEB_TEST_AUTO_DASHBOARD_MODULE";
const TEST_AUTO_DASHBOARD_FALLBACK_ENV = "GSD_WEB_TEST_USE_FALLBACK_AUTO_DASHBOARD";
const AUTO_DASHBOARD_MODULE_ENV = "GSD_AUTO_DASHBOARD_MODULE";

export interface AutoDashboardServiceOptions {
  execPath?: string;
  env?: NodeJS.ProcessEnv;
  existsSync?: (path: string) => boolean;
}

export interface SubprocessConfig {
  modulePath: string;
  args: string[];
}

function fallbackAutoDashboardData(): AutoDashboardData {
  return {
    active: false,
    paused: false,
    stepMode: false,
    startTime: 0,
    elapsed: 0,
    currentUnit: null,
    completedUnits: [],
    basePath: "",
    totalCost: 0,
    totalTokens: 0,
  };
}

function resolveTsLoaderPath(packageRoot: string): string {
  return join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs");
}

/**
 * Resolves the subprocess configuration for the auto-dashboard module.
 *
 * When packageRoot is under node_modules/ (packaged-standalone mode) and the
 * compiled dist/auto.js exists, returns a config that uses the compiled JS
 * directly — no type-stripping flags, no TS loader. This avoids
 * ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING on all Node versions.
 *
 * Falls back to the TypeScript source with appropriate type-stripping flags
 * when running from a development checkout or when the compiled file is missing.
 */
export function resolveAutoDashboardSubprocessConfig(
  packageRoot: string,
  options: { existsSync?: (path: string) => boolean; env?: NodeJS.ProcessEnv },
): SubprocessConfig {
  const checkExists = options.existsSync ?? existsSync;
  const env = options.env ?? process.env;

  // Test override path takes precedence
  const testModulePath = env[TEST_AUTO_DASHBOARD_MODULE_ENV];
  if (testModulePath) {
    const resolveTsLoader = resolveTsLoaderPath(packageRoot);
    return {
      modulePath: testModulePath,
      args: [
        "--import", pathToFileURL(resolveTsLoader).href,
        resolveTypeStrippingFlag(packageRoot),
        "--input-type=module",
      ],
    };
  }

  const distModulePath = join(packageRoot, "dist", "resources", "extensions", "gsd", "auto.js");
  const srcModulePath = join(packageRoot, "src", "resources", "extensions", "gsd", "auto.ts");
  const resolveTsLoader = resolveTsLoaderPath(packageRoot);

  // Prefer compiled JS when under node_modules/ to avoid type-stripping errors
  if (isUnderNodeModules(packageRoot) && checkExists(distModulePath)) {
    return {
      modulePath: distModulePath,
      args: ["--input-type=module"],
    };
  }

  // Development mode: use TypeScript source with type-stripping
  return {
    modulePath: srcModulePath,
    args: [
      "--import", pathToFileURL(resolveTsLoader).href,
      resolveTypeStrippingFlag(packageRoot),
      "--input-type=module",
    ],
  };
}

export function collectTestOnlyFallbackAutoDashboardData(): AutoDashboardData {
  return fallbackAutoDashboardData();
}

export async function collectAuthoritativeAutoDashboardData(
  packageRoot: string,
  options: AutoDashboardServiceOptions = {},
): Promise<AutoDashboardData> {
  const env = options.env ?? process.env;
  if (env[TEST_AUTO_DASHBOARD_FALLBACK_ENV] === "1") {
    return fallbackAutoDashboardData();
  }

  const checkExists = options.existsSync ?? existsSync;
  const subprocessConfig = resolveAutoDashboardSubprocessConfig(packageRoot, {
    existsSync: checkExists,
    env,
  });

  // For TS source paths, verify the TS loader also exists
  if (subprocessConfig.modulePath.endsWith(".ts")) {
    const resolveTsLoader = resolveTsLoaderPath(packageRoot);
    if (!checkExists(resolveTsLoader) || !checkExists(subprocessConfig.modulePath)) {
      throw new Error(`authoritative auto dashboard provider not found; checked=${resolveTsLoader},${subprocessConfig.modulePath}`);
    }
  } else {
    if (!checkExists(subprocessConfig.modulePath)) {
      throw new Error(`authoritative auto dashboard provider not found; checked=${subprocessConfig.modulePath}`);
    }
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${AUTO_DASHBOARD_MODULE_ENV}).href);`,
    'const result = await mod.getAutoDashboardData();',
    'process.stdout.write(JSON.stringify(result));',
  ].join(" ");

  return await new Promise<AutoDashboardData>((resolveResult, reject) => {
    execFile(
      options.execPath ?? process.execPath,
      [
        ...subprocessConfig.args,
        "--eval",
        script,
      ],
      {
        cwd: packageRoot,
        env: {
          ...env,
          [AUTO_DASHBOARD_MODULE_ENV]: subprocessConfig.modulePath,
        },
        maxBuffer: AUTO_DASHBOARD_MAX_BUFFER,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`authoritative auto dashboard subprocess failed: ${stderr || error.message}`));
          return;
        }

        try {
          resolveResult(JSON.parse(stdout) as AutoDashboardData);
        } catch (parseError) {
          reject(
            new Error(
              `authoritative auto dashboard subprocess returned invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            ),
          );
        }
      },
    );
  });
}
