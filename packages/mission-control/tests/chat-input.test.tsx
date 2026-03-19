/**
 * Chat input component tests (Phase 06-02 Task 1).
 *
 * Pattern: Direct function call on components + JSON.stringify inspection,
 * matching the approach used in slice-detail.test.tsx and active-task.test.tsx.
 */
import { describe, expect, it } from "bun:test";
import { GSD_COMMANDS, CLAUDE_CODE_COMMANDS, getAllCommands, filterCommands } from "../src/lib/slash-commands";
import { ChatInputView } from "../src/components/chat/ChatInput";
import { SlashAutocomplete } from "../src/components/chat/SlashAutocomplete";

// -- filterCommands --

describe("filterCommands", () => {
  it("returns only /gsd auto for /gsd a prefix", () => {
    const result = filterCommands("/gsd a");
    expect(result.length).toBe(1);
    expect(result[0].command).toBe("/gsd auto");
  });

  it("returns empty array for non-slash input", () => {
    const result = filterCommands("hello");
    expect(result).toEqual([]);
  });

  it("returns all commands for just / (GSD + Claude Code + custom)", () => {
    const result = filterCommands("/");
    expect(result.length).toBe(getAllCommands().length);
    expect(result.length).toBeGreaterThanOrEqual(GSD_COMMANDS.length + CLAUDE_CODE_COMMANDS.length);
  });

  it("returns Claude Code native commands for /he", () => {
    const result = filterCommands("/he");
    const names = result.map((c) => c.command);
    expect(names).toContain("/help");
    // /gsd:help doesn't match /he (starts with /gsd:)
    expect(names).not.toContain("/gsd:help");
  });

  it("returns mixed results for /", () => {
    const result = filterCommands("/");
    const sources = new Set(result.map((c) => c.source));
    expect(sources.has("gsd")).toBe(true);
    expect(sources.has("claude")).toBe(true);
  });

  it("returns only Claude Code commands for /cl", () => {
    const result = filterCommands("/cl");
    expect(result.length).toBeGreaterThan(0);
    for (const cmd of result) {
      expect(cmd.command.startsWith("/cl")).toBe(true);
    }
  });

  it("returns empty array for unknown slash command", () => {
    const result = filterCommands("/zzz:nonexistent");
    expect(result).toEqual([]);
  });
});

// -- GSD_COMMANDS registry --

describe("GSD_COMMANDS", () => {
  it("contains 9 commands", () => {
    expect(GSD_COMMANDS.length).toBe(9);
  });

  it("each command has command, description, and args fields", () => {
    for (const cmd of GSD_COMMANDS) {
      expect(typeof cmd.command).toBe("string");
      expect(typeof cmd.description).toBe("string");
      expect(typeof cmd.args).toBe("string");
      expect(cmd.command.startsWith("/gsd")).toBe(true);
    }
  });

  it("contains /gsd auto and /gsd migrate entries", () => {
    const names = GSD_COMMANDS.map((c) => c.command);
    expect(names).toContain("/gsd auto");
    expect(names).toContain("/gsd migrate");
  });
});

// -- SlashAutocomplete --

describe("SlashAutocomplete", () => {
  it("renders command items with descriptions", () => {
    const commands = [
      { command: "/gsd:progress", description: "Where am I?", args: "", source: "gsd" as const },
      { command: "/gsd:help", description: "Show all commands", args: "", source: "gsd" as const },
    ];
    const result = SlashAutocomplete({ commands, onSelect: () => {} });
    const json = JSON.stringify(result);
    expect(json).toContain("/gsd:progress");
    expect(json).toContain("Where am I?");
    expect(json).toContain("/gsd:help");
  });

  it("applies navy-800 background styling", () => {
    const commands = [
      { command: "/gsd:help", description: "Help", args: "", source: "gsd" as const },
    ];
    const result = SlashAutocomplete({ commands, onSelect: () => {} });
    const json = JSON.stringify(result);
    expect(json).toContain("bg-navy-800");
  });

  it("renders source badge for commands", () => {
    const commands = [
      { command: "/help", description: "Show help", args: "", source: "claude" as const },
      { command: "/deploy", description: "Custom deploy", args: "", source: "custom" as const },
    ];
    const result = SlashAutocomplete({ commands, onSelect: () => {} });
    const json = JSON.stringify(result);
    expect(json).toContain("claude");
    expect(json).toContain("custom");
  });
});

// -- ChatInputView (pure render, no hooks) --

const noop = () => {};

function makeViewProps(overrides: Partial<Parameters<typeof ChatInputView>[0]> = {}) {
  return {
    value: "",
    placeholder: "Type / for commands...",
    disabled: false,
    filtered: [],
    onChange: noop,
    onKeyDown: noop as any,
    onSelect: noop,
    ...overrides,
  };
}

describe("ChatInputView", () => {
  it("renders with placeholder text", () => {
    const result = ChatInputView(makeViewProps());
    const json = JSON.stringify(result);
    expect(json).toContain("Type / for commands...");
  });

  it("renders with font-mono styling", () => {
    const result = ChatInputView(makeViewProps());
    const json = JSON.stringify(result);
    expect(json).toContain("font-mono");
  });

  it("shows disabled state with working indicator", () => {
    const result = ChatInputView(makeViewProps({
      disabled: true,
      placeholder: "Claude is working...",
    }));
    const json = JSON.stringify(result);
    expect(json).toContain("Claude is working...");
  });

  it("renders border-t border-navy-600 styling", () => {
    const result = ChatInputView(makeViewProps());
    const json = JSON.stringify(result);
    expect(json).toContain("border-navy-600");
  });

  it("shows autocomplete when filtered commands present and not disabled", () => {
    const cmds = [{ command: "/gsd:help", description: "Help", args: "", source: "gsd" as const }];
    const result = ChatInputView(makeViewProps({ filtered: cmds }));
    const json = JSON.stringify(result);
    expect(json).toContain("/gsd:help");
    expect(json).toContain("bg-navy-800");
  });

  it("hides autocomplete when disabled even with filtered commands", () => {
    const cmds = [{ command: "/gsd:help", description: "Help", args: "", source: "gsd" as const }];
    const result = ChatInputView(makeViewProps({ filtered: cmds, disabled: true }));
    const json = JSON.stringify(result);
    // Should NOT contain autocomplete dropdown content
    expect(json).not.toContain("SlashAutocomplete");
  });
});
