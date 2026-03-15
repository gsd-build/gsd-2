"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import {
  buildPromptCommand,
  getOnboardingPresentation,
  getSessionLabelFromBridge,
  getStatusPresentation,
  useGSDWorkspaceActions,
  useGSDWorkspaceState,
} from "@/lib/gsd-workspace-store"

interface TerminalProps {
  className?: string
}

function terminalPlaceholder(state: ReturnType<typeof useGSDWorkspaceState>): string {
  if (state.bootStatus === "loading") return "Loading workspace…"
  if (state.bootStatus === "error") return "Workspace boot failed — check the visible error state"
  if (state.commandInFlight) return `Sending ${state.commandInFlight}…`
  if (state.boot?.onboarding.locked) {
    return getOnboardingPresentation(state).detail
  }
  if (state.boot?.bridge.sessionState?.isStreaming) return "Agent is active — type a follow-up or /state"
  return "Type a prompt, /state, /new, or /clear"
}

export function Terminal({ className }: TerminalProps) {
  const workspace = useGSDWorkspaceState()
  const { sendCommand, clearTerminalLines, refreshBoot } = useGSDWorkspaceActions()
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [workspace.terminalLines])

  const status = getStatusPresentation(workspace)
  const sessionLabel = getSessionLabelFromBridge(workspace.boot?.bridge)
  const isInputDisabled =
    workspace.bootStatus !== "ready" ||
    workspace.commandInFlight === "refresh" ||
    Boolean(workspace.boot?.onboarding.locked)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return

    if (trimmed === "/clear") {
      clearTerminalLines()
      setInput("")
      return
    }

    if (trimmed === "/refresh") {
      await refreshBoot()
      setInput("")
      return
    }

    await sendCommand(buildPromptCommand(trimmed, workspace.boot?.bridge))
    setInput("")
  }

  return (
    <div
      className={cn("flex flex-col bg-terminal font-mono text-sm", className)}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2 text-[11px] text-muted-foreground">
        <div className="min-w-0 truncate" data-testid="terminal-session-banner">
          {sessionLabel || "Waiting for live session…"}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              status.tone === "success"
                ? "bg-success"
                : status.tone === "warning"
                  ? "bg-amber-400"
                  : status.tone === "danger"
                    ? "bg-destructive"
                    : "bg-muted-foreground/60",
              status.tone === "success" && "animate-pulse",
            )}
          />
          <span>{status.label}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {workspace.terminalLines.map((line) => (
          <div key={line.id} className="flex" data-testid="terminal-line">
            <span className="mr-2 select-none text-muted-foreground/50">{line.timestamp}</span>
            <span
              className={cn(
                "whitespace-pre-wrap",
                line.type === "input" && "text-foreground before:content-['$_'] before:text-muted-foreground",
                line.type === "output" && "text-terminal-foreground",
                line.type === "system" && "text-muted-foreground",
                line.type === "success" && "text-success",
                line.type === "error" && "text-destructive",
              )}
            >
              {line.content}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border/50 px-4 py-2">
        <span className="text-muted-foreground">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:text-muted-foreground"
          placeholder={terminalPlaceholder(workspace)}
          disabled={isInputDisabled}
          data-testid="terminal-command-input"
          autoFocus
        />
        {workspace.commandInFlight && (
          <span className="text-xs text-muted-foreground">{workspace.commandInFlight}…</span>
        )}
      </form>
    </div>
  )
}
