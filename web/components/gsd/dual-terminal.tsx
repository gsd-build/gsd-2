"use client"

import { useState, useRef, useEffect, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"
import { GripVertical } from "lucide-react"

const GSD_LOGO = `
 ██████╗ ███████╗██████╗ 
██╔════╝ ██╔════╝██╔══██╗
██║  ███╗███████╗██║  ██║
██║   ██║╚════██║██║  ██║
╚██████╔╝███████║██████╔╝
 ╚═════╝ ╚══════╝╚═════╝ `

interface AutoModeState {
  phase: "idle" | "working" | "reassessing" | "advancing"
  currentSlice: string
  currentMilestone: string
  sliceProgress: { current: number; total: number }
  elapsedTime: number
  cost: number
  tokenPercent: number
  totalTokens: string
  model: string
}

function AutoTerminal() {
  const [state, setState] = useState<AutoModeState>({
    phase: "working",
    currentSlice: "Animation state machine authoring in the editor",
    currentMilestone: "M006",
    sliceProgress: { current: 4, total: 6 },
    elapsedTime: 12,
    cost: 332.882,
    tokenPercent: 13.1,
    totalTokens: "272k",
    model: "gpt-5.4",
  })

  const [logs, setLogs] = useState<string[]>([
    "[gsd] Extension load error: Tool \"github_issues\" conflicts with /Users/sn0w/.pi/agent/extensions/github/index.ts",
    "[gsd] Extension load error: Tool \"github_prs\" conflicts with /Users/sn0w/.pi/agent/extensions/github/index.ts",
    "[gsd] Extension load error: Tool \"github_comments\" conflicts with /Users/sn0w/.pi/agent/extensions/github/index.ts",
    "[gsd] Extension load error: Tool \"github_reviews\" conflicts with /Users/sn0w/.pi/agent/extensions/github/index.ts",
    "[gsd] Extension load error: Tool \"github_labels\" conflicts with /Users/sn0w/.pi/agent/extensions/github/index.ts",
    "[gsd] Extension load error: Command \"/gh\" conflicts with /Users/sn0w/.pi/agent/extensions/github/index.ts",
  ])

  // Simulate activity
  useEffect(() => {
    const interval = setInterval(() => {
      setState((prev) => ({
        ...prev,
        elapsedTime: prev.elapsedTime + 1,
        cost: prev.cost + 0.001 * Math.random(),
        tokenPercent: Math.min(100, prev.tokenPercent + 0.01 * Math.random()),
      }))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Cycle through phases
  useEffect(() => {
    const phases: AutoModeState["phase"][] = ["working", "reassessing", "advancing", "working"]
    let phaseIndex = 0
    const interval = setInterval(() => {
      phaseIndex = (phaseIndex + 1) % phases.length
      setState((prev) => ({
        ...prev,
        phase: phases[phaseIndex],
      }))
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  const progressWidth = (state.sliceProgress.current / state.sliceProgress.total) * 100

  return (
    <div className="flex h-full flex-col bg-terminal font-mono text-sm">
      {/* Terminal header */}
      <div className="flex items-center justify-between border-b border-border/50 bg-card/50 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">gsd auto</span>
        <span className="text-xs text-success">RUNNING</span>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Extension warnings */}
        <div className="mb-4 text-xs text-muted-foreground/70">
          {logs.map((log, i) => (
            <div key={i} className="truncate">
              {log}
            </div>
          ))}
        </div>

        {/* GSD Logo */}
        <pre className="text-info mb-1 text-xs leading-none">{GSD_LOGO}</pre>
        <div className="mb-6 flex items-center gap-2 text-muted-foreground">
          <span className="font-semibold text-foreground">Get Shit Done</span>
          <span className="text-xs">v2.10.4</span>
        </div>

        {/* Working indicator */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-muted-foreground">:</span>
          <span className={cn(state.phase === "working" && "animate-pulse")}>Working ...</span>
        </div>

        {/* Status bar */}
        <div className="mb-4 flex items-center justify-between border-t border-b border-border/30 py-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="font-bold text-foreground">GSD</span>
            <span className="text-success font-semibold">AUTO</span>
          </div>
          <span className="text-muted-foreground">{state.elapsedTime}s</span>
        </div>

        {/* Current workflow */}
        <div className="mb-4">
          <div className="text-muted-foreground text-xs mb-1">Authoring Workflow</div>
          <div className="text-foreground">
            S05: {state.currentSlice}
          </div>
        </div>

        {/* Phase indicator */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">-</span>
            <span>reassessing</span>
            <span className="text-muted-foreground">{state.currentMilestone}/S04</span>
          </div>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {state.phase === "reassessing" ? "REASSESS" : state.phase.toUpperCase()}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-4 flex items-center gap-3">
          <div className="h-2 flex-1 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-success transition-all duration-500"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {state.sliceProgress.current}/{state.sliceProgress.total} slices
          </span>
        </div>

        {/* Next action */}
        <div className="mb-6 flex items-center gap-2 text-muted-foreground">
          <span>→</span>
          <span>then advance to next slice</span>
        </div>
      </div>

      {/* Bottom status */}
      <div className="border-t border-border/50 bg-card/30 px-3 py-2 text-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-muted-foreground">~/Documents/dev/based (main)</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-success font-medium">${state.cost.toFixed(3)}</span>
            <span className="text-muted-foreground">
              {state.tokenPercent.toFixed(1)}%/{state.totalTokens}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{state.model}</span>
          </div>
        </div>
        <div className="mt-1 text-muted-foreground/70">
          esc pause | Ctrl+Alt+G dashboard
        </div>
      </div>

      {/* Cursor */}
      <div className="border-t border-border/50 px-3 py-2">
        <span className="inline-block h-4 w-2 bg-foreground animate-pulse" />
      </div>
    </div>
  )
}

function CommandTerminal() {
  const [input, setInput] = useState("")
  const [history, setHistory] = useState<Array<{ type: "input" | "output" | "warning" | "error"; content: string }>>([
    { type: "warning", content: "Warning: Google Search: No GEMINI_API_KEY set. The google_search tool will not work until this is configured." },
    { type: "error", content: "Error: MCPorter not found. Install with: npm i -g mcporter" },
    { type: "output", content: "Web search v4 loaded · Brave ✓ · Answers ✓ · Jina ✓" },
  ])
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleSubmit = () => {
    if (!input.trim()) return

    const newHistory = [...history, { type: "input" as const, content: input }]

    // Simulate command responses
    if (input.includes("/gsd discuss")) {
      newHistory.push({
        type: "output",
        content: "Entering discussion mode...\n\nCurrently working on: S05 - Animation state machine authoring\n\nWhat would you like to discuss about the current architecture?",
      })
    } else if (input.includes("/gsd status")) {
      newHistory.push({
        type: "output",
        content: `GSD Status Report
─────────────────
Milestone: M006/M008 (75%)
Current Slice: S05 - Animation state machine authoring
Phase: WORKING
Elapsed: 3h 42m
Cost: $332.88
Tokens: 272k (13.1% of context)
Model: gpt-5.4

Recent Completions:
  ✓ S04: Event binding system
  ✓ S03: Timeline component
  ✓ S02: Keyframe interpolation`,
      })
    } else if (input.includes("/gsd queue")) {
      newHistory.push({
        type: "output",
        content: `Queued Milestones:
─────────────────
1. [CURRENT] M006: Animation System
2. [QUEUED]  M007: Export Pipeline  
3. [QUEUED]  M008: Documentation

Use '/gsd queue add <milestone>' to add more.`,
      })
    } else if (input.includes("/gsd")) {
      newHistory.push({
        type: "output",
        content: `Available commands:
  /gsd auto     - Start auto mode
  /gsd discuss  - Enter discussion mode
  /gsd status   - Check current progress
  /gsd queue    - View/manage milestone queue
  /gsd pause    - Pause auto mode
  /gsd resume   - Resume auto mode`,
      })
    } else {
      newHistory.push({
        type: "output",
        content: `Command not recognized. Type '/gsd' for available commands.`,
      })
    }

    setHistory(newHistory)
    setInput("")
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSubmit()
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [history])

  return (
    <div
      className="flex h-full flex-col bg-terminal font-mono text-sm"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Terminal header */}
      <div className="flex items-center justify-between border-b border-border/50 bg-card/50 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">gsd command</span>
        <span className="text-xs text-muted-foreground">READY</span>
      </div>

      {/* Terminal content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {/* Extension warnings */}
        <div className="mb-4 text-xs text-muted-foreground/70">
          {[
            "[gsd] Extension load error: Tool \"github_issues\" conflicts with /Users/sn0w/.pi/agent/extensions/github/index.ts",
            "[gsd] Extension load error: Tool \"github_prs\" conflicts with /Users/sn0w/.pi/agent/extensions/github/index.ts",
            "[gsd] Extension load error: Tool \"github_comments\" conflicts with /Users/sn0w/.pi/agent/extensions/github/index.ts",
          ].map((log, i) => (
            <div key={i} className="truncate">
              {log}
            </div>
          ))}
        </div>

        {/* GSD Logo */}
        <pre className="text-info mb-1 text-xs leading-none">{GSD_LOGO}</pre>
        <div className="mb-6 flex items-center gap-2 text-muted-foreground">
          <span className="font-semibold text-foreground">Get Shit Done</span>
          <span className="text-xs">v2.10.4</span>
        </div>

        {/* Warnings/Errors */}
        {history.map((item, i) => (
          <div
            key={i}
            className={cn(
              "mb-2 whitespace-pre-wrap",
              item.type === "warning" && "text-warning",
              item.type === "error" && "text-destructive",
              item.type === "input" && "text-foreground before:content-['$_'] before:text-muted-foreground",
              item.type === "output" && "text-terminal-foreground"
            )}
          >
            {item.content}
          </div>
        ))}
      </div>

      {/* Bottom status */}
      <div className="border-t border-border/50 bg-card/30 px-3 py-2 text-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-muted-foreground">~/Documents/dev/based (main)</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">$0.000 (sub)</span>
            <span className="text-muted-foreground">0.0%/272k</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>(openai-codex)</span>
            <span>gpt-5.4 • xhigh</span>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border/50 px-3 py-2 flex items-center gap-2">
        <span className="text-muted-foreground">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type /gsd for commands..."
          className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50"
          autoFocus
        />
        <span className="inline-block h-4 w-2 bg-foreground animate-pulse" />
      </div>
    </div>
  )
}

export function DualTerminal() {
  const [splitPosition, setSplitPosition] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleMouseDown = () => {
    isDragging.current = true
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = (x / rect.width) * 100
    setSplitPosition(Math.max(20, Math.min(80, percent)))
  }

  const handleMouseUp = () => {
    isDragging.current = false
  }

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-medium">Power User Mode</span>
          <span className="text-xs text-muted-foreground">Two terminals, one project</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Left: Auto Mode</span>
          <span className="text-border">|</span>
          <span>Right: Commands</span>
        </div>
      </div>

      {/* Split terminals */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Left terminal - Auto mode */}
        <div style={{ width: `${splitPosition}%` }} className="h-full overflow-hidden">
          <AutoTerminal />
        </div>

        {/* Divider */}
        <div
          className="flex w-1 cursor-col-resize items-center justify-center bg-border hover:bg-muted-foreground/30 transition-colors"
          onMouseDown={handleMouseDown}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Right terminal - Command interface */}
        <div style={{ width: `${100 - splitPosition}%` }} className="h-full overflow-hidden">
          <CommandTerminal />
        </div>
      </div>
    </div>
  )
}
