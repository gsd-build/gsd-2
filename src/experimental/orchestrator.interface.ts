/**
 * Orchestrator interface — defines the contract for pluggable auto-mode
 * execution engines. All new orchestrator implementations live here.
 *
 * The legacy path is wrapped by LegacyOrchestrator which delegates
 * identically to the existing autoLoop/startAuto flow.
 */

import type { AutoSession } from "../resources/extensions/gsd/auto/session.js";

// ─── Supporting Types ──────────────────────────────────────────────────────

/**
 * Result of an orchestrator run. Mirrors the termination conditions
 * of the legacy auto-mode loop.
 */
export interface RunResult {
  success: boolean;
  iterations?: number;
  reason?: string;
  error?: unknown;
  finalState?: Record<string, unknown>;
}

/**
 * Tiny orchestrator interface. Exposes a single run() method that
 * drives the full session lifecycle from initial state.
 *
 * Implementations:
 * - LegacyOrchestrator: thin wrapper around existing startAuto/autoLoop
 * - Future: parallel, workflow, etc.
 */
export interface Orchestrator {
  run(session: AutoSession, initialState: any): Promise<RunResult>;
}

/**
 * Factory/registry resolver signature. Used by orchestrator factory
 * to instantiate based on GSD_ORCHESTRATOR pref/env (defaults to "legacy").
 */
export type OrchestratorFactory = (prefs?: unknown) => Orchestrator | Promise<Orchestrator>;
