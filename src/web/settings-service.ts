import { resolveBridgeRuntimeConfig } from "./bridge-service.ts"
import { resolveSubprocessModule } from "./subprocess-module-resolver.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { SettingsData } from "../../web/lib/settings-types.ts"

const SETTINGS_MAX_BUFFER = 2 * 1024 * 1024
const SETTINGS_TIMEOUT_MS = 15_000

/**
 * Loads settings data via a child process. Calls upstream extension modules
 * for preferences, routing config, budget allocation, routing history, and
 * project totals, then combines results into a single SettingsData payload.
 */
export async function collectSettingsData(projectCwdOverride?: string): Promise<SettingsData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  // All five modules use the same resolution strategy — pick the first for nodeArgs.
  const resolvedPrefs = resolveSubprocessModule(packageRoot, "preferences.ts")
  const resolvedRouter = resolveSubprocessModule(packageRoot, "model-router.ts")
  const resolvedBudget = resolveSubprocessModule(packageRoot, "context-budget.ts")
  const resolvedHistory = resolveSubprocessModule(packageRoot, "routing-history.ts")
  const resolvedMetrics = resolveSubprocessModule(packageRoot, "metrics.ts")

  const allModules = [resolvedPrefs, resolvedRouter, resolvedBudget, resolvedHistory, resolvedMetrics]
  const nodeArgsSignature = JSON.stringify(resolvedPrefs.nodeArgs)
  if (!allModules.every(r => JSON.stringify(r.nodeArgs) === nodeArgsSignature)) {
    throw new Error(
      "settings-service: mixed compiled/source resolution — all five modules must resolve the same way. " +
      "Check that dist/ is either complete or absent.",
    )
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    'const prefsMod = await import(pathToFileURL(process.env.GSD_SETTINGS_PREFS_MODULE).href);',
    'const routerMod = await import(pathToFileURL(process.env.GSD_SETTINGS_ROUTER_MODULE).href);',
    'const budgetMod = await import(pathToFileURL(process.env.GSD_SETTINGS_BUDGET_MODULE).href);',
    'const historyMod = await import(pathToFileURL(process.env.GSD_SETTINGS_HISTORY_MODULE).href);',
    'const metricsMod = await import(pathToFileURL(process.env.GSD_SETTINGS_METRICS_MODULE).href);',

    'const loaded = prefsMod.loadEffectiveGSDPreferences();',
    'let preferences = null;',
    'if (loaded) {',
    '  const p = loaded.preferences;',
    '  preferences = {',
    '    mode: p.mode,',
    '    budgetCeiling: p.budget_ceiling,',
    '    budgetEnforcement: p.budget_enforcement,',
    '    tokenProfile: p.token_profile,',
    '    dynamicRouting: p.dynamic_routing,',
    '    customInstructions: p.custom_instructions,',
    '    alwaysUseSkills: p.always_use_skills,',
    '    preferSkills: p.prefer_skills,',
    '    avoidSkills: p.avoid_skills,',
    '    autoSupervisor: p.auto_supervisor ? {',
    '      enabled: true,',
    '      softTimeoutMinutes: p.auto_supervisor.soft_timeout_minutes,',
    '    } : undefined,',
    '    uatDispatch: p.uat_dispatch,',
    '    autoVisualize: p.auto_visualize,',
    '    remoteQuestions: p.remote_questions ? {',
    '      channel: p.remote_questions.channel,',
    '      channelId: String(p.remote_questions.channel_id),',
    '      timeoutMinutes: p.remote_questions.timeout_minutes,',
    '      pollIntervalSeconds: p.remote_questions.poll_interval_seconds,',
    '    } : undefined,',
    '    scope: loaded.scope,',
    '    path: loaded.path,',
    '    warnings: loaded.warnings,',
    '  };',
    '}',
    'const routingConfig = prefsMod.resolveDynamicRoutingConfig();',
    'const budgetAllocation = budgetMod.computeBudgets(200000);',
    'historyMod.initRoutingHistory(process.env.GSD_SETTINGS_BASE);',
    'const routingHistory = historyMod.getRoutingHistory();',
    'const ledger = metricsMod.loadLedgerFromDisk(process.env.GSD_SETTINGS_BASE);',
    'const projectTotals = ledger ? metricsMod.getProjectTotals(ledger.units) : null;',
    'process.stdout.write(JSON.stringify({ preferences, routingConfig, budgetAllocation, routingHistory, projectTotals }));',
  ].join(" ")

  return runSubprocess<SettingsData>(
    process.execPath,
    [...resolvedPrefs.nodeArgs, script],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        GSD_SETTINGS_PREFS_MODULE: resolvedPrefs.modulePath,
        GSD_SETTINGS_ROUTER_MODULE: resolvedRouter.modulePath,
        GSD_SETTINGS_BUDGET_MODULE: resolvedBudget.modulePath,
        GSD_SETTINGS_HISTORY_MODULE: resolvedHistory.modulePath,
        GSD_SETTINGS_METRICS_MODULE: resolvedMetrics.modulePath,
        GSD_SETTINGS_BASE: projectCwd,
      },
      maxBuffer: SETTINGS_MAX_BUFFER,
      timeout: SETTINGS_TIMEOUT_MS,
    },
    "settings data",
  )
}
