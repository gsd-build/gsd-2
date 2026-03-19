/**
 * VerifyView — trigger /gsd:verify-work command and display instructions.
 *
 * Sends the verify command via chat and shows a brief disabled state
 * after clicking. Results appear in the Chat view.
 */
import { useState, useCallback } from "react";

interface VerifyViewProps {
  onSendCommand: (cmd: string) => void;
}

export function VerifyView({ onSendCommand }: VerifyViewProps) {
  const [sent, setSent] = useState(false);

  const handleClick = useCallback(() => {
    onSendCommand("/gsd:verify-work");
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  }, [onSendCommand]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="font-display text-lg text-slate-200">
          Work Verification
        </h1>
        <p className="text-sm text-slate-400 max-w-md">
          Click to run <code className="font-mono text-cyan-accent">/gsd:verify-work</code> against
          the current phase. Results will appear in the Chat view.
        </p>
      </div>
      <button
        onClick={handleClick}
        disabled={sent}
        className={`px-6 py-2 rounded-lg font-medium text-sm transition-colors ${
          sent
            ? "bg-navy-600 text-slate-500 cursor-not-allowed"
            : "bg-cyan-accent/20 text-cyan-accent hover:bg-cyan-accent/30"
        }`}
      >
        {sent ? "Verification sent..." : "Run Verification"}
      </button>
    </div>
  );
}
