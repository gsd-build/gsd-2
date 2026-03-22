import { existsSync } from "node:fs";
import { join } from "node:path";

import type { AutoDashboardData } from "./bridge-service.ts";
import { resolveSubprocessModule } from "./subprocess-module-resolver.ts";
import { runSubprocess } from "./subprocess-runner.ts";

const AUTO_DASHBOARD_MAX_BUFFER = 1024 * 1024;
const AUTO_DASHBOARD_TIMEOUT_MS = 10_000;
const TEST_AUTO_DASHBOARD_MODULE_ENV = "GSD_WEB_TEST_AUTO_DASHBOARD_MODULE";
const TEST_AUTO_DASHBOARD_FALLBACK_ENV = "GSD_WEB_TEST_USE_FALLBACK_AUTO_DASHBOARD";
const AUTO_DASHBOARD_MODULE_ENV = "GSD_AUTO_DASHBOARD_MODULE";

export interface AutoDashboardServiceOptions {
  execPath?: string;
  env?: NodeJS.ProcessEnv;
  existsSync?: (path: string) => boolean;
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

  // When a test override module is set, it is a .ts file that must go through
  // the ts-loader path. Build the module path manually and bypass the
  // resolver's compiled-first logic.
  const testOverridePath = env[TEST_AUTO_DASHBOARD_MODULE_ENV];
  let resolved;
  if (testOverridePath) {
    const tsLoaderPath = join(
      packageRoot,
      "src",
      "resources",
      "extensions",
      "gsd",
      "tests",
      "resolve-ts.mjs",
    );
    const { pathToFileURL } = await import("node:url");
    resolved = {
      modulePath: testOverridePath,
      nodeArgs: [
        "--import",
        pathToFileURL(tsLoaderPath).href,
        "--experimental-strip-types",
        "--input-type=module",
        "--eval",
      ],
    };
  } else {
    resolved = resolveSubprocessModule(packageRoot, "auto.ts", checkExists);
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${AUTO_DASHBOARD_MODULE_ENV}).href);`,
    'const result = await mod.getAutoDashboardData();',
    'process.stdout.write(JSON.stringify(result));',
  ].join(" ");

  return runSubprocess<AutoDashboardData>(
    options.execPath ?? process.execPath,
    [...resolved.nodeArgs, script],
    {
      cwd: packageRoot,
      env: {
        ...env,
        [AUTO_DASHBOARD_MODULE_ENV]: resolved.modulePath,
      },
      maxBuffer: AUTO_DASHBOARD_MAX_BUFFER,
      timeout: AUTO_DASHBOARD_TIMEOUT_MS,
    },
    "authoritative auto dashboard",
  );
}
