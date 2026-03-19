/**
 * Chat input with slash command autocomplete and command history.
 *
 * Props-driven -- calls onSend callback, no server coupling.
 * Up/down arrows navigate command history (terminal-style).
 *
 * Split into ChatInputView (pure, testable) and ChatInput (stateful wrapper).
 */
import { useState, useRef, useCallback } from "react";
import { filterCommands } from "../../lib/slash-commands";
import { SlashAutocomplete } from "./SlashAutocomplete";
import type { SlashCommand } from "../../lib/slash-commands";

interface ChatInputViewProps {
  value: string;
  placeholder: string;
  disabled: boolean;
  filtered: readonly SlashCommand[] | SlashCommand[];
  onChange: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelect: (command: string) => void;
}

/** Pure render -- no hooks. Testable via direct function call. */
export function ChatInputView({
  value,
  placeholder,
  disabled,
  filtered,
  onChange,
  onKeyDown,
  onSelect,
}: ChatInputViewProps) {
  return (
    <div className="relative px-6 pb-4 pt-2">
      {filtered.length > 0 && !disabled && (
        <SlashAutocomplete commands={filtered} onSelect={onSelect} />
      )}
      <div className="mx-auto max-w-2xl">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full rounded-2xl bg-navy-800 border border-navy-600 text-slate-200 px-5 py-3 text-sm font-mono outline-none transition-colors focus:border-cyan-accent/50"
        />
      </div>
    </div>
  );
}

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  /** When true: hides slash autocomplete, shows Builder placeholder */
  builderMode?: boolean;
}

/** Stateful wrapper with command history and autocomplete filtering. */
export function ChatInput({ onSend, disabled = false, builderMode = false }: ChatInputProps) {
  const [value, setValue] = useState("");
  const historyRef = useRef<string[]>([]);
  const indexRef = useRef(-1);

  // In Builder mode: slash autocomplete is unconditionally empty
  const filtered = builderMode ? [] : (value.startsWith("/") ? filterCommands(value) : []);

  const pushHistory = useCallback((cmd: string) => {
    if (cmd.trim() && cmd !== historyRef.current[0]) {
      historyRef.current.unshift(cmd);
      if (historyRef.current.length > 50) historyRef.current.pop();
    }
    indexRef.current = -1;
  }, []);

  const historyUp = useCallback((current: string): string => {
    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current++;
      return historyRef.current[indexRef.current];
    }
    return current;
  }, []);

  const historyDown = useCallback((): string => {
    if (indexRef.current > 0) {
      indexRef.current--;
      return historyRef.current[indexRef.current];
    }
    indexRef.current = -1;
    return "";
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        pushHistory(value);
        onSend(value);
        setValue("");
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setValue(historyUp(value));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setValue(historyDown());
    }
  };

  const handleSelect = (command: string) => {
    setValue(command);
  };

  const placeholder = disabled
    ? "GSD is running… (ESC to stop)"
    : builderMode
      ? "What do you want to build or change?"
      : "Type / for commands...";

  return (
    <ChatInputView
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      filtered={filtered}
      onChange={setValue}
      onKeyDown={handleKeyDown}
      onSelect={handleSelect}
    />
  );
}
