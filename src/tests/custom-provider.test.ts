/**
 * Custom provider onboarding tests.
 *
 * Covers:
 * - Template generation for all 4 presets (ollama, lm-studio, vllm, generic)
 * - shouldRunOnboarding() with custom-only auth (initially failing — T03 implements fix)
 * - No-overwrite guard metadata
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Template generation — all 4 presets
// ═══════════════════════════════════════════════════════════════════════════

test('generateModelsTemplate: ollama preset produces valid JSON with correct fields', async () => {
  const { generateModelsTemplate } = await import('../onboarding.ts')
  const result = generateModelsTemplate('ollama')

  // Must parse as valid JSON
  const parsed = JSON.parse(result.json)

  // Provider structure
  assert.ok(parsed.providers, 'has providers key')
  assert.ok(parsed.providers.ollama, 'has ollama provider')

  const provider = parsed.providers.ollama
  assert.equal(provider.baseUrl, 'http://localhost:11434/v1', 'ollama baseUrl')
  assert.equal(provider.api, 'openai-completions', 'ollama api')
  assert.equal(provider.apiKey, 'ollama', 'ollama apiKey')
  assert.ok(Array.isArray(provider.models), 'has models array')
  assert.ok(provider.models.length >= 1, 'has at least one model')
  assert.equal(provider.models[0].id, 'llama3.1:8b', 'ollama example model id')

  // Metadata
  assert.equal(result.providerName, 'ollama', 'providerName is ollama')
  assert.equal(result.needsApiKey, false, 'ollama does not need API key')
})

test('generateModelsTemplate: lm-studio preset produces valid JSON with correct fields', async () => {
  const { generateModelsTemplate } = await import('../onboarding.ts')
  const result = generateModelsTemplate('lm-studio')

  const parsed = JSON.parse(result.json)
  assert.ok(parsed.providers['lm-studio'], 'has lm-studio provider')

  const provider = parsed.providers['lm-studio']
  assert.equal(provider.baseUrl, 'http://localhost:1234/v1', 'lm-studio baseUrl')
  assert.equal(provider.api, 'openai-completions', 'lm-studio api')
  assert.equal(provider.apiKey, 'lm-studio', 'lm-studio apiKey')
  assert.ok(Array.isArray(provider.models), 'has models array')
  assert.ok(provider.models.length >= 1, 'has at least one model')
  assert.equal(provider.models[0].id, 'loaded-model', 'lm-studio example model id')

  assert.equal(result.providerName, 'lm-studio', 'providerName is lm-studio')
  assert.equal(result.needsApiKey, false, 'lm-studio does not need API key')
})

test('generateModelsTemplate: vllm preset produces valid JSON with correct fields', async () => {
  const { generateModelsTemplate } = await import('../onboarding.ts')
  const result = generateModelsTemplate('vllm')

  const parsed = JSON.parse(result.json)
  assert.ok(parsed.providers.vllm, 'has vllm provider')

  const provider = parsed.providers.vllm
  assert.equal(provider.baseUrl, 'http://localhost:8000/v1', 'vllm baseUrl')
  assert.equal(provider.api, 'openai-completions', 'vllm api')
  assert.equal(provider.apiKey, 'VLLM_API_KEY', 'vllm apiKey')
  assert.ok(Array.isArray(provider.models), 'has models array')
  assert.ok(provider.models.length >= 1, 'has at least one model')
  assert.equal(provider.models[0].id, 'meta-llama/Llama-3.1-8B', 'vllm example model id')

  assert.equal(result.providerName, 'vllm', 'providerName is vllm')
  assert.equal(result.needsApiKey, true, 'vllm needs API key')
})

test('generateModelsTemplate: generic preset produces valid JSON with correct fields', async () => {
  const { generateModelsTemplate } = await import('../onboarding.ts')
  const result = generateModelsTemplate('generic')

  const parsed = JSON.parse(result.json)
  assert.ok(parsed.providers.generic, 'has generic provider')

  const provider = parsed.providers.generic
  assert.equal(provider.baseUrl, 'https://api.example.com/v1', 'generic baseUrl')
  assert.equal(provider.api, 'openai-completions', 'generic api')
  assert.equal(provider.apiKey, 'YOUR_API_KEY', 'generic apiKey')
  assert.ok(Array.isArray(provider.models), 'has models array')
  assert.ok(provider.models.length >= 1, 'has at least one model')
  assert.equal(provider.models[0].id, 'model-name', 'generic example model id')

  assert.equal(result.providerName, 'generic', 'providerName is generic')
  assert.equal(result.needsApiKey, true, 'generic needs API key')
})

test('generateModelsTemplate: unknown preset throws', async () => {
  const { generateModelsTemplate } = await import('../onboarding.ts')
  assert.throws(() => generateModelsTemplate('nonexistent'), /Unknown custom provider preset/)
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Template metadata — no-overwrite guard
// ═══════════════════════════════════════════════════════════════════════════

test('generateModelsTemplate: result includes provider name and preset type for overwrite guard', async () => {
  const { generateModelsTemplate, CUSTOM_PROVIDER_PRESETS } = await import('../onboarding.ts')

  for (const preset of Object.keys(CUSTOM_PROVIDER_PRESETS)) {
    const result = generateModelsTemplate(preset)

    // providerName allows the wizard to check for existing provider configs
    assert.ok(result.providerName, `preset ${preset} has providerName`)
    assert.equal(result.providerName, preset, `preset ${preset} providerName matches preset key`)

    // needsApiKey allows the wizard to skip/show the API key prompt
    assert.equal(typeof result.needsApiKey, 'boolean', `preset ${preset} needsApiKey is boolean`)

    // JSON is parseable (double-check for overwrite guard file content comparison)
    const parsed = JSON.parse(result.json)
    assert.ok(parsed.providers[preset], `preset ${preset} JSON contains provider key matching preset name`)
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Template file write round-trip
// ═══════════════════════════════════════════════════════════════════════════

test('generateModelsTemplate: write to disk, read back, and verify schema structure', async () => {
  const { generateModelsTemplate, CUSTOM_PROVIDER_PRESETS } = await import('../onboarding.ts')

  const tmp = mkdtempSync(join(tmpdir(), 'gsd-template-write-'))

  try {
    for (const preset of Object.keys(CUSTOM_PROVIDER_PRESETS)) {
      const { json, providerName, needsApiKey } = generateModelsTemplate(preset)

      // Write to temp dir
      const filePath = join(tmp, `models-${preset}.json`)
      writeFileSync(filePath, json, 'utf-8')

      // Read back and parse
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw)

      // Verify top-level schema structure
      assert.ok(parsed.providers, `${preset}: has providers key`)
      assert.ok(parsed.providers[providerName], `${preset}: has provider key matching providerName`)

      const provider = parsed.providers[providerName]
      assert.equal(typeof provider.baseUrl, 'string', `${preset}: baseUrl is string`)
      assert.equal(typeof provider.api, 'string', `${preset}: api is string`)
      assert.equal(typeof provider.apiKey, 'string', `${preset}: apiKey is string`)
      assert.ok(Array.isArray(provider.models), `${preset}: models is array`)
      assert.ok(provider.models.length >= 1, `${preset}: has at least one model`)
      assert.equal(typeof provider.models[0].id, 'string', `${preset}: model id is string`)

      // Verify metadata matches preset config
      const config = CUSTOM_PROVIDER_PRESETS[preset]
      assert.equal(provider.baseUrl, config.baseUrl, `${preset}: baseUrl matches config`)
      assert.equal(provider.api, config.api, `${preset}: api matches config`)
      assert.equal(needsApiKey, config.needsApiKey, `${preset}: needsApiKey matches config`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. shouldRunOnboarding with custom-only auth
// ═══════════════════════════════════════════════════════════════════════════

test('shouldRunOnboarding: returns false when models.json exists but no LLM provider authed', async () => {
  const { shouldRunOnboarding } = await import('../onboarding.ts')
  const { AuthStorage } = await import('@mariozechner/pi-coding-agent')

  // Create temp dir with auth.json (no LLM providers) and models.json
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-custom-provider-test-'))
  const authPath = join(tmp, 'auth.json')
  const modelsPath = join(tmp, 'models.json')

  // Only a custom provider key stored — not in LLM_PROVIDER_IDS
  writeFileSync(authPath, JSON.stringify({
    ollama: { type: 'api_key', key: 'ollama' },
  }))

  // models.json exists — user has configured a custom provider
  writeFileSync(modelsPath, JSON.stringify({
    providers: {
      ollama: {
        baseUrl: 'http://localhost:11434/v1',
        api: 'openai-completions',
        apiKey: 'ollama',
        models: [{ id: 'llama3.1:8b' }],
      },
    },
  }))

  // Temporarily patch stdin.isTTY to simulate interactive terminal,
  // otherwise shouldRunOnboarding short-circuits to false before
  // checking auth state.
  const origIsTTY = process.stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })

  try {
    const auth = AuthStorage.create(authPath)

    // With models.json present, shouldRunOnboarding should return false
    // even though no known LLM provider is in auth — the user has a custom provider.
    const result = shouldRunOnboarding(auth, tmp)
    assert.equal(result, false,
      'shouldRunOnboarding should return false when models.json exists (custom provider configured)')
  } finally {
    Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true })
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('shouldRunOnboarding: returns true when neither LLM auth nor models.json exists', async () => {
  const { shouldRunOnboarding } = await import('../onboarding.ts')
  const { AuthStorage } = await import('@mariozechner/pi-coding-agent')

  // Create temp dir with empty auth.json (no providers) and NO models.json
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-no-auth-test-'))
  const authPath = join(tmp, 'auth.json')

  writeFileSync(authPath, JSON.stringify({}))

  const origIsTTY = process.stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })

  try {
    const auth = AuthStorage.create(authPath)

    // No LLM auth, no models.json — fresh user, should see onboarding
    const result = shouldRunOnboarding(auth, tmp)
    assert.equal(result, true,
      'shouldRunOnboarding should return true for a fresh user with no auth and no models.json')
  } finally {
    Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true })
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('shouldRunOnboarding: returns false when known LLM provider is authed (existing behavior)', async () => {
  const { shouldRunOnboarding } = await import('../onboarding.ts')
  const { AuthStorage } = await import('@mariozechner/pi-coding-agent')

  // Create temp dir with anthropic auth but NO models.json
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-llm-auth-test-'))
  const authPath = join(tmp, 'auth.json')

  writeFileSync(authPath, JSON.stringify({
    anthropic: { type: 'api_key', key: 'sk-ant-test123' },
  }))

  const origIsTTY = process.stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })

  try {
    const auth = AuthStorage.create(authPath)

    // Anthropic is a known LLM provider — should skip onboarding
    const result = shouldRunOnboarding(auth, tmp)
    assert.equal(result, false,
      'shouldRunOnboarding should return false when a known LLM provider is authed')
  } finally {
    Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true })
    rmSync(tmp, { recursive: true, force: true })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// S02: Error surfacing, startup fallback, and auto-mode provider restore
// ═══════════════════════════════════════════════════════════════════════════

// --- 5. ModelRegistry error surfacing ---

test('ModelRegistry.getError: returns undefined for valid models.json', async () => {
  const { ModelRegistry, AuthStorage } = await import('@mariozechner/pi-coding-agent')

  const tmp = mkdtempSync(join(tmpdir(), 'gsd-error-surface-'))
  const authPath = join(tmp, 'auth.json')
  const modelsPath = join(tmp, 'models.json')

  writeFileSync(authPath, JSON.stringify({}))
  writeFileSync(modelsPath, JSON.stringify({
    providers: {
      ollama: {
        baseUrl: 'http://localhost:11434/v1',
        api: 'openai-completions',
        apiKey: 'ollama',
        models: [{ id: 'llama3.1:8b' }],
      },
    },
  }))

  try {
    const auth = AuthStorage.create(authPath)
    const registry = new ModelRegistry(auth, modelsPath)
    assert.equal(registry.getError(), undefined, 'valid models.json should produce no error')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('ModelRegistry.getError: returns error string for malformed models.json', async () => {
  const { ModelRegistry, AuthStorage } = await import('@mariozechner/pi-coding-agent')

  const tmp = mkdtempSync(join(tmpdir(), 'gsd-error-surface-'))
  const authPath = join(tmp, 'auth.json')
  const modelsPath = join(tmp, 'models.json')

  writeFileSync(authPath, JSON.stringify({}))
  writeFileSync(modelsPath, '{ this is not valid JSON }}}')

  try {
    const auth = AuthStorage.create(authPath)
    const registry = new ModelRegistry(auth, modelsPath)
    const error = registry.getError()
    assert.ok(error, 'malformed models.json should produce an error')
    assert.equal(typeof error, 'string', 'error should be a string')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('ModelRegistry.getError: returns undefined when no models.json exists', async () => {
  const { ModelRegistry, AuthStorage } = await import('@mariozechner/pi-coding-agent')

  const tmp = mkdtempSync(join(tmpdir(), 'gsd-error-surface-'))
  const authPath = join(tmp, 'auth.json')
  const modelsPath = join(tmp, 'nonexistent-models.json')

  writeFileSync(authPath, JSON.stringify({}))

  try {
    const auth = AuthStorage.create(authPath)
    const registry = new ModelRegistry(auth, modelsPath)
    assert.equal(registry.getError(), undefined, 'missing models.json should not produce an error')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// --- 6. Generalized startup fallback ---

test('Startup fallback: picks Anthropic model when Anthropic auth is available', async () => {
  const { ModelRegistry, AuthStorage } = await import('@mariozechner/pi-coding-agent')

  const tmp = mkdtempSync(join(tmpdir(), 'gsd-fallback-'))
  const authPath = join(tmp, 'auth.json')

  // Give Anthropic a valid key so models are "available"
  writeFileSync(authPath, JSON.stringify({
    anthropic: { type: 'api_key', key: 'sk-ant-test123' },
  }))

  try {
    const auth = AuthStorage.create(authPath)
    const registry = new ModelRegistry(auth)
    const available = registry.getAvailable()

    // Simulate the fallback logic from cli.ts
    const preferred =
      available.find((m) => m.provider === 'anthropic' && m.id === 'claude-opus-4-6') ||
      available.find((m) => m.provider === 'anthropic' && m.id.includes('opus')) ||
      available.find((m) => m.provider === 'anthropic') ||
      available[0]

    assert.ok(preferred, 'should find a preferred model')
    assert.equal(preferred.provider, 'anthropic', 'should pick Anthropic when available')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('Startup fallback: picks custom provider model when only custom provider is available', async () => {
  const { ModelRegistry, AuthStorage } = await import('@mariozechner/pi-coding-agent')

  const tmp = mkdtempSync(join(tmpdir(), 'gsd-fallback-'))
  const authPath = join(tmp, 'auth.json')
  const modelsPath = join(tmp, 'models.json')

  // No Anthropic key — only custom provider auth
  writeFileSync(authPath, JSON.stringify({
    ollama: { type: 'api_key', key: 'ollama' },
  }))
  writeFileSync(modelsPath, JSON.stringify({
    providers: {
      ollama: {
        baseUrl: 'http://localhost:11434/v1',
        api: 'openai-completions',
        apiKey: 'ollama',
        models: [{ id: 'llama3.1:8b' }],
      },
    },
  }))

  try {
    const auth = AuthStorage.create(authPath)
    const registry = new ModelRegistry(auth, modelsPath)
    const available = registry.getAvailable()

    // Simulate the fallback logic from cli.ts
    const preferred =
      available.find((m) => m.provider === 'anthropic' && m.id === 'claude-opus-4-6') ||
      available.find((m) => m.provider === 'anthropic' && m.id.includes('opus')) ||
      available.find((m) => m.provider === 'anthropic') ||
      available[0]

    assert.ok(preferred, 'should find a preferred model')
    assert.equal(preferred.provider, 'ollama', 'should pick custom provider when Anthropic unavailable')
    assert.equal(preferred.id, 'llama3.1:8b', 'should pick the custom provider model')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('Startup fallback: handles zero available models gracefully', async () => {
  const { ModelRegistry, AuthStorage } = await import('@mariozechner/pi-coding-agent')

  const tmp = mkdtempSync(join(tmpdir(), 'gsd-fallback-'))
  const authPath = join(tmp, 'auth.json')

  // No auth at all — no models should be available
  writeFileSync(authPath, JSON.stringify({}))

  try {
    const auth = AuthStorage.create(authPath)
    const registry = new ModelRegistry(auth)
    const available = registry.getAvailable()

    // Simulate the fallback logic from cli.ts
    const preferred =
      available.find((m) => m.provider === 'anthropic' && m.id === 'claude-opus-4-6') ||
      available.find((m) => m.provider === 'anthropic' && m.id.includes('opus')) ||
      available.find((m) => m.provider === 'anthropic') ||
      available[0]

    // With no auth, preferred should be undefined — no crash
    assert.equal(preferred, undefined, 'should be undefined when no models are available')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// --- 7. Auto-mode provider storage and restore ---

test('Auto-mode: originalProvider is exported and tracks provider alongside modelId', async () => {
  // We test the auto.ts module state variables indirectly by verifying the code
  // structure. Direct auto-mode testing requires ExtensionContext which is complex
  // to mock, so we verify the code shape.
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')

  const autoSource = readFileSync(
    join(import.meta.dirname, '..', 'resources', 'extensions', 'gsd', 'auto.ts'),
    'utf-8'
  )

  // Verify originalProvider state variable exists
  assert.ok(
    autoSource.includes('let originalProvider: string | null = null'),
    'auto.ts should declare originalProvider state variable'
  )

  // Verify originalProvider is captured alongside originalModelId
  assert.ok(
    autoSource.includes('originalProvider = ctx.model?.provider ?? null'),
    'auto.ts should capture originalProvider from ctx.model'
  )

  // Verify stopAuto uses originalProvider instead of hardcoded "anthropic"
  assert.ok(
    autoSource.includes('ctx.modelRegistry.find(originalProvider, originalModelId)'),
    'stopAuto should use originalProvider for model restore, not hardcoded "anthropic"'
  )

  // Verify stopAuto clears originalProvider
  assert.ok(
    autoSource.includes('originalProvider = null'),
    'stopAuto should clear originalProvider after restore'
  )

  // Verify pauseAuto preservation comment includes originalProvider
  assert.ok(
    autoSource.includes('originalProvider\n  // — all needed'),
    'pauseAuto preservation comment should list originalProvider'
  )
})

test('Auto-mode: stopAuto guard requires both originalProvider and originalModelId', async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')

  const autoSource = readFileSync(
    join(import.meta.dirname, '..', 'resources', 'extensions', 'gsd', 'auto.ts'),
    'utf-8'
  )

  // Verify the guard checks both variables
  assert.ok(
    autoSource.includes('originalModelId && originalProvider'),
    'stopAuto should guard on both originalModelId and originalProvider'
  )
})

// --- 8. cli.ts error surfacing integration ---

test('cli.ts: error surfacing block checks modelRegistry.getError() after construction', async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')

  const cliSource = readFileSync(
    join(import.meta.dirname, '..', 'cli.ts'),
    'utf-8'
  )

  // Verify getError() is called after ModelRegistry construction
  const registryLine = cliSource.indexOf('new ModelRegistry(authStorage)')
  const errorCheckLine = cliSource.indexOf('modelRegistry.getError()')
  assert.ok(registryLine > -1, 'cli.ts should construct ModelRegistry')
  assert.ok(errorCheckLine > -1, 'cli.ts should call modelRegistry.getError()')
  assert.ok(errorCheckLine > registryLine, 'getError() check should come after ModelRegistry construction')

  // Verify it's a warning, not a crash
  assert.ok(
    cliSource.includes('console.error') && cliSource.includes('models.json error'),
    'cli.ts should emit a console.error warning about models.json errors'
  )
})

test('cli.ts: startup fallback uses getAvailable() and falls back to any model', async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')

  const cliSource = readFileSync(
    join(import.meta.dirname, '..', 'cli.ts'),
    'utf-8'
  )

  // Verify fallback uses getAvailable() instead of getAll()
  const fallbackSection = cliSource.slice(
    cliSource.indexOf('if (!configuredModel || !configuredExists)'),
    cliSource.indexOf('// Default thinking level')
  )

  assert.ok(
    fallbackSection.includes('modelRegistry.getAvailable()'),
    'fallback should use getAvailable() to check auth status'
  )

  // Verify it tries Anthropic first
  assert.ok(
    fallbackSection.includes("m.provider === 'anthropic'"),
    'fallback should try Anthropic models first'
  )

  // Verify it falls back to available[0]
  assert.ok(
    fallbackSection.includes('available[0]'),
    'fallback should fall back to any available model'
  )
})
