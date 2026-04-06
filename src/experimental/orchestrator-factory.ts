/**
 * Orchestrator factory and registry — resolves GSD_ORCHESTRATOR from env/prefs
 * (defaults to legacy), registers the LegacyOrchestrator, and uses dynamic
 * import() for experimental variants to keep them isolated from core bundle.
 *
 * Follows the preferences loading pattern from preferences.ts.
 * All experimental orchestrators live in src/experimental/.
 */

import type { Orchestrator, OrchestratorFactory } from './orchestrator.interface.js';
import { LegacyOrchestrator } from './legacy-orchestrator.js';
import { loadEffectiveGSDPreferences } from '../resources/extensions/gsd/preferences.js';

const registry = new Map<string, OrchestratorFactory>();

// Register the legacy orchestrator (zero behavior change wrapper)
registry.set('legacy', (prefs?: unknown): Orchestrator => {
  return new LegacyOrchestrator(prefs);
});

/**
 * Register an orchestrator implementation. Used by experimental variants.
 */
export function registerOrchestrator(name: string, factory: OrchestratorFactory): void {
  registry.set(name.toLowerCase(), factory);
}

/**
 * Resolve orchestrator name from env var or preferences (GSD_ORCHESTRATOR or orchestrator key).
 * Prefers env > prefs > default 'legacy'.
 */
export function resolveOrchestratorName(prefs: any): string {
  // Env var takes precedence
  if (process.env.GSD_ORCHESTRATOR) {
    return process.env.GSD_ORCHESTRATOR.toLowerCase().trim();
  }

  const preferences = prefs?.preferences;
  const prefValue =
    preferences?.orchestrator ??
    preferences?.experimental?.orchestrator ??
    preferences?.GSD_ORCHESTRATOR;

  if (prefValue && typeof prefValue === 'string') {
    return prefValue.toLowerCase().trim();
  }

  return 'legacy';
}

/**
 * Create the appropriate orchestrator based on config.
 * Uses registry for known ones, dynamic import() for others (e.g. future experimental).
 * Returns Promise to support async factories/dynamic loading.
 */
export async function createOrchestrator(
  initialState: any = {}
): Promise<Orchestrator> {
  const prefs = loadEffectiveGSDPreferences();
  const name = resolveOrchestratorName(prefs);

  const factoryFn = registry.get(name);

  if (factoryFn) {
    const instance = factoryFn(prefs);
    return instance instanceof Promise ? await instance : instance;
  }

  // Dynamic import for experimental/unknown variants — keeps isolation
  console.log(`[orchestrator-factory] Loading orchestrator: ${name} (dynamic)`);
  try {
    // Dynamic import with .js extension for ESM compatibility
    const modPath = `./${name}-orchestrator.js`;
    const mod = await import(modPath);

    // Support default export, named class, or factory function
    const candidate = mod.default || mod.Orchestrator || mod.createOrchestrator || mod[name];

    if (typeof candidate === 'function') {
      if (candidate.prototype?.run) {
        // It's a class
        const inst = new candidate();
        return inst as Orchestrator;
      } else {
        // It's a factory function
        const result = candidate(prefs || initialState);
        return result instanceof Promise ? await result : result;
      }
    }

    throw new Error('No valid orchestrator export found');
  } catch (err: any) {
    console.warn(
      `[orchestrator-factory] Could not load "${name}" orchestrator: ${err.message}. Falling back to legacy.`
    );
    return new LegacyOrchestrator(prefs);
  }
}

// Also export as default for easy dynamic usage
export default createOrchestrator;
