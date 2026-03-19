// GSD Extension — Unit ID Parsing
// Centralizes the milestone/slice/task decomposition of unit ID strings.

export interface ParsedUnitId {
  milestone: string;
  slice?: string;
  task?: string;
}

/** Parse a unit ID string (e.g. "M1/S1/T1") into its milestone, slice, and task components. */
export function parseUnitId(unitId: string): ParsedUnitId {
  const [milestone, slice, task] = unitId.split("/");
  return { milestone: milestone!, slice, task };
}
