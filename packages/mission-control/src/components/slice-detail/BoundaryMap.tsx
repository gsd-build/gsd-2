import type { PlanState } from "@/server/types";

interface BoundaryMapProps {
  plans: PlanState[];
}

export function BoundaryMap({ plans }: BoundaryMapProps) {
  // Collect PRODUCES from must_haves.artifacts
  const produces: string[] = [];
  // Collect CONSUMES from must_haves.key_links
  const consumes: string[] = [];

  for (const plan of plans) {
    if (!plan.must_haves) continue;
    for (const artifact of plan.must_haves.artifacts) {
      if (artifact.path && !produces.includes(artifact.path)) {
        produces.push(artifact.path);
      }
    }
    for (const link of plan.must_haves.key_links) {
      if (link.to && !consumes.includes(link.to)) {
        consumes.push(link.to);
      }
    }
  }

  if (produces.length === 0 && consumes.length === 0) {
    return (
      <div className="text-slate-500 font-mono text-xs p-4">
        No boundary data
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display text-xs uppercase tracking-wider text-slate-400">
        Boundary Map
      </h3>

      {produces.length > 0 && (
        <div className="space-y-1">
          <span className="font-display text-xs uppercase tracking-wider text-status-success">
            PRODUCES
          </span>
          <ul className="space-y-1">
            {produces.map((path) => (
              <li
                key={path}
                className="rounded border border-status-success px-2 py-1 font-mono text-xs text-slate-400"
              >
                {path}
              </li>
            ))}
          </ul>
        </div>
      )}

      {consumes.length > 0 && (
        <div className="space-y-1">
          <span className="font-display text-xs uppercase tracking-wider text-cyan-accent">
            CONSUMES
          </span>
          <ul className="space-y-1">
            {consumes.map((target) => (
              <li
                key={target}
                className="rounded border border-cyan-accent px-2 py-1 font-mono text-xs text-slate-400"
              >
                {target}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
