/**
 * Tests for `gsd auto` routing — verifies that `auto` is recognized as a
 * subcommand alias for `headless auto` only when stdin or stdout are not TTYs.
 *
 * Regression test for #2732.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { shouldRedirectAutoToHeadless } from '../cli-auto-routing.js'

test('routes `gsd auto` with piped stdout to headless mode (#2732)', () => {
  assert.equal(shouldRedirectAutoToHeadless('auto', true, false), true)
})

test('routes `gsd auto` with piped stdin to headless mode', () => {
  assert.equal(shouldRedirectAutoToHeadless('auto', false, true), true)
})

test('src/cli.ts routes `gsd auto` with piped stdout through the headless entrypoint', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'gsd-auto-cli-route-'))
  const loaderPath = join(tempDir, 'stub-loader.mjs')
  try {
    writeFileSync(loaderPath, `
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = pathToFileURL(process.cwd() + '/').href
const modules = new Map([
  ['stub:pi-coding-agent', \`
    export class AuthStorage {}
    export const DEFAULT_MAX_BYTES = 0
    export const DEFAULT_MAX_LINES = 0
    export function createBashTool() {}
    export function createEditTool() {}
    export function createReadTool() {}
    export function createWriteTool() {}
    export function formatSize() { return '' }
    export function getAgentDir() { return '' }
    export function getAllToolCompatibility() { return {} }
    export function getLoadedSkills() { return [] }
    export function getToolCompatibility() { return {} }
    export function importExtensionModule() { return {} }
    export function isToolCallEventType() { return false }
    export function parseFrontmatter() { return {} }
    export function setAllowedCommandPrefixes() {}
    export function truncateHead(value) { return value }
  \`],
  ['stub:pi-ai', \`
    export async function completeSimple() { return {} }
    export function getEnvApiKey() { return undefined }
    export function getProviderCapabilities() { return {} }
    export function isAnthropicApi() { return false }
    export function StringEnum() { return {} }
  \`],
  ['stub:pi-tui', \`
    export const Key = {}
    export const Text = {}
    export function matchesKey() { return false }
    export function truncateToWidth(value) { return String(value) }
    export function visibleWidth(value) { return String(value).length }
    export function wrapTextWithAnsi(value) { return [String(value)] }
  \`],
  ['stub:chalk', \`
    const passthrough = (value) => String(value)
    passthrough.bold = passthrough
    passthrough.dim = passthrough
    passthrough.yellow = passthrough
    passthrough.green = passthrough
    passthrough.cyan = passthrough
    passthrough.red = passthrough
    export default passthrough
  \`],
  ['stub:headless', \`
    export function parseHeadlessArgs(argv) {
      process.stderr.write('AUTO_REDIRECT_ARGV ' + JSON.stringify(argv) + '\\\\n')
      return { argv }
    }
    export async function runHeadless(options) {
      process.stderr.write('AUTO_REDIRECT_RUN ' + JSON.stringify(options) + '\\\\n')
    }
  \`],
])

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@gsd/pi-coding-agent') return { url: 'stub:pi-coding-agent', shortCircuit: true }
  if (specifier === '@gsd/pi-ai' || specifier === '@gsd/pi-ai/oauth') return { url: 'stub:pi-ai', shortCircuit: true }
  if (specifier === '@gsd/pi-tui') return { url: 'stub:pi-tui', shortCircuit: true }
  if (specifier === 'chalk') return { url: 'stub:chalk', shortCircuit: true }
  if (specifier === './headless.js' && context.parentURL?.endsWith('/src/cli.ts')) {
    return { url: 'stub:headless', shortCircuit: true }
  }
  if (
    specifier.endsWith('.js') &&
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL?.startsWith(root)
  ) {
    const url = new URL(specifier.replace(/\\.js$/, '.ts'), context.parentURL)
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  const source = modules.get(url)
  if (source !== undefined) return { format: 'module', source, shortCircuit: true }
  return nextLoad(url, context)
}
`)

    const registerLoader = `
      import { register } from 'node:module'
      import { pathToFileURL } from 'node:url'
      Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true })
      Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false })
      register(${JSON.stringify(pathToFileURL(loaderPath).href)}, pathToFileURL('./'))
    `
    const result = spawnSync(process.execPath, [
      '--import',
      `data:text/javascript,${encodeURIComponent(registerLoader)}`,
      '--experimental-strip-types',
      join(process.cwd(), 'src', 'cli.ts'),
      'auto',
      '--model',
      'test-model',
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GSD_HOME: join(tempDir, 'home'),
        GSD_RTK_DISABLED: '1',
      },
      encoding: 'utf8',
      input: '',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    assert.equal(result.status, 0, result.stderr)
    const markerLine = result.stderr
      .split(/\r?\n/)
      .find((line) => line.startsWith('AUTO_REDIRECT_ARGV '))
    assert.ok(markerLine, result.stderr)

    const headlessArgv = JSON.parse(markerLine.slice('AUTO_REDIRECT_ARGV '.length)) as string[]
    assert.deepEqual(headlessArgv.slice(2), ['headless', '--model', 'test-model', 'auto'])
    assert.match(result.stderr, /AUTO_REDIRECT_RUN /)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('keeps terminal `gsd auto` on the interactive path', () => {
  assert.equal(shouldRedirectAutoToHeadless('auto', true, true), false)
})

test('does not route non-auto subcommands through auto headless mode', () => {
  assert.equal(shouldRedirectAutoToHeadless('headless', true, false), false)
  assert.equal(shouldRedirectAutoToHeadless('config', true, false), false)
  assert.equal(shouldRedirectAutoToHeadless(undefined, false, false), false)
})
