import { resolveBridgeRuntimeConfig } from "./bridge-service.ts"
import { resolveSubprocessModule } from "./subprocess-module-resolver.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { DoctorReport, DoctorFixResult } from "../../web/lib/diagnostics-types.ts"

const DOCTOR_MAX_BUFFER = 2 * 1024 * 1024
const DOCTOR_TIMEOUT_MS = 45_000
const DOCTOR_MODULE_ENV = "GSD_DOCTOR_MODULE"

/**
 * Loads doctor diagnostic data (GET — read-only, no fixes applied).
 * Returns full issues array + summary for the doctor panel.
 */
export async function collectDoctorData(scope?: string, projectCwdOverride?: string): Promise<DoctorReport> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config
  const resolved = resolveSubprocessModule(packageRoot, "doctor.ts")

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${DOCTOR_MODULE_ENV}).href);`,
    'const basePath = process.env.GSD_DOCTOR_BASE;',
    'const scope = process.env.GSD_DOCTOR_SCOPE || undefined;',
    'const report = await mod.runGSDDoctor(basePath, { fix: false, scope });',
    'const summary = mod.summarizeDoctorIssues(report.issues);',
    'const result = {',
    '  ok: report.ok,',
    '  issues: report.issues,',
    '  fixesApplied: report.fixesApplied,',
    '  summary,',
    '};',
    'process.stdout.write(JSON.stringify(result));',
  ].join(" ")

  return runSubprocess<DoctorReport>(
    process.execPath,
    [...resolved.nodeArgs, script],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        [DOCTOR_MODULE_ENV]: resolved.modulePath,
        GSD_DOCTOR_BASE: projectCwd,
        GSD_DOCTOR_SCOPE: scope ?? "",
      },
      maxBuffer: DOCTOR_MAX_BUFFER,
      timeout: DOCTOR_TIMEOUT_MS,
    },
    "doctor",
  )
}

/**
 * Applies doctor fixes (POST — mutating action).
 * Returns fix result with list of applied fixes.
 */
export async function applyDoctorFixes(scope?: string, projectCwdOverride?: string): Promise<DoctorFixResult> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config
  const resolved = resolveSubprocessModule(packageRoot, "doctor.ts")

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${DOCTOR_MODULE_ENV}).href);`,
    'const basePath = process.env.GSD_DOCTOR_BASE;',
    'const scope = process.env.GSD_DOCTOR_SCOPE || undefined;',
    'const report = await mod.runGSDDoctor(basePath, { fix: true, scope });',
    'const result = {',
    '  ok: report.ok,',
    '  fixesApplied: report.fixesApplied,',
    '};',
    'process.stdout.write(JSON.stringify(result));',
  ].join(" ")

  return runSubprocess<DoctorFixResult>(
    process.execPath,
    [...resolved.nodeArgs, script],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        [DOCTOR_MODULE_ENV]: resolved.modulePath,
        GSD_DOCTOR_BASE: projectCwd,
        GSD_DOCTOR_SCOPE: scope ?? "",
      },
      maxBuffer: DOCTOR_MAX_BUFFER,
      timeout: DOCTOR_TIMEOUT_MS,
    },
    "doctor fix",
  )
}
