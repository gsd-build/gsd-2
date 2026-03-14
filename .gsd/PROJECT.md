# Project

## What This Is

GSD (Get Shit Done) is a CLI-based AI coding agent that helps users build software through natural language interaction. It supports multiple LLM providers, extensible tools, and session management.

## Core Value

The model registry must stay current with available models, pricing, and capabilities without requiring code changes or releases.

## Current State

- **S01 complete:** Zod schemas, mapper, and fetch/cache/fallback orchestration implemented (31 unit tests passing)
- Models still statically defined in `packages/pi-ai/src/models.generated.ts` (342KB generated file) — S03 will remove
- S02 will integrate models.dev fetch into ModelRegistry
- Users can override/add models via `~/.gsd/agent/models.json`

## Architecture / Key Patterns

- **Monorepo:** `packages/pi-ai` (core AI primitives), `packages/pi-coding-agent` (CLI app), `packages/pi-agent-core` (agent loop)
- **Model Registry:** `ModelRegistry` class in `pi-coding-agent` combines built-in models with user overrides
- **Config paths:** `~/.gsd/agent/` for user config, cache, auth

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001: models.dev Registry — S01 complete, S02 next
  - [x] S01: models.dev fetching with caching
  - [ ] S02: Integrate into ModelRegistry
  - [ ] S03: Build-time snapshot + cleanup
