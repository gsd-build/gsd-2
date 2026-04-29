import type { Decision, DecisionMadeBy } from './types.js';

const VALID_MADE_BY = new Set(['human', 'agent', 'collaborative']);

/**
 * Parse a DECISIONS.md markdown table into Decision objects (without seq).
 * Detects `(amends DXXX)` in the Decision column to build supersession info.
 * Returns parsed rows with superseded_by set to null; callers handle chaining.
 */
export function parseDecisionsTable(content: string): Omit<Decision, 'seq'>[] {
  const lines = content.split('\n');
  const results: Omit<Decision, 'seq'>[] = [];

  // Map from amended ID -> amending ID for supersession.
  const amendsMap = new Map<string, string>();

  for (const line of lines) {
    // Skip non-table lines, header, and separator.
    if (!line.trim().startsWith('|')) continue;
    const trimmed = line.trim();
    if (/^\|[\s-|]+\|$/.test(trimmed)) continue;

    const cells = trimmed.split('|').map(c => c.trim());
    if (cells.length > 0 && cells[0] === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();

    if (cells.length < 7) continue;

    const id = cells[0].trim();
    if (id === '#' || id.toLowerCase() === 'id') continue;
    if (!/^D\d+/.test(id)) continue;

    const when_context = cells[1].trim();
    const scope = cells[2].trim();
    const decisionText = cells[3].trim();
    const choice = cells[4].trim();
    const rationale = cells[5].trim();
    const revisable = cells[6].trim();
    const rawMadeBy = cells.length >= 8 ? cells[7].trim().toLowerCase() : 'agent';
    const made_by = (VALID_MADE_BY.has(rawMadeBy) ? rawMadeBy : 'agent') as DecisionMadeBy;

    const amendsMatch = decisionText.match(/\(amends\s+(D\d+)\)/i);
    if (amendsMatch) {
      amendsMap.set(amendsMatch[1], id);
    }

    results.push({
      id,
      when_context,
      scope,
      decision: decisionText,
      choice,
      rationale,
      revisable,
      made_by,
      superseded_by: null,
    });
  }

  for (const row of results) {
    if (amendsMap.has(row.id)) {
      row.superseded_by = amendsMap.get(row.id)!;
    }
  }

  return results;
}
