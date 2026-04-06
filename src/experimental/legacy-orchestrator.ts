/**
 * LegacyOrchestrator — zero-behavior-change wrapper around the existing
 * autoLoop + LoopDeps flow. Lives in experimental/ to keep the core
 * auto.ts edit minimal (one import + factory call in T04).
 *
 * Accepts optional prefs from factory for config/observability.
 * Delegates identically to the legacy path via the internal builder.
 */

import type { Orchestrator, RunResult } from './orchestrator.interface.js';
import type { AutoSession } from '../resources/extensions/gsd/auto/session.js';
import { autoLoop } from '../resources/extensions/gsd/auto-loop.js';
import type { LoopDeps } from '../resources/extensions/gsd/auto-loop.js';
import { buildLoopDeps } from '../resources/extensions/gsd/auto.js';
import type { ExtensionContext } from '@gsd/pi-coding-agent';
import type { ExtensionAPI } from '@gsd/pi-coding-agent';

/**
 * Implements the Orchestrator contract by reusing the exact same
 * LoopDeps builder and autoLoop entrypoint that the legacy code uses.
 * Accepts prefs (from factory) for observability/config while preserving
 * exact legacy delegation behavior. Matches S01 patterns and .js import style.
 */
export class LegacyOrchestrator implements Orchestrator {
  private readonly prefs?: unknown;

  constructor(prefs?: unknown) {
    this.prefs = prefs;
    // Consistent prefix with orchestrator-factory; logs prefs presence for observability
    console.log(`[legacy-orchestrator] Initialized with prefs: ${prefs ? 'provided (config via env/prefs)' : 'none (using defaults)'}`);
  }

  async run(session: AutoSession, initialState: any): Promise<RunResult> {
    const deps: LoopDeps = buildLoopDeps();

    // ctx is usually on session.cmdCtx; pi may be passed via initialState
    // or available in the calling context. For legacy path, this mirrors
    // how startAuto calls autoLoop.
    const ctx = (initialState?.ctx as ExtensionContext) || (session.cmdCtx as ExtensionContext);
    const pi = initialState?.pi as ExtensionAPI;

    if (!ctx) {
      throw new Error(
        'LegacyOrchestrator.run() requires ExtensionContext (via initialState.ctx or session.cmdCtx)'
      );
    }

    try {
      await autoLoop(ctx, pi || ({} as ExtensionAPI), session, deps);

      return {
        success: true,
        reason: 'completed',
        iterations: session.unitDispatchCount?.size ?? 0,
        finalState: session.toJSON?.() ?? {},
      };
    } catch (error) {
      return {
        success: false,
        reason: 'error',
        error,
        finalState: session.toJSON?.() ?? {},
      };
    }
  }
}
