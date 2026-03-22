import { resolveBridgeRuntimeConfig } from "./bridge-service.ts"
import { resolveSubprocessModule } from "./subprocess-module-resolver.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { HooksData } from "../../web/lib/remaining-command-types.ts"

const HOOKS_MAX_BUFFER = 512 * 1024
const HOOKS_TIMEOUT_MS = 10_000
const HOOKS_MODULE_ENV = "GSD_HOOKS_MODULE"



/**
 * Collects hook configuration and status via a child process.
 * Runtime state (active cycles, hook queue) is not available in a cold child
 * process, so activeCycles will be empty. The child calls getHookStatus() which
 * reads from preferences to build entries, then formatHookStatus() for display.
 */
export async function collectHooksData(projectCwdOverride?: string): Promise<HooksData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config
  const resolved = resolveSubprocessModule(packageRoot, "post-unit-hooks.ts")

  // getHookStatus() internally calls resolvePostUnitHooks() and resolvePreDispatchHooks()
  // from preferences.ts, which read from process.cwd()/.gsd/preferences.md.
  // We set cwd to projectCwd so preferences resolution finds the right files.
  // In a cold child process, cycleCounts is empty, so activeCycles will be {}.
  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${HOOKS_MODULE_ENV}).href);`,
    'const entries = mod.getHookStatus();',
    'const formattedStatus = mod.formatHookStatus();',
    'process.stdout.write(JSON.stringify({ entries, formattedStatus }));',
  ].join(" ")

  return runSubprocess<HooksData>(
    process.execPath,
    [...resolved.nodeArgs, script],
    {
      cwd: projectCwd,
      env: {
        ...process.env,
        [HOOKS_MODULE_ENV]: resolved.modulePath,
      },
      maxBuffer: HOOKS_MAX_BUFFER,
      timeout: HOOKS_TIMEOUT_MS,
    },
    "hooks data",
  )
}
