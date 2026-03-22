import { resolveBridgeRuntimeConfig } from "./bridge-service.ts"
import { resolveSubprocessModule } from "./subprocess-module-resolver.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { SkillHealthReport } from "../../web/lib/diagnostics-types.ts"

const SKILL_HEALTH_MAX_BUFFER = 2 * 1024 * 1024
const SKILL_HEALTH_TIMEOUT_MS = 15_000
const SKILL_HEALTH_MODULE_ENV = "GSD_SKILL_HEALTH_MODULE"



/**
 * Loads skill health report via a child process.
 * SkillHealthReport is already all plain objects — no Map/Set conversion needed.
 */
export async function collectSkillHealthData(projectCwdOverride?: string): Promise<SkillHealthReport> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config
  const resolved = resolveSubprocessModule(packageRoot, "skill-health.ts")

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${SKILL_HEALTH_MODULE_ENV}).href);`,
    'const basePath = process.env.GSD_SKILL_HEALTH_BASE;',
    'const report = mod.generateSkillHealthReport(basePath);',
    'process.stdout.write(JSON.stringify(report));',
  ].join(" ")

  return runSubprocess<SkillHealthReport>(
    process.execPath,
    [...resolved.nodeArgs, script],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        [SKILL_HEALTH_MODULE_ENV]: resolved.modulePath,
        GSD_SKILL_HEALTH_BASE: projectCwd,
      },
      maxBuffer: SKILL_HEALTH_MAX_BUFFER,
      timeout: SKILL_HEALTH_TIMEOUT_MS,
    },
    "skill-health",
  )
}
