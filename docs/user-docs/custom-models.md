# Custom Models

Add custom providers and models (Ollama, vLLM, LM Studio, proxies) via `~/.gsd/agent/models.json`.

## Table of Contents

- [Minimal Example](#minimal-example)
- [Full Example](#full-example)
- [Supported APIs](#supported-apis)
- [Provider Configuration](#provider-configuration)
- [Model Configuration](#model-configuration)
- [Overriding Built-in Providers](#overriding-built-in-providers)
- [Per-model Overrides](#per-model-overrides)
- [OpenAI Compatibility](#openai-compatibility)
- [Per-Model Provider Options](#per-model-provider-options)

## Minimal Example

For local models (Ollama, LM Studio, vLLM), only `id` is required per model:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b" },
        { "id": "qwen2.5-coder:7b" }
      ]
    }
  }
}
```

The `apiKey` is required but Ollama ignores it, so any value works.

Some OpenAI-compatible servers do not understand the `developer` role used for reasoning-capable models. For those providers, set `compat.supportsDeveloperRole` to `false` so GSD sends the system prompt as a `system` message instead. If the server also does not support `reasoning_effort`, set `compat.supportsReasoningEffort` to `false` too.

You can set `compat` at the provider level to apply to all models, or at the model level to override a specific model. This commonly applies to Ollama, vLLM, SGLang, and similar OpenAI-compatible servers.

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        {
          "id": "gpt-oss:20b",
          "reasoning": true
        }
      ]
    }
  }
}
```

## Full Example

Override defaults when you need specific values:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        {
          "id": "llama3.1:8b",
          "name": "Llama 3.1 8B (Local)",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 128000,
          "maxTokens": 32000,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }
      ]
    }
  }
}
```

The file reloads each time you open `/model`. Edit during session; no restart needed.

## Supported APIs

| API | Description |
|-----|-------------|
| `openai-completions` | OpenAI Chat Completions (most compatible) |
| `openai-responses` | OpenAI Responses API |
| `anthropic-messages` | Anthropic Messages API |
| `google-generative-ai` | Google Generative AI |

Set `api` at provider level (default for all models) or model level (override per model).

## Provider Configuration

| Field | Description |
|-------|-------------|
| `baseUrl` | API endpoint URL |
| `api` | API type (see above) |
| `apiKey` | API key (see value resolution below) |
| `headers` | Custom headers (see value resolution below) |
| `authHeader` | Set `true` to add `Authorization: Bearer <apiKey>` automatically |
| `models` | Array of model configurations |
| `modelOverrides` | Per-model overrides for built-in models on this provider |

### Value Resolution

The `apiKey` and `headers` fields support three formats:

- **Shell command:** `"!command"` executes and uses stdout
  ```json
  "apiKey": "!security find-generic-password -ws 'anthropic'"
  "apiKey": "!op read 'op://vault/item/credential'"
  ```
- **Environment variable:** Uses the value of the named variable
  ```json
  "apiKey": "MY_API_KEY"
  ```
- **Literal value:** Used directly
  ```json
  "apiKey": "sk-..."
  ```

#### Command Allowlist

Shell commands (`!command`) are restricted to a set of known credential tools. Only commands starting with one of these are allowed to execute:

`pass`, `op`, `aws`, `gcloud`, `vault`, `security`, `gpg`, `bw`, `gopass`, `lpass`

Commands not on this list are blocked and the value resolves to `undefined`. A warning is written to stderr.

Shell operators (`;`, `|`, `&`, `` ` ``, `$`, `>`, `<`) are also blocked in command arguments to prevent injection.

**Customizing the allowlist:**

If you use a credential tool not on the default list, override it in global settings (`~/.gsd/agent/settings.json`):

```json
{
  "allowedCommandPrefixes": ["pass", "op", "sops", "doppler", "mycli"]
}
```

This replaces the default list entirely — include any defaults you still want.

Alternatively, set the `GSD_ALLOWED_COMMAND_PREFIXES` environment variable (comma-separated). The env var takes precedence over settings.json:

```bash
export GSD_ALLOWED_COMMAND_PREFIXES="pass,op,sops,doppler"
```

> **Note:** This setting is global-only. Project-level settings.json (`<project>/.gsd/settings.json`) cannot override the command allowlist — this prevents a cloned repo from escalating command execution privileges.

### Custom Headers

```json
{
  "providers": {
    "custom-proxy": {
      "baseUrl": "https://proxy.example.com/v1",
      "apiKey": "MY_API_KEY",
      "api": "anthropic-messages",
      "headers": {
        "x-portkey-api-key": "PORTKEY_API_KEY",
        "x-secret": "!op read 'op://vault/item/secret'"
      },
      "models": [...]
    }
  }
}
```

## Model Configuration

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `id` | Yes | — | Model identifier (passed to the API) |
| `name` | No | `id` | Human-readable model label. Used for matching (`--model` patterns) and shown in model details/status text. |
| `api` | No | provider's `api` | Override provider's API for this model |
| `reasoning` | No | `false` | Supports extended thinking |
| `input` | No | `["text"]` | Input types: `["text"]` or `["text", "image"]` |
| `contextWindow` | No | `128000` | Context window size in tokens |
| `maxTokens` | No | `16384` | Maximum output tokens |
| `cost` | No | all zeros | `{"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}` (per million tokens) |
| `compat` | No | provider `compat` | OpenAI compatibility overrides. Merged with provider-level `compat` when both are set. |

Current behavior:
- `/model` and `--list-models` list entries by model `id`.
- The configured `name` is used for model matching and detail/status text.

## Overriding Built-in Providers

Route a built-in provider through a proxy without redefining models:

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://my-proxy.example.com/v1"
    }
  }
}
```

All built-in Anthropic models remain available. Existing OAuth or API key auth continues to work.

To merge custom models into a built-in provider, include the `models` array:

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://my-proxy.example.com/v1",
      "apiKey": "ANTHROPIC_API_KEY",
      "api": "anthropic-messages",
      "models": [...]
    }
  }
}
```

Merge semantics:
- Built-in models are kept.
- Custom models are upserted by `id` within the provider.
- If a custom model `id` matches a built-in model `id`, the custom model replaces that built-in model.
- If a custom model `id` is new, it is added alongside built-in models.

## Per-model Overrides

Use `modelOverrides` to customize specific built-in models without replacing the provider's full model list.

```json
{
  "providers": {
    "openrouter": {
      "modelOverrides": {
        "anthropic/claude-sonnet-4": {
          "name": "Claude Sonnet 4 (Bedrock Route)",
          "compat": {
            "openRouterRouting": {
              "only": ["amazon-bedrock"]
            }
          }
        }
      }
    }
  }
}
```

`modelOverrides` supports these fields per model: `name`, `reasoning`, `input`, `cost` (partial), `contextWindow`, `maxTokens`, `headers`, `compat`.

Behavior notes:
- `modelOverrides` are applied to built-in provider models.
- Unknown model IDs are ignored.
- You can combine provider-level `baseUrl`/`headers` with `modelOverrides`.
- If `models` is also defined for a provider, custom models are merged after built-in overrides. A custom model with the same `id` replaces the overridden built-in model entry.

## OpenAI Compatibility

For providers with partial OpenAI compatibility, use the `compat` field.

- Provider-level `compat` applies defaults to all models under that provider.
- Model-level `compat` overrides provider-level values for that model.

```json
{
  "providers": {
    "local-llm": {
      "baseUrl": "http://localhost:8080/v1",
      "api": "openai-completions",
      "compat": {
        "supportsUsageInStreaming": false,
        "maxTokensField": "max_tokens"
      },
      "models": [...]
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `supportsStore` | Provider supports `store` field |
| `supportsDeveloperRole` | Use `developer` vs `system` role |
| `supportsReasoningEffort` | Support for `reasoning_effort` parameter |
| `reasoningEffortMap` | Map GSD thinking levels to provider-specific `reasoning_effort` values |
| `supportsUsageInStreaming` | Supports `stream_options: { include_usage: true }` (default: `true`) |
| `maxTokensField` | Use `max_completion_tokens` or `max_tokens` |
| `requiresToolResultName` | Include `name` on tool result messages |
| `requiresAssistantAfterToolResult` | Insert an assistant message before a user message after tool results |
| `requiresThinkingAsText` | Convert thinking blocks to plain text |
| `thinkingFormat` | Use `reasoning_effort`, `zai`, `qwen`, or `qwen-chat-template` thinking parameters |
| `supportsStrictMode` | Include the `strict` field in tool definitions |
| `openRouterRouting` | OpenRouter routing config passed to OpenRouter for model/provider selection |
| `vercelGatewayRouting` | Vercel AI Gateway routing config for provider selection (`only`, `order`) |

`qwen` uses top-level `enable_thinking`. Use `qwen-chat-template` for local Qwen-compatible servers that require `chat_template_kwargs.enable_thinking`.

Example:

```json
{
  "providers": {
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "OPENROUTER_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "openrouter/anthropic/claude-3.5-sonnet",
          "name": "OpenRouter Claude 3.5 Sonnet",
          "compat": {
            "openRouterRouting": {
              "order": ["anthropic"],
              "fallbacks": ["openai"]
            }
          }
        }
      ]
    }
  }
}
```

Vercel AI Gateway example:

```json
{
  "providers": {
    "vercel-ai-gateway": {
      "baseUrl": "https://ai-gateway.vercel.sh/v1",
      "apiKey": "AI_GATEWAY_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "moonshotai/kimi-k2.5",
          "name": "Kimi K2.5 (Fireworks via Vercel)",
          "reasoning": true,
          "input": ["text", "image"],
          "cost": { "input": 0.6, "output": 3, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 262144,
          "maxTokens": 262144,
          "compat": {
            "vercelGatewayRouting": {
              "only": ["fireworks", "novita"],
              "order": ["fireworks", "novita"]
            }
          }
        }
      ]
    }
  }
}
```

## Per-Model Provider Options

For OpenAI-compatible servers that require specific payload shapes — extra parameters, thinking-control flags, or model ID mapping — use the `providerOptions` field on individual models. This is especially useful when the short alias you prefer isn't directly routable to the upstream API.

Supported fields inside `providerOptions`:

| Field | Description |
|-------|-------------|
| `actualModelId` | The real model name sent to the API. Lets you use a short alias in your config while routing to the correct upstream model. |
| `payload` | Default values merged into every request body before sending. Explicit per-request values take precedence and are never overwritten by provider defaults. |

### `payload` Fields

These keys are forwarded directly into the completion request body:

| Field | Description |
|-------|-------------|
| `temperature` | Sampling temperature |
| `top_p` | Nucleus sampling threshold |
| `top_k` | Top-K sampling threshold |
| `min_p` | Min-P sampling threshold |
| `presence_penalty` | Presence penalty |
| `repetition_penalty` | Repetition penalty |
| `chat_template_kwargs` | Arbitrary key-value pairs passed as-is to the request body (commonly used for thinking-control flags like `enable_thinking`) |

Explicit per-request values always override provider option defaults. For example, if `providerOptions.payload.temperature` is set to `1.0` but you call GSD with `--temperature 0.7`, the request uses `0.7`.

### Qwen 3.6 Examples

Here's a real configuration for three Qwen 3.6 variants — thinking mode, deep-thinking mode, and instruct-only — all routed through the same underlying model:

```json
{
  "providers": {
    "local": {
      "baseUrl": "http://localhost:8080/v1",
      "api": "openai-completions",
      "apiKey": "...",
      "models": [
        {
          "id": "qwen3.6-thinking",
          "name": "Qwen3.6 35B-A3B (Thinking)",
          "reasoning": true,
          "contextWindow": 262144,
          "maxTokens": 32768,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "compat": {
            "supportsDeveloperRole": false,
            "supportsStrictMode": false,
            "supportsUsageInStreaming": false,
            "maxTokensField": "max_tokens",
            "thinkingFormat": "qwen"
          },
          "providerOptions": {
            "actualModelId": "Qwen/Qwen3.6-35B-A3B",
            "payload": {
              "temperature": 1.0,
              "top_p": 0.95,
              "top_k": 20,
              "min_p": 0,
              "presence_penalty": 1.5,
              "repetition_penalty": 1.0,
              "chat_template_kwargs": {
                "enable_thinking": true,
                "preserve_thinking": false
              }
            }
          }
        },
        {
          "id": "qwen3.6-deep-think",
          "name": "Qwen 3.6 35B-A3B (Deep Think)",
          "reasoning": true,
          "contextWindow": 262144,
          "maxTokens": 32768,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "compat": {
            "supportsDeveloperRole": false,
            "supportsStrictMode": false,
            "supportsUsageInStreaming": false,
            "maxTokensField": "max_tokens",
            "thinkingFormat": "qwen"
          },
          "providerOptions": {
            "actualModelId": "Qwen/Qwen3.6-35B-A3B",
            "payload": {
              "temperature": 1.0,
              "top_p": 0.95,
              "top_k": 20,
              "min_p": 0,
              "presence_penalty": 1.5,
              "repetition_penalty": 1.0,
              "chat_template_kwargs": {
                "enable_thinking": true,
                "preserve_thinking": true
              }
            }
          }
        },
        {
          "id": "qwen3.6-instruct",
          "name": "Qwen 3.6 35B A3B (Instruct)",
          "reasoning": false,
          "contextWindow": 262144,
          "maxTokens": 48768,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "compat": {
            "supportsDeveloperRole": false,
            "supportsStrictMode": false,
            "supportsUsageInStreaming": false,
            "maxTokensField": "max_tokens"
          },
          "providerOptions": {
            "actualModelId": "Qwen/Qwen3.6-35B-A3B",
            "payload": {
              "temperature": 0.7,
              "top_p": 0.8,
              "top_k": 20,
              "min_p": 0,
              "presence_penalty": 1.5,
              "repetition_penalty": 1.0,
              "chat_template_kwargs": {
                "enable_thinking": false
              }
            }
          }
        }
      ]
    }
  }
}
```

Key observations from this setup:

- **Same underlying model** — All three variants point to `Qwen/Qwen3.6-35B-A3B` via `actualModelId`, so the local server only needs one model loaded.
- **`preserve_thinking`** — Set to `false` for thinking mode (strips thinking blocks from output) and `true` for deep-think mode (keeps them).
- **Different behavior profiles** — Thinking uses `temperature: 1.0` and `maxTokens: 32768`; instruct uses lower temperature `0.7` and more output tokens `48768`.
- **`enable_thinking: false`** — The instruct variant has thinking disabled at the prompt level.
