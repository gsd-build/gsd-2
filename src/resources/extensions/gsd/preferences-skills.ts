/**
 * Focused re-export: skill-related preferences.
 *
 * Consumers that only need skill resolution can import from this module
 * instead of the monolithic preferences.ts, reducing coupling surface.
 */
export {
  // Types
  type GSDSkillRule,
  type SkillDiscoveryMode,
  type SkillResolution,
  type SkillResolutionReport,

  // Functions
  resolveAllSkillReferences,
  resolveSkillDiscoveryMode,
  resolveSkillStalenessDays,
} from "./preferences.js";
