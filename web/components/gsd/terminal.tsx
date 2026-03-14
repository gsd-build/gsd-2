"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"

interface TerminalLine {
  type: "input" | "output" | "system" | "success" | "error"
  content: string
  timestamp?: string
}

const initialLines: TerminalLine[] = [
  { type: "system", content: "GSD 2.0.0 — Autonomous Coding Agent" },
  { type: "system", content: "Type /gsd to start, /gsd auto for autonomous mode" },
  { type: "system", content: "" },
  { type: "input", content: "/gsd status", timestamp: "14:23:01" },
  { type: "output", content: "" },
  { type: "output", content: "┌─────────────────────────────────────────────────────────┐" },
  { type: "output", content: "│  GSD Status Dashboard                                   │" },
  { type: "output", content: "├─────────────────────────────────────────────────────────┤" },
  { type: "output", content: "│  Milestone: M002 — Auto Mode Engine                     │" },
  { type: "output", content: "│  Slice:     S02 — Context Injection                     │" },
  { type: "output", content: "│  Task:      T02 — Dispatch prompt builder               │" },
  { type: "output", content: "│  Status:    IN PROGRESS                                 │" },
  { type: "output", content: "├─────────────────────────────────────────────────────────┤" },
  { type: "output", content: "│  Progress:  ████████████░░░░░░░░░  58%                  │" },
  { type: "output", content: "│  Tokens:    847,234 / ~1,200,000                        │" },
  { type: "output", content: "│  Cost:      $12.47                                      │" },
  { type: "output", content: "│  Elapsed:   2h 34m                                      │" },
  { type: "output", content: "└─────────────────────────────────────────────────────────┘" },
  { type: "output", content: "" },
  { type: "input", content: "/gsd auto", timestamp: "14:23:15" },
  { type: "success", content: "✓ Auto mode started" },
  { type: "system", content: "  Fresh session created for M002/S02/T02" },
  { type: "system", content: "  Pre-loading context: ROADMAP.md, S02-PLAN.md, T01-SUMMARY.md" },
  { type: "system", content: "  Dispatching task: Dispatch prompt builder..." },
  { type: "output", content: "" },
  { type: "output", content: "[Agent] Reading existing prompt templates..." },
  { type: "output", content: "[Agent] Analyzing context requirements..." },
  { type: "output", content: "[Agent] Building dispatch prompt with 4 context files..." },
]

interface TerminalProps {
  className?: string
}

export function Terminal({ className }: TerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>(initialLines)
  const [input, setInput] = useState("")
  const [isAutoMode, setIsAutoMode] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [lines])

  // Simulate auto mode output
  useEffect(() => {
    if (!isAutoMode) return

    const messages = [
      { type: "output" as const, content: "[Agent] Writing prompt builder module..." },
      { type: "output" as const, content: "[Agent] Adding YAML frontmatter parser..." },
      { type: "output" as const, content: "[Agent] Implementing context aggregation..." },
      { type: "success" as const, content: "✓ Created: src/prompt-builder.ts" },
      { type: "output" as const, content: "[Agent] Running verification checks..." },
      { type: "success" as const, content: "✓ Must-have verified: Prompt includes task plan" },
      { type: "success" as const, content: "✓ Must-have verified: Prior summaries included" },
      { type: "system" as const, content: "  Task T02 complete. Committing..." },
      { type: "success" as const, content: "✓ Committed: feat(S02/T02): dispatch prompt builder" },
      { type: "system" as const, content: "  Advancing to T03: Summary aggregation..." },
    ]

    let index = 0
    const interval = setInterval(() => {
      if (index < messages.length) {
        setLines((prev) => [...prev, messages[index]])
        index++
      } else {
        setIsAutoMode(false)
        clearInterval(interval)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [isAutoMode])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })

    setLines((prev) => [...prev, { type: "input", content: input, timestamp }])

    // Handle commands
    if (input === "/gsd stop") {
      setIsAutoMode(false)
      setLines((prev) => [...prev, { type: "success", content: "✓ Auto mode stopped gracefully" }])
    } else if (input === "/gsd auto") {
      setIsAutoMode(true)
      setLines((prev) => [...prev, { type: "success", content: "✓ Auto mode resumed" }])
    } else if (input === "/clear") {
      setLines([
        { type: "system", content: "GSD 2.0.0 — Autonomous Coding Agent" },
        { type: "system", content: "" },
      ])
    } else {
      setLines((prev) => [
        ...prev,
        { type: "error", content: `Unknown command: ${input}. Type /help for available commands.` },
      ])
    }

    setInput("")
  }

  const handleTerminalClick = () => {
    inputRef.current?.focus()
  }

  return (
    <div
      className={cn("flex flex-col bg-terminal font-mono text-sm", className)}
      onClick={handleTerminalClick}
    >
      <div className="flex-1 overflow-y-auto p-4">
        {lines.filter(Boolean).map((line, i) => (
          <div key={i} className="flex">
            {line?.timestamp && (
              <span className="mr-2 text-muted-foreground/50 select-none">{line.timestamp}</span>
            )}
            <span
              className={cn(
                "whitespace-pre-wrap",
                line?.type === "input" && "text-foreground before:content-['$_'] before:text-muted-foreground",
                line?.type === "output" && "text-terminal-foreground",
                line?.type === "system" && "text-muted-foreground",
                line?.type === "success" && "text-success",
                line?.type === "error" && "text-destructive"
              )}
            >
              {line?.content}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex border-t border-border/50 px-4 py-2">
        <span className="mr-2 text-muted-foreground">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/50"
          placeholder={isAutoMode ? "Auto mode running... /gsd stop to pause" : "Type a command..."}
          autoFocus
        />
        {isAutoMode && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            AUTO
          </span>
        )}
      </form>
    </div>
  )
}
