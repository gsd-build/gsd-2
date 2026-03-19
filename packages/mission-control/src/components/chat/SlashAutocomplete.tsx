/**
 * Autocomplete dropdown for GSD slash commands.
 *
 * Renders above the chat input (bottom-full positioning).
 * Click to select a command -- keyboard nav not required for v1.
 */
import type { SlashCommand } from "../../lib/slash-commands";

const SOURCE_STYLES: Record<string, string> = {
  gsd: "bg-cyan-900/40 text-cyan-400",
  claude: "bg-purple-900/40 text-purple-400",
  custom: "bg-emerald-900/40 text-emerald-400",
};

interface SlashAutocompleteProps {
  commands: readonly SlashCommand[] | SlashCommand[];
  onSelect: (command: string) => void;
}

export function SlashAutocomplete({ commands, onSelect }: SlashAutocompleteProps) {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-full max-w-2xl bg-navy-800 border border-navy-600 rounded-t-2xl max-h-60 overflow-y-auto z-10">
      {commands.map((cmd) => (
        <button
          key={cmd.command}
          type="button"
          onClick={() => onSelect(cmd.command + " ")}
          className="w-full text-left px-4 py-2 hover:bg-navy-700 text-xs font-mono flex items-center gap-2"
        >
          <span className="text-cyan-accent">{cmd.command}</span>
          <span className="text-slate-400 flex-1">{cmd.description}</span>
          {"source" in cmd && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${SOURCE_STYLES[cmd.source] ?? "text-slate-500"}`}>
              {cmd.source}
            </span>
          )}
          {cmd.args && (
            <span className="text-slate-500">{cmd.args}</span>
          )}
        </button>
      ))}
    </div>
  );
}
