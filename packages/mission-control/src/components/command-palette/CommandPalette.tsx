/**
 * CommandPalette — cmdk-powered command palette modal.
 *
 * Opens via Ctrl+Shift+P / Cmd+Shift+P (state managed by useCommandPalette).
 * Displays all GSD commands from getAllCommands() with fuzzy filtering.
 * Selecting a command calls onSelectCommand and closes the palette.
 * Escape or clicking the backdrop closes the palette.
 *
 * Design: dark overlay, centered modal, font-mono inputs, cyan accent on selection.
 */
import { useEffect } from "react";
import { Command } from "cmdk";
import { getAllCommands } from "../../lib/slash-commands";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectCommand?: (command: string) => void;
}

export function CommandPalette({ open, onClose, onSelectCommand }: CommandPaletteProps) {
  const commands = getAllCommands();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Command label="GSD Command Palette">
      {/* Backdrop overlay — click outside closes palette */}
      <div
        className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
        onClick={onClose}
      >
        {/* Inner container — stop click propagation so clicking inside doesn't close */}
        <div
          className="w-full max-w-lg rounded border border-slate-700 bg-[#0F1419] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <Command.Input
            autoFocus
            placeholder="Search GSD commands..."
            className="w-full bg-transparent px-4 py-3 font-mono text-sm text-slate-200 placeholder-slate-500 outline-none border-b border-slate-700 focus-visible:outline-none"
          />
          <Command.List className="max-h-[320px] overflow-y-auto py-2">
            <Command.Empty className="px-4 py-8 text-center font-mono text-sm text-slate-500">
              No commands found.
            </Command.Empty>
            {commands.map((cmd) => (
              <Command.Item
                key={cmd.command}
                value={cmd.command + " " + cmd.description}
                onSelect={() => {
                  onSelectCommand?.(cmd.command);
                  onClose();
                }}
                className="flex cursor-pointer items-start gap-3 px-4 py-2 font-mono text-sm
                  data-[selected=true]:bg-slate-800 data-[selected=true]:text-[#5BC8F0]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5BC8F0]"
              >
                <span className="shrink-0 text-[#5BC8F0]">{cmd.command}</span>
                <span className="text-slate-500">{cmd.description}</span>
              </Command.Item>
            ))}
          </Command.List>
        </div>
      </div>
    </Command>
  );
}
