/**
 * Single message renderer with role-based styling.
 *
 * Assistant messages: cyan left border, navy-800 bg
 * System messages: italic, slate-500, navy-900 bg
 * User messages: plain navy-base bg
 */
import { cn } from "../../lib/utils";
import { ChatAssetThumbnail, parseAttachments, stripAttachments } from "./ChatAssetThumbnail";
import type { ChatMessage as ChatMessageType } from "../../server/chat-types";

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
      <span className="whitespace-pre-wrap">{displayContent}</span>
      {message.streaming && message.content.length > 0 && <span className="animate-pulse text-cyan-accent">|</span>}
    </div>
  );
}
