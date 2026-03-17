/**
 * Focused re-export: model-related preferences.
 *
 * Consumers that only need model resolution can import from this module
 * instead of the monolithic preferences.ts, reducing coupling surface.
 */
export {
  // Types
  type GSDPhaseModelConfig,
  type GSDModelConfig,
  type GSDModelConfigV2,
  type ResolvedModelConfig,

  // Functions
  resolveModelForUnit,
  resolveModelWithFallbacksForUnit,
  resolveDynamicRoutingConfig,
  getNextFallbackModel,
  isTransientNetworkError,
  validateModelId,
  updatePreferencesModels,
} from "./preferences.js";
