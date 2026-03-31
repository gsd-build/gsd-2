import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { ModelsJsonWriter } from "../packages/pi-coding-agent/src/core/models-json-writer.ts"

import { agentDir } from "./app-paths.js"
import { resolveModelsJsonPath } from "./models-resolver.js"

export const CUSTOM_OPENAI_PROVIDER_ID = "custom-openai"
export const CUSTOM_OPENAI_ENV_VAR = "CUSTOM_OPENAI_API_KEY"
export const CUSTOM_OPENAI_PROVIDER_LABEL = "Custom (OpenAI-compatible)"

export interface CustomOpenAIProviderInput {
  baseUrl: string
  apiKey: string
  modelId: string
}

interface CustomOpenAICredentialStore {
  set(provider: string, credential: { type: "api_key"; key: string }): void
}

type ProviderConfigRecord = {
  providers?: Record<string, unknown>
}

interface CustomOpenAIProviderConfigRecord {
  baseUrl?: unknown
  models?: Array<{
    id?: unknown
  }>
}

export interface CustomOpenAIProviderSnapshot {
  baseUrl: string
  modelId: string
}

export function normalizeCustomOpenAIProviderInput(input: CustomOpenAIProviderInput): CustomOpenAIProviderInput {
  const baseUrl = input.baseUrl.trim()
  const apiKey = input.apiKey.trim()
  const modelId = input.modelId.trim()

  if (!baseUrl) {
    throw new Error("Base URL is required")
  }
  try {
    new URL(baseUrl)
  } catch {
    throw new Error("Base URL must be a valid URL")
  }
  if (!apiKey) {
    throw new Error("API key is required")
  }
  if (!modelId) {
    throw new Error("Model ID is required")
  }

  return { baseUrl, apiKey, modelId }
}

export function getCustomOpenAIModelsJsonPath(): string {
  return join(agentDir, "models.json")
}

export function buildCustomOpenAIProviderConfig(input: Pick<CustomOpenAIProviderInput, "baseUrl" | "modelId">) {
  return {
    baseUrl: input.baseUrl,
    apiKey: `env:${CUSTOM_OPENAI_ENV_VAR}`,
    api: "openai-completions",
    models: [
      {
        id: input.modelId,
        name: input.modelId,
        reasoning: false,
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 16384,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  }
}

export function saveCustomOpenAIProviderConfig(
  authStorage: CustomOpenAICredentialStore,
  input: CustomOpenAIProviderInput,
  modelsJsonPath = getCustomOpenAIModelsJsonPath(),
): CustomOpenAIProviderInput {
  const normalized = normalizeCustomOpenAIProviderInput(input)
  authStorage.set(CUSTOM_OPENAI_PROVIDER_ID, { type: "api_key", key: normalized.apiKey })

  const writer = new ModelsJsonWriter(modelsJsonPath)
  writer.setProvider(CUSTOM_OPENAI_PROVIDER_ID, buildCustomOpenAIProviderConfig(normalized))

  process.env[CUSTOM_OPENAI_ENV_VAR] = normalized.apiKey
  return normalized
}

export function removeCustomOpenAIProviderConfig(modelsJsonPath = getCustomOpenAIModelsJsonPath()): void {
  const writer = new ModelsJsonWriter(modelsJsonPath)
  writer.removeProvider(CUSTOM_OPENAI_PROVIDER_ID)
}

export function hasCustomOpenAIProviderConfig(modelsJsonPath = resolveModelsJsonPath()): boolean {
  return getCustomOpenAIProviderSnapshot(modelsJsonPath) !== null
}

export function getCustomOpenAIProviderSnapshot(
  modelsJsonPath = resolveModelsJsonPath(),
): CustomOpenAIProviderSnapshot | null {
  if (!existsSync(modelsJsonPath)) {
    return null
  }

  try {
    const parsed = JSON.parse(readFileSync(modelsJsonPath, "utf-8")) as ProviderConfigRecord
    if (typeof parsed.providers !== "object" || parsed.providers === null) {
      return null
    }

    const provider = parsed.providers[CUSTOM_OPENAI_PROVIDER_ID] as CustomOpenAIProviderConfigRecord | undefined
    if (!provider || typeof provider !== "object") {
      return null
    }

    const baseUrl = typeof provider.baseUrl === "string" ? provider.baseUrl.trim() : ""
    const modelId = typeof provider.models?.[0]?.id === "string" ? provider.models[0].id.trim() : ""
    if (!baseUrl || !modelId) {
      return null
    }

    return { baseUrl, modelId }
  } catch {
    return null
  }
}
