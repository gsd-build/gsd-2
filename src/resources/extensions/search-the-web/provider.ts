/**
 * Search provider selection and preference management.
 *
 * Single source of truth for which search backend (Tavily vs Brave) to use.
 * Reads API keys from process.env at call time (not module load time) so
 * hot-reloaded keys work. Preference is stored in auth.json under the
 * synthetic provider key `search_provider` as { type: "api_key", key: "tavily" | "brave" | "auto" }.
 *
 * @see S01-RESEARCH.md for the storage decision rationale (D002).
 */

import { AuthStorage } from '@gsd/pi-coding-agent'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { resolveSearchProviderFromPreferences } from '../gsd/preferences.js'
import { gsdHome } from "../gsd/gsd-home.js";

// Compute authFilePath lazily so GSD_HOME overrides (e.g. in tests) take effect.
// Imported locally instead of from app-paths.ts because extensions are copied to
// ~/.gsd/agent/extensions/ at runtime where '../../../app-paths.ts' doesn't resolve.
function authFilePath(): string {
  return join(gsdHome(), 'agent', 'auth.json');
}

export type SearchProvider = 'tavily' | 'brave' | 'ollama'
export type SearchProviderPreference = SearchProvider | 'auto'

const VALID_PREFERENCES = new Set<string>(['tavily', 'brave', 'ollama', 'auto'])
const PREFERENCE_KEY = 'search_provider'
export const MISSING_SEARCH_API_KEY_MESSAGE =
  "No search API key is set. Configure TAVILY_API_KEY, BRAVE_API_KEY, or OLLAMA_API_KEY via live env, GSD keys, or project .env/.env.local, then retry."

function getStoredApiKey(providerId: SearchProvider): string {
  try {
    const auth = AuthStorage.create(authFilePath())
    const cred = auth.getCredentialsForProvider(providerId).find(c => c.type === 'api_key' && c.key)
    return cred?.type === 'api_key' ? cred.key : ''
  } catch {
    return ''
  }
}

function parseDotenvValue(content: string, key: string): string {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match || match[1] !== key) continue
    const value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1)
    }
    return value.replace(/\s+#.*$/, '').trim()
  }
  return ''
}

function projectRootCandidates(): string[] {
  const roots: string[] = []
  const add = (dir: string | undefined): void => {
    if (!dir) return
    const resolved = resolve(dir)
    if (!roots.includes(resolved)) roots.push(resolved)
  }

  add(process.env.GSD_PROJECT_ROOT)

  let current = resolve(process.cwd())
  while (true) {
    add(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return roots
}

function readProjectDotenvKey(envVar: string): string {
  for (const root of projectRootCandidates()) {
    for (const fileName of ['.env', '.env.local']) {
      const filePath = join(root, fileName)
      if (!existsSync(filePath)) continue
      const value = parseDotenvValue(readFileSync(filePath, 'utf-8'), envVar)
      if (value) return value
    }
  }
  return ''
}

function getToolApiKey(providerId: SearchProvider, envVar: string): string {
  return process.env[envVar] || getStoredApiKey(providerId) || readProjectDotenvKey(envVar) || ''
}

/** Returns the Tavily API key from available configured sources, or empty string if not set. */
export function getTavilyApiKey(): string {
  return getToolApiKey('tavily', 'TAVILY_API_KEY')
}

/** Returns the Brave API key from available configured sources, or empty string if not set. */
export function getBraveApiKey(): string {
  return getToolApiKey('brave', 'BRAVE_API_KEY')
}

/** Standard headers for Brave Search API requests. */
export function braveHeaders(): Record<string, string> {
  return {
    "Accept": "application/json",
    "Accept-Encoding": "gzip",
    "X-Subscription-Token": getBraveApiKey(),
  }
}

/** Returns the Ollama API key from available configured sources, or empty string if not set. */
export function getOllamaApiKey(): string {
  return getToolApiKey('ollama', 'OLLAMA_API_KEY')
}

/**
 * Read the user's search provider preference from auth.json.
 * Returns 'auto' if no preference is stored or the stored value is invalid.
 *
 * @param authPath — Override auth.json path (for testing).
 */
export function getSearchProviderPreference(authPath?: string): SearchProviderPreference {
  const auth = AuthStorage.create(authPath ?? authFilePath())
  const cred = auth.get(PREFERENCE_KEY)
  if (cred?.type === 'api_key' && typeof cred.key === 'string' && VALID_PREFERENCES.has(cred.key)) {
    return cred.key as SearchProviderPreference
  }
  return 'auto'
}

/**
 * Write the user's search provider preference to auth.json.
 * Uses AuthStorage to go through file locking.
 *
 * @param pref — The preference to store.
 * @param authPath — Override auth.json path (for testing).
 */
export function setSearchProviderPreference(pref: SearchProviderPreference, authPath?: string): void {
  const auth = AuthStorage.create(authPath ?? authFilePath())
  auth.remove(PREFERENCE_KEY)
  auth.set(PREFERENCE_KEY, { type: 'api_key', key: pref })
}

/**
 * Resolve which search provider to use based on available API keys and user preference.
 *
 * Logic:
 * 1. If an explicit override is given, use it — but only if that provider's key exists.
 *    If the key doesn't exist, fall through to the other provider.
 * 2. Otherwise, read the stored preference.
 * 3. If preference is 'auto': prefer Tavily, then Brave.
 * 4. If preference is a specific provider: use it if key exists, else fall back to the other.
 * 5. Return null if neither key is available — explicit signal for "no provider".
 *
 * @param overridePreference — Optional override (e.g. from a tool parameter).
 */
export function resolveSearchProvider(overridePreference?: string): SearchProvider | null {
  const tavilyKey = getTavilyApiKey()
  const braveKey = getBraveApiKey()
  const ollamaKey = getOllamaApiKey()

  const hasTavily = tavilyKey.length > 0
  const hasBrave = braveKey.length > 0
  const hasOllama = ollamaKey.length > 0

  // Determine effective preference
  let pref: SearchProviderPreference
  if (overridePreference && VALID_PREFERENCES.has(overridePreference)) {
    pref = overridePreference as SearchProviderPreference
  } else {
    // PREFERENCES.md takes priority over auth.json
    const mdPref = resolveSearchProviderFromPreferences()
    if (mdPref && mdPref !== 'auto' && mdPref !== 'native') {
      pref = mdPref as SearchProviderPreference
    } else if (overridePreference !== undefined && !VALID_PREFERENCES.has(overridePreference)) {
      pref = 'auto'
    } else {
      pref = getSearchProviderPreference()
    }
  }

  // Resolve based on preference
  if (pref === 'auto') {
    if (hasTavily) return 'tavily'
    if (hasBrave) return 'brave'
    if (hasOllama) return 'ollama'
    return null
  }

  if (pref === 'tavily') {
    if (hasTavily) return 'tavily'
    if (hasBrave) return 'brave'
    if (hasOllama) return 'ollama'
    return null
  }

  if (pref === 'brave') {
    if (hasBrave) return 'brave'
    if (hasTavily) return 'tavily'
    if (hasOllama) return 'ollama'
    return null
  }

  if (pref === 'ollama') {
    if (hasOllama) return 'ollama'
    if (hasTavily) return 'tavily'
    if (hasBrave) return 'brave'
    return null
  }

  return null
}
