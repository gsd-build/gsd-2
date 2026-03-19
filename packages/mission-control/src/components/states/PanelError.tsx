import { AlertTriangle } from "lucide-react";

interface PanelErrorProps {
  error: Error;
  onRetry?: () => void;
}

export function PanelError({ error, onRetry }: PanelErrorProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <AlertTriangle className="mb-4 h-8 w-8 text-status-error" />
      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-400">
        Something went wrong
      </h3>
      <p className="mt-2 max-w-48 text-center font-mono text-xs text-slate-500">
        {error.message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded bg-navy-700 px-4 py-2 font-mono text-xs text-cyan-accent hover:bg-navy-600"
        >
          Retry
        </button>
      )}
    </div>
  );
}
