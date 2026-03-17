"use client"

import { MessagesSquare } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * ChatMode — main view for the Chat tab.
 *
 * T01 scaffold: header bar + left pane with placeholder content.
 * T02 wires in the live ChatPane (SSE + PtyChatParser).
 * T03 adds chat bubble rendering and the input bar.
 *
 * Observability:
 *   - This component mounts only when activeView === "chat" (no hidden pre-init).
 *   - Console will show any render errors here directly.
 *   - sessionStorage key "gsd-active-view:<cwd>" will equal "chat" when this view is active.
 */
export function ChatMode({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden bg-background", className)}>
      {/* ── Header bar ── */}
      <ChatModeHeader />

      {/* ── Main pane ── */}
      <div className="flex flex-1 overflow-hidden">
        <ChatPane />
      </div>
    </div>
  )
}

/* ─── Header ─── */

function ChatModeHeader() {
  return (
    <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-border bg-card px-4">
      <MessagesSquare className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium text-foreground">Chat</span>
      <span className="ml-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        gsd-main
      </span>
    </div>
  )
}

/* ─── Chat Pane (scaffold — live data wired in T02) ─── */

function ChatPane() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Message list area */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6">
        <PlaceholderState />
      </div>

      {/* Input bar — functional shell; input handling wired in T03 */}
      <ChatInputBarScaffold />
    </div>
  )
}

/* ─── Placeholder state (T01 only — replaced by ChatMessageList in T03) ─── */

function PlaceholderState() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card">
        <MessagesSquare className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Chat Mode</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Live GSD session output will appear here as a conversation.
          Wired in T02.
        </p>
      </div>
    </div>
  )
}

/* ─── Input bar scaffold (T01 only — wired in T03) ─── */

function ChatInputBarScaffold() {
  return (
    <div className="flex-shrink-0 border-t border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
        <input
          type="text"
          disabled
          placeholder="Send a message… (coming in T03)"
          className="flex-1 bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
    </div>
  )
}
