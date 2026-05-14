export function parseDiscussArgs(args: string): { target: string | null; error: string | null } {
  const trimmed = args.trim();
  if (!trimmed) return { target: null, error: null };
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 1 && !tokens[0].startsWith("--")) {
    return { target: tokens[0], error: null };
  }
  const milestoneFlag = tokens.indexOf("--milestone");
  if (milestoneFlag >= 0) {
    const target = tokens[milestoneFlag + 1];
    if (!target || target.startsWith("--")) {
      return { target: null, error: "Missing value for --milestone. Usage: /gsd discuss --milestone M014" };
    }
    return { target, error: null };
  }
  const sliceFlag = tokens.indexOf("--slice");
  if (sliceFlag >= 0) {
    const target = tokens[sliceFlag + 1];
    if (!target || target.startsWith("--")) {
      return { target: null, error: "Missing value for --slice. Usage: /gsd discuss --slice M014/S03" };
    }
    return { target, error: null };
  }
  return { target: null, error: `Unknown discuss arguments: "${trimmed}"` };
}