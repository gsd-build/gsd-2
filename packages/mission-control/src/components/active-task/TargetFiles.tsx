interface TargetFilesProps {
  files: string[];
}

export function TargetFiles({ files }: TargetFilesProps) {
  return (
    <div className="space-y-2">
      <h3 className="font-display text-xs uppercase tracking-wider text-slate-400">
        Target Files
      </h3>
      {files.length === 0 ? (
        <p className="font-mono text-xs text-slate-500">No target files</p>
      ) : (
        <ul className="space-y-1">
          {files.map((file) => (
            <li key={file} className="flex items-center gap-2">
              <span className="text-slate-500" aria-label="FileCode">
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
                  <path d="M10 12.5 8 15l2 2.5" />
                  <path d="m14 12.5 2 2.5-2 2.5" />
                  <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
                </svg>
              </span>
              <span className="font-mono text-xs text-slate-300">{file}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
