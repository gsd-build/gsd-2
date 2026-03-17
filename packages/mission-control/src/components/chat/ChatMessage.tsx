/**
 * Single message renderer with role-based styling.
 *
 * Assistant messages: cyan left border, navy-800 bg
 * System messages: italic, slate-500, navy-900 bg
 * User messages: plain navy-base bg
 *
 * Assistant message content is rendered via RichStreamContent which detects
 * tool badge lines, shell commands, command output blocks, and inline file paths.
 */
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { ChatAssetThumbnail, parseAttachments, stripAttachments } from "./ChatAssetThumbnail";
import type { ChatMessage as ChatMessageType } from "../../server/chat-types";

// ─── Rich streaming renderer ─────────────────────────────────────────────────

const FILE_OP_TOOLS = new Set(["read", "write", "edit"]);
const SHELL_TOOLS = new Set(["bash", "bg_shell"]);
const BROWSER_TOOL_RE = /^browser_/;
const TOOL_LINE_RE = /^\[(\w+)\]$/;

const TOOL_LABELS: Record<string, string> = {
  browser_screenshot:           "Browser: screenshot",
  browser_navigate:             "Browser: navigate",
  browser_click:                "Browser: click",
  browser_type:                 "Browser: type",
  browser_resize:               "Browser: resize viewport",
  browser_scroll:               "Browser: scroll",
  browser_evaluate:             "Browser: run script",
  browser_wait_for_load_state:  "Browser: wait for load",
  browser_get_console_logs:     "Browser: console logs",
  browser_close:                "Browser: close",
  read:     "Read file",
  write:    "Write file",
  edit:     "Edit file",
  bash:     "Shell",
  bg_shell: "Shell (bg)",
};
const CMD_LINE_RE = /^\$ /;
// Matches Windows absolute paths, Unix absolute paths, home-relative (~), and relative (./  ../)
const PATH_RE = /((?:[A-Za-z]:\\|\/|~[/\\]|\.\.?[/\\])[^\s"',;)>\]]+|"[A-Za-z]:\\[^"]+")/g;

function toolColor(name: string): string {
  if (FILE_OP_TOOLS.has(name)) return "#22C55E";      // emerald-500
  if (SHELL_TOOLS.has(name)) return "#F59E0B";          // amber-400
  if (BROWSER_TOOL_RE.test(name)) return "#A78BFA";     // violet-400
  return "#94A3B8";                                      // slate-400
}

/** Splits a prose line at path-like tokens and wraps them in a cyan monospace span. */
function highlightPaths(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  PATH_RE.lastIndex = 0;
  while ((match = PATH_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    parts.push(
      <code key={match.index} className="text-xs" style={{ color: "#5BC8F0", opacity: 0.9 }}>
        {match[0]}
      </code>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function ToolBadgeLine({ name }: { name: string }) {
  return (
    <div className="my-0.5">
      <span
        className="inline-block rounded px-1.5 py-0.5 text-xs font-mono font-semibold"
        style={{ color: toolColor(name), background: "rgba(255,255,255,0.05)" }}
      >
        [{TOOL_LABELS[name] ?? name}]
      </span>
    </div>
  );
}

function CmdLine({ line }: { line: string }) {
  return (
    <div className="font-mono text-xs leading-snug">
      <span className="text-amber-400 select-none">$ </span>
      <span className="text-slate-200">{line.slice(2)}</span>
    </div>
  );
}

function OutputLine({ line }: { line: string }) {
  return (
    <div
      className="font-mono text-xs leading-snug px-2"
      style={{ color: "#94A3B8", background: "#0a0d12" }}
    >
      {line}
    </div>
  );
}

function ProseLine({ line }: { line: string }) {
  return (
    <div className="text-slate-300 leading-snug">
      {highlightPaths(line)}
    </div>
  );
}

function RichStreamContent({ text }: { text: string }) {
  const lines = text.split("\n");
  let inCommandBlock = false;
  return (
    <div className="whitespace-pre-wrap">
      {lines.map((line, i) => {
        const toolMatch = line.match(TOOL_LINE_RE);
        if (toolMatch) {
          inCommandBlock = false;
          return <ToolBadgeLine key={i} name={toolMatch[1]} />;
        }
        if (CMD_LINE_RE.test(line)) {
          inCommandBlock = true;
          return <CmdLine key={i} line={line} />;
        }
        if (inCommandBlock && line !== "") {
          return <OutputLine key={i} line={line} />;
        }
        if (line === "") {
          inCommandBlock = false;
          return <br key={i} />;
        }
        return <ProseLine key={i} line={line} />;
      })}
    </div>
  );
}

// ─── ChatMessage ─────────────────────────────────────────────────────────────

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";

  const attachments = parseAttachments(message.content);
  const displayContent = attachments.length > 0
    ? stripAttachments(message.content)
    : message.content;

  return (
    <div
      className={cn(
        "px-4 py-3 text-sm font-mono animate-in fade-in slide-in-from-bottom duration-75",
        isAssistant && "bg-navy-800 border-l-2 border-cyan-accent",
        isSystem && "bg-navy-900 text-slate-500 italic text-xs",
        !isAssistant && !isSystem && "bg-navy-base",
      )}
    >
      {message.toolName && (
        <div className="text-amber-400 text-xs mb-1">
          [Using {message.toolName}...]{message.toolDone ? " done" : ""}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att) => (
            <ChatAssetThumbnail
              key={att.assetPath}
              assetPath={att.assetPath}
              assetName={att.assetName}
              assetType={att.assetType}
            />
          ))}
        </div>
      )}
      {isAssistant ? (
        <RichStreamContent text={displayContent} />
      ) : (
        <span className="whitespace-pre-wrap">{displayContent}</span>
      )}
      {message.streaming && message.content.length > 0 && <span className="animate-pulse text-cyan-accent">|</span>}
    </div>
  );
}
