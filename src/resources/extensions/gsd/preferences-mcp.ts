import type { ClaudeCodeMcpConfig, ClaudeCodeMcpPerModelEntry } from "./preferences-types.js";

/**
 * Resolve MCP server config for a given model ID using longest-prefix-wins matching.
 *
 * Keys in config.per_model are model-ID prefixes. When modelId.startsWith(key),
 * the key is a candidate; the longest matching key wins. Returns undefined when
 * no key matches or per_model is empty.
 */
export function resolveModelMcpConfig(
  modelId: string,
  config: ClaudeCodeMcpConfig,
): ClaudeCodeMcpPerModelEntry | undefined {
  let bestKey: string | undefined;

  const perModel = config.per_model ?? {};

  for (const key of Object.keys(perModel)) {
    if (modelId.startsWith(key)) {
      if (bestKey === undefined || key.length > bestKey.length) {
        bestKey = key;
      }
    }
  }

  return bestKey !== undefined ? perModel[bestKey] : undefined;
}
