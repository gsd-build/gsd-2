interface CheckpointRefProps {
  checkpoint?: string;
}

export function CheckpointRef({ checkpoint }: CheckpointRefProps) {
  if (!checkpoint) return null;

  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-slate-500" aria-label="GitCommit">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <line x1="3" y1="12" x2="9" y2="12" />
          <line x1="15" y1="12" x2="21" y2="12" />
        </svg>
      </span>
      <span className="font-mono text-xs text-slate-500">Checkpoint: {checkpoint}</span>
    </div>
  );
}
