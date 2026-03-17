/**
 * Focused re-export: hook-related preferences.
 *
 * Consumers that only need hook resolution can import from this module
 * instead of the monolithic preferences.ts, reducing coupling surface.
 */
export {
  resolvePostUnitHooks,
  resolvePreDispatchHooks,
} from "./preferences.js";
