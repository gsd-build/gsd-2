# ADR-005: Multi-Model, Multi-Provider, and Tool Strategy

**Status:** Accepted
**Date:** 2026-03-27
**Deciders:** Jeremy McSpadden
**Related:** ADR-004 (capability-aware model routing), ADR-003 (pipeline simplification), [Issue #2790](https://github.com/gsd-build/gsd-2/issues/2790)

## Context

PR #2755 lands capability-aware model routing (ADR-004), extending the router from a one-dimensional complexity-tier system to a two-dimensional system that scores models across 7 capability dimensions. GSD can now intelligently pick the best model for a task from a heterogeneous pool.

But model selection is only one piece of the multi-model puzzle. The system faces structural gaps as users configure diverse provider pools:

1. **Tool compatibility is assumed, not verified** — Every registered tool is sent to every model regardless of provider capabilities.
2. **No tool-aware model routing** — ADR-004 scores 7 capability dimensions but none encode whether a model can actually use the tools a task requires.
3. **Provider failover loses context fidelity** — Cross-provider switches silently degrade conversation quality (thinking blocks dropped, tool IDs remapped).
4. **Tool availability is static across a session** — The same tools are presented regardless of the selected model's capabilities.
5. **No provider capability registry** — Provider quirks are scattered across `*-shared.ts` files.

## Decision

Introduce a provider capability registry and tool compatibility layer that integrates with ADR-004's capability-aware model router.

### Design Principles

1. **Layered on ADR-004, not replacing it.** Capability scoring remains primary. This adds tool compatibility as a hard constraint.
2. **Hard constraints filter; soft scores rank.** Tool support is binary — it filters the eligible set before scoring.
3. **Provider knowledge is declarative, not scattered.** Provider capabilities move to an explicit registry.
4. **Tool sets adapt to model capabilities.** Active tool set adjusts when the router selects a different model.
5. **Graceful degradation preserved.** Unknown providers get full tool access — same as today.

### Implementation Phases

1. **Phase 1:** Provider Capabilities Registry (`packages/pi-ai/src/providers/provider-capabilities.ts`)
2. **Phase 2:** Tool Compatibility Metadata (extend `ToolDefinition` with `compatibility` field)
3. **Phase 3:** Tool-compatibility filter in routing pipeline + `ProviderSwitchReport` in `transform-messages.ts`
4. **Phase 3b:** Export `ProviderSwitchObserver` / `setProviderSwitchObserver` from `@gsd/pi-ai` and install a GSD observer that surfaces non-empty provider-switch reports as audit events, notifications, and in-memory stats.
5. **Phase 4:** `adjustToolSet` extension hook

### Provider Switch Visibility

`packages/pi-ai/src/providers/transform-messages.ts` produces a `ProviderSwitchReport` whenever replaying conversation history into a different provider requires context transformations. The report includes:

- `fromApi` / `toApi`
- `thinkingBlocksDropped`
- `thinkingBlocksDowngraded`
- `toolCallIdsRemapped`
- `syntheticToolResultsInserted`
- `thoughtSignaturesDropped`

`@gsd/pi-ai` exports `ProviderSwitchReport`, `ProviderSwitchObserver`, and `setProviderSwitchObserver(observer)`. The observer is single-subscriber by design; pass `undefined` to clear it. Observers receive only non-empty reports and are invoked synchronously after verbose stderr logging, with observer errors swallowed so telemetry cannot break model streaming.

GSD installs its observer during bootstrap. Each non-empty report is surfaced in three places:

- A UOK audit event when auto-mode trace context is active: `category: "model-policy"`, `type: "provider-switch"`, with the report fields in `payload`.
- A warning notification via the notification store, so provider-switch context loss is visible without `GSD_VERBOSE=1`.
- Process-local rollup stats from `getProviderSwitchStats()` in `src/resources/extensions/gsd/provider-switch-observer.ts`, including totals, per-trace buckets, the last report, and timestamps.

## Consequences

### Positive
- Eliminates silent tool failures when routing to incompatible providers
- Makes cross-provider routing safe by default
- Provider knowledge becomes queryable (registry vs scattered code)
- Cross-provider context loss becomes visible via `ProviderSwitchReport`

### Negative
- More metadata to maintain (provider capabilities, tool compatibility)
- Tool filtering adds a pipeline step (sub-millisecond, O(models × tools))
- Risk of over-filtering (mitigated: opt-in per tool, permissive defaults)

### Neutral
- Existing behavior unchanged without metadata
- ADR-004 scoring is unmodified
- Provider implementations simplify over time as registry replaces scattered workarounds

## Appendix: Architecture Reference

| File | Role |
|------|------|
| `packages/pi-ai/src/providers/register-builtins.ts` | Provider registration |
| `packages/pi-ai/src/providers/*-shared.ts` | Provider-specific handling |
| `packages/pi-ai/src/providers/transform-messages.ts` | Cross-provider normalization |
| `packages/pi-ai/src/types.ts` | Core types |
| `packages/pi-coding-agent/src/core/extensions/types.ts` | ToolDefinition, ExtensionAPI |
| `src/resources/extensions/gsd/model-router.ts` | Capability scoring (ADR-004) |
| `src/resources/extensions/gsd/auto-model-selection.ts` | Model selection orchestration |
