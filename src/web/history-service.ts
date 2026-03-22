import { resolveBridgeRuntimeConfig } from "./bridge-service.ts"
import { resolveSubprocessModule } from "./subprocess-module-resolver.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { HistoryData } from "../../web/lib/remaining-command-types.ts"

const HISTORY_MAX_BUFFER = 2 * 1024 * 1024
const HISTORY_TIMEOUT_MS = 15_000
const HISTORY_MODULE_ENV = "GSD_HISTORY_MODULE"



/**
 * Loads history/metrics data via a child process.
 * Reads the metrics ledger from disk and computes aggregation views
 * (totals, byPhase, bySlice, byModel) for browser consumption.
 */
export async function collectHistoryData(projectCwdOverride?: string): Promise<HistoryData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config
  const resolved = resolveSubprocessModule(packageRoot, "metrics.ts")

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${HISTORY_MODULE_ENV}).href);`,
    `const ledger = mod.loadLedgerFromDisk(process.env.GSD_HISTORY_BASE);`,
    'const units = ledger ? ledger.units : [];',
    'const totals = mod.getProjectTotals(units);',
    'const byPhase = mod.aggregateByPhase(units);',
    'const bySlice = mod.aggregateBySlice(units);',
    'const byModel = mod.aggregateByModel(units);',
    'process.stdout.write(JSON.stringify({ units, totals, byPhase, bySlice, byModel }));',
  ].join(" ")

  return runSubprocess<HistoryData>(
    process.execPath,
    [...resolved.nodeArgs, script],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        [HISTORY_MODULE_ENV]: resolved.modulePath,
        GSD_HISTORY_BASE: projectCwd,
      },
      maxBuffer: HISTORY_MAX_BUFFER,
      timeout: HISTORY_TIMEOUT_MS,
    },
    "history data",
  )
}
