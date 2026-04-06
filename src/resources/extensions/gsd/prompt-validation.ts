/**
 * GSD Prompt Validation — Validates enhanced context output before writing.
 *
 * Implements R109 validation requirement: CONTEXT.md must have required sections
 * before being written to disk.
 */

/**
 * Result of validating enhanced context output.
 */
export interface ValidationResult {
  /** Whether all required sections are present. */
  valid: boolean;
  /** List of missing required sections. */
  missing: string[];
}

/**
 * Validate that enhanced context content has all required sections.
 *
 * Required sections per R109:
 * - Scope section (## Scope, ## Milestone Scope, or ## Why This Milestone)
 * - Architectural Decisions section (## Architectural Decisions)
 * - Acceptance Criteria section (## Acceptance Criteria or ## Final Integrated Acceptance)
 *
 * Additionally validates that the Architectural Decisions section contains
 * at least one decision entry (### heading or **Decision marker).
 *
 * @param content - The enhanced context markdown content
 * @returns ValidationResult with valid flag and list of missing sections
 */
export function validateEnhancedContext(content: string): ValidationResult {
  const missing: string[] = [];

  // Required section 1: Scope (multiple acceptable header variants)
  const hasScopeSection =
    /^## Scope\b/m.test(content) ||
    /^## Milestone Scope\b/m.test(content) ||
    /^## Why This Milestone\b/m.test(content);

  if (!hasScopeSection) {
    missing.push("Milestone Scope or Why This Milestone");
  }

  // Required section 2: Architectural Decisions
  const hasArchitecturalDecisions = /^## Architectural Decisions\b/m.test(content);
  if (!hasArchitecturalDecisions) {
    missing.push("Architectural Decisions");
  }

  // Required section 3: Acceptance Criteria (multiple acceptable header variants)
  const hasAcceptanceCriteria =
    /^## Acceptance Criteria\b/m.test(content) ||
    /^## Final Integrated Acceptance\b/m.test(content);

  if (!hasAcceptanceCriteria) {
    missing.push("Acceptance Criteria");
  }

  // Additional validation: Architectural Decisions must have at least one entry
  if (hasArchitecturalDecisions) {
    // Extract the section content between ## Architectural Decisions and the next ## heading
    const sectionMatch = content.match(
      /^## Architectural Decisions\b[\s\S]*?(?=^## |\z)/m,
    );
    const sectionContent = sectionMatch ? sectionMatch[0] : "";

    // Check for actual decision entries:
    // - ### heading (subsection per decision)
    // - **Decision marker (inline decision format)
    const hasDecisionEntry =
      /^### /m.test(sectionContent) || /^\*\*Decision/m.test(sectionContent);

    if (!hasDecisionEntry) {
      missing.push("At least one architectural decision entry");
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
