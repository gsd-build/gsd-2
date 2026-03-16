import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SettingsManager,
  SessionManager,
  createAgentSession,
  InteractiveMode,
  runPrintMode,
  runRpcMode,
} from '@gsd/pi-coding-agent'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agentDir, sessionsDir, authFilePath } from './app-paths.js'
import {
  getProjectSessionsDir,
  migrateLegacyFlatSessions,
  parseCliArgs,
  runWebCliBranch,
  type RunWebCliBranchDeps,
} from './cli-web-branch.js'
import { stopWebMode } from './web-mode.js'
import { initResources, buildResourceLoader } from './resource-loader.js'
import { ensureManagedTools } from './tool-bootstrap.js'
import { loadStoredEnvKeys } from './wizard.js'
import { getPiDefaultModelAndProvider, migratePiCredentials } from './pi-migration.js'
import { shouldRunOnboarding, runOnboarding } from './onboarding.js'
import { checkForUpdates } from './update-check.js'

type WritableLike = Pick<typeof process.stdout, 'write'>

type ExitFn = (code: number) => never | void

export interface CliDeps extends RunWebCliBranchDeps {
  ensureManagedTools?: typeof ensureManagedTools
  createAuthStorage?: (path: string) => ReturnType<typeof AuthStorage.create>
  loadStoredEnvKeys?: typeof loadStoredEnvKeys
  migratePiCredentials?: typeof migratePiCredentials
  shouldRunOnboarding?: typeof shouldRunOnboarding
  runOnboarding?: typeof runOnboarding
  checkForUpdates?: typeof checkForUpdates
  createModelRegistry?: (authStorage: ReturnType<typeof AuthStorage.create>) => ModelRegistry
  createSettingsManager?: (dir: string) => SettingsManager
  createAgentSession?: typeof createAgentSession
  createInteractiveMode?: (session: Awaited<ReturnType<typeof createAgentSession>>['session']) => { run: () => Promise<void> }
  initResources?: typeof initResources
  buildResourceLoader?: typeof buildResourceLoader
  stdin?: { isTTY?: boolean }
  stdout?: WritableLike
  stderr?: WritableLike
  exit?: ExitFn
  importRunUpdate?: () => Promise<{ runUpdate: () => Promise<void> }>
  stopWebMode?: typeof stopWebMode
}

function writeHelp(stdout: WritableLike): void {
  stdout.write(`GSD v${process.env.GSD_VERSION || '0.0.0'} — Get Shit Done\n\n`)
  stdout.write('Usage: gsd [options] [message...]\n\n')
  stdout.write('Options:\n')
  stdout.write('  --mode <text|json|rpc>   Output mode (default: interactive)\n')
  stdout.write('  --print, -p              Single-shot print mode\n')
  stdout.write('  --web [path]             Launch browser-only web mode (optionally for a different project)\n')
  stdout.write('  --continue, -c           Resume the most recent session\n')
  stdout.write('  --model <id>             Override model (e.g. claude-opus-4-6)\n')
  stdout.write('  --no-session             Disable session persistence\n')
  stdout.write('  --extension <path>       Load additional extension\n')
  stdout.write('  --tools <a,b,c>          Restrict available tools\n')
  stdout.write('  --list-models [search]   List available models and exit\n')
  stdout.write('  --version, -v            Print version and exit\n')
  stdout.write('  --help, -h               Print this help and exit\n')
  stdout.write('\nSubcommands:\n')
  stdout.write('  config                   Re-run the setup wizard\n')
  stdout.write('  update                   Update GSD to the latest version\n')
  stdout.write('  web [start] [path]       Launch web mode (optionally for a different project)\n')
  stdout.write('  web stop [path|all]      Stop web server (specific project, or all)\n')
}

function exitAndReturn(exit: ExitFn, code: number): number {
  exit(code)
  return code
}

function emitExtensionLoadErrors(stderr: WritableLike, errors: Array<{ error: unknown }>): void {
  if (errors.length === 0) return
  for (const err of errors) {
    stderr.write(`[gsd] Extension load error: ${err.error}\n`)
  }
}

export async function runCli(argv = process.argv, deps: CliDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout
  const stderr = deps.stderr ?? process.stderr
  const stdin = deps.stdin ?? process.stdin
  const exit = deps.exit ?? ((code: number) => process.exit(code))
  const currentCwd = (deps.cwd ?? (() => process.cwd()))()
  const cliFlags = parseCliArgs(argv)
  const isPrintMode = cliFlags.print || cliFlags.mode !== undefined

  if (cliFlags.version) {
    stdout.write((process.env.GSD_VERSION || '0.0.0') + '\n')
    return exitAndReturn(exit, 0)
  }

  if (cliFlags.help) {
    writeHelp(stdout)
    return exitAndReturn(exit, 0)
  }

  const ensureManagedToolsFn = deps.ensureManagedTools ?? ensureManagedTools
  ensureManagedToolsFn(join(agentDir, 'bin'))

  const createAuthStorage = deps.createAuthStorage ?? ((path: string) => AuthStorage.create(path))
  const authStorage = createAuthStorage(authFilePath)

  if (cliFlags.messages[0] === 'config') {
    await (deps.runOnboarding ?? runOnboarding)(authStorage)
    return exitAndReturn(exit, 0)
  }

  if (cliFlags.messages[0] === 'update') {
    const { runUpdate } = await (deps.importRunUpdate ?? (() => import('./update-cmd.js')) )()
    await runUpdate()
    return exitAndReturn(exit, 0)
  }

  // Handle `gsd web stop` before the --web branch so it doesn't require the flag
  if (cliFlags.messages[0] === 'web' && cliFlags.messages[1] === 'stop') {
    const webBranch = await runWebCliBranch(cliFlags, {
      stopWebMode: deps.stopWebMode,
      cwd: deps.cwd,
      stderr,
      baseSessionsDir: sessionsDir,
      agentDir,
    })
    if (webBranch.handled) {
      return exitAndReturn(exit, webBranch.exitCode)
    }
  }

  ;(deps.loadStoredEnvKeys ?? loadStoredEnvKeys)(authStorage)
  ;(deps.migratePiCredentials ?? migratePiCredentials)(authStorage)

  const projectSessionsDir = getProjectSessionsDir(currentCwd)

  const webBranch = await runWebCliBranch(cliFlags, {
    runWebMode: deps.runWebMode,
    cwd: () => currentCwd,
    stderr,
    baseSessionsDir: sessionsDir,
    agentDir,
  })
  if (webBranch.handled) {
    return exitAndReturn(exit, webBranch.exitCode)
  }

  if (!isPrintMode && (deps.shouldRunOnboarding ?? shouldRunOnboarding)(authStorage)) {
    await (deps.runOnboarding ?? runOnboarding)(authStorage)
  }

  if (!isPrintMode) {
    void (deps.checkForUpdates ?? checkForUpdates)().catch(() => {})
  }

  const modelRegistry = (deps.createModelRegistry ?? ((storage) => new ModelRegistry(storage)))(authStorage)
  const settingsManager = (deps.createSettingsManager ?? ((dir: string) => SettingsManager.create(dir)))(agentDir)

  if (cliFlags.listModels !== undefined) {
    const models = modelRegistry.getAvailable()
    if (models.length === 0) {
      stdout.write('No models available. Set API keys in environment variables.\n')
      return exitAndReturn(exit, 0)
    }

    const searchPattern = typeof cliFlags.listModels === 'string' ? cliFlags.listModels : undefined
    let filtered = models
    if (searchPattern) {
      const query = searchPattern.toLowerCase()
      filtered = models.filter((model) => `${model.provider} ${model.id} ${model.name}`.toLowerCase().includes(query))
    }

    filtered.sort((a, b) => {
      const nameCmp = b.name.localeCompare(a.name)
      if (nameCmp !== 0) return nameCmp
      const provCmp = a.provider.localeCompare(b.provider)
      if (provCmp !== 0) return provCmp
      return a.id.localeCompare(b.id)
    })

    const fmt = (n: number) => n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}K` : `${n}`
    const rows = filtered.map((model) => [
      model.provider,
      model.id,
      model.name,
      fmt(model.contextWindow),
      fmt(model.maxTokens),
      model.reasoning ? 'yes' : 'no',
    ])
    const headers = ['provider', 'model', 'name', 'context', 'max-out', 'thinking']
    const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)))
    const pad = (value: string, width: number) => value.padEnd(width)
    stdout.write(headers.map((header, index) => pad(header, widths[index])).join('  ') + '\n')
    for (const row of rows) {
      stdout.write(row.map((cell, index) => pad(cell, widths[index])).join('  ') + '\n')
    }
    return exitAndReturn(exit, 0)
  }

  const configuredProvider = settingsManager.getDefaultProvider()
  const configuredModel = settingsManager.getDefaultModel()
  const allModels = modelRegistry.getAll()
  const availableModels = modelRegistry.getAvailable()
  const configuredExists = configuredProvider && configuredModel &&
    allModels.some((model) => model.provider === configuredProvider && model.id === configuredModel)
  const configuredAvailable = configuredProvider && configuredModel &&
    availableModels.some((model) => model.provider === configuredProvider && model.id === configuredModel)

  if (!configuredModel || !configuredExists || !configuredAvailable) {
    const piDefault = getPiDefaultModelAndProvider()
    const preferred =
      (piDefault
        ? availableModels.find((model) => model.provider === piDefault.provider && model.id === piDefault.model)
        : undefined) ||
      availableModels.find((model) => model.provider === 'openai' && model.id === 'gpt-5.4') ||
      availableModels.find((model) => model.provider === 'openai') ||
      availableModels.find((model) => model.provider === 'anthropic' && model.id === 'claude-opus-4-6') ||
      availableModels.find((model) => model.provider === 'anthropic' && model.id.includes('opus')) ||
      availableModels.find((model) => model.provider === 'anthropic') ||
      availableModels[0]

    if (preferred) {
      settingsManager.setDefaultModelAndProvider(preferred.provider, preferred.id)
    }
  }

  if (settingsManager.getDefaultThinkingLevel() !== 'off' && (!configuredExists || !configuredAvailable)) {
    settingsManager.setDefaultThinkingLevel('off')
  }

  if (!settingsManager.getQuietStartup()) {
    settingsManager.setQuietStartup(true)
  }

  if (!settingsManager.getCollapseChangelog()) {
    settingsManager.setCollapseChangelog(true)
  }

  if (isPrintMode) {
    const sessionManager = cliFlags.noSession
      ? SessionManager.inMemory()
      : SessionManager.create(currentCwd)

    let appendSystemPrompt: string | undefined
    if (cliFlags.appendSystemPrompt) {
      try {
        appendSystemPrompt = readFileSync(cliFlags.appendSystemPrompt, 'utf-8')
      } catch {
        appendSystemPrompt = cliFlags.appendSystemPrompt
      }
    }

    ;(deps.initResources ?? initResources)(agentDir)
    const resourceLoader = new DefaultResourceLoader({
      agentDir,
      additionalExtensionPaths: cliFlags.extensions.length > 0 ? cliFlags.extensions : undefined,
      appendSystemPrompt,
    })
    await resourceLoader.reload()

    const { session, extensionsResult } = await (deps.createAgentSession ?? createAgentSession)({
      authStorage,
      modelRegistry,
      settingsManager,
      sessionManager,
      resourceLoader,
    })

    emitExtensionLoadErrors(stderr, extensionsResult.errors)

    if (cliFlags.model) {
      const available = modelRegistry.getAvailable()
      const match =
        available.find((model) => model.id === cliFlags.model) ||
        available.find((model) => `${model.provider}/${model.id}` === cliFlags.model)
      if (match) {
        session.setModel(match)
      }
    }

    const mode = cliFlags.mode || 'text'
    if (mode === 'rpc') {
      await runRpcMode(session)
      return exitAndReturn(exit, 0)
    }

    await runPrintMode(session, {
      mode,
      messages: cliFlags.messages,
    })
    return exitAndReturn(exit, 0)
  }

  migrateLegacyFlatSessions(sessionsDir, projectSessionsDir)

  const sessionManager = cliFlags.continue
    ? SessionManager.continueRecent(currentCwd, projectSessionsDir)
    : SessionManager.create(currentCwd, projectSessionsDir)

  ;(deps.initResources ?? initResources)(agentDir)
  const resourceLoader = (deps.buildResourceLoader ?? buildResourceLoader)(agentDir)
  await resourceLoader.reload()

  const { session, extensionsResult } = await (deps.createAgentSession ?? createAgentSession)({
    authStorage,
    modelRegistry,
    settingsManager,
    sessionManager,
    resourceLoader,
  })

  emitExtensionLoadErrors(stderr, extensionsResult.errors)

  const enabledModelPatterns = settingsManager.getEnabledModels()
  if (enabledModelPatterns && enabledModelPatterns.length > 0) {
    const scopedAvailableModels = modelRegistry.getAvailable()
    const scopedModels: Array<{ model: (typeof scopedAvailableModels)[number] }> = []
    const seen = new Set<string>()

    for (const pattern of enabledModelPatterns) {
      const slashIdx = pattern.indexOf('/')
      if (slashIdx !== -1) {
        const provider = pattern.substring(0, slashIdx)
        const modelId = pattern.substring(slashIdx + 1)
        const model = scopedAvailableModels.find((candidate) => candidate.provider === provider && candidate.id === modelId)
        if (model) {
          const key = `${model.provider}/${model.id}`
          if (!seen.has(key)) {
            seen.add(key)
            scopedModels.push({ model })
          }
        }
      } else {
        const model = scopedAvailableModels.find((candidate) => candidate.id === pattern)
        if (model) {
          const key = `${model.provider}/${model.id}`
          if (!seen.has(key)) {
            seen.add(key)
            scopedModels.push({ model })
          }
        }
      }
    }

    if (scopedModels.length > 0 && scopedModels.length < scopedAvailableModels.length) {
      session.setScopedModels(scopedModels)
    }
  }

  if (!stdin.isTTY) {
    stderr.write('[gsd] Error: Interactive mode requires a terminal (TTY).\n')
    stderr.write('[gsd] Non-interactive alternatives:\n')
    stderr.write('[gsd]   gsd --print "your message"     Single-shot prompt\n')
    stderr.write('[gsd]   gsd --web [path]               Browser-only web mode\n')
    stderr.write('[gsd]   gsd --mode rpc               JSON-RPC over stdin/stdout\n')
    stderr.write('[gsd]   gsd --mode text "message"    Text output mode\n')
    return exitAndReturn(exit, 1)
  }

  const interactiveMode = (deps.createInteractiveMode ?? ((agentSession) => new InteractiveMode(agentSession)))(session)
  await interactiveMode.run()
  return 0
}

if (process.env.GSD_SKIP_CLI_AUTORUN !== '1') {
  await runCli()
}
