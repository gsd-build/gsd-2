"use client"

import { GitCommit, GitBranch, CheckCircle2, Play, Clock, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

interface ActivityEvent {
  id: string
  type: "commit" | "task-start" | "task-complete" | "slice-complete" | "auto-start" | "branch"
  timestamp: string
  title: string
  description?: string
  metadata?: {
    tokens?: number
    cost?: number
    duration?: string
  }
}

const activityLog: ActivityEvent[] = [
  {
    id: "1",
    type: "task-start",
    timestamp: "14:23:15",
    title: "Task T02 started",
    description: "Dispatch prompt builder",
    metadata: { tokens: 0 },
  },
  {
    id: "2",
    type: "commit",
    timestamp: "14:21:43",
    title: "feat(S02/T01): pre-load context files",
    description: "Added context file pre-loading with dependency resolution",
    metadata: { tokens: 34200 },
  },
  {
    id: "3",
    type: "task-complete",
    timestamp: "14:21:40",
    title: "Task T01 complete",
    description: "Pre-load context files",
    metadata: { tokens: 34200, cost: 0.51, duration: "8m 23s" },
  },
  {
    id: "4",
    type: "task-start",
    timestamp: "14:13:17",
    title: "Task T01 started",
    description: "Pre-load context files",
  },
  {
    id: "5",
    type: "slice-complete",
    timestamp: "14:08:45",
    title: "Slice S01 complete",
    description: "State Machine — 2 tasks merged to main",
    metadata: { tokens: 89400, cost: 1.34 },
  },
  {
    id: "6",
    type: "commit",
    timestamp: "14:08:40",
    title: "feat(M002/S01): state machine",
    description: "Squash merge to main",
  },
  {
    id: "7",
    type: "branch",
    timestamp: "14:08:38",
    title: "Branch gsd/M002/S01 merged",
    description: "Deleted after merge",
  },
  {
    id: "8",
    type: "branch",
    timestamp: "14:08:30",
    title: "Branch gsd/M002/S02 created",
    description: "Context Injection slice started",
  },
  {
    id: "9",
    type: "task-complete",
    timestamp: "14:05:12",
    title: "Task T02 complete",
    description: "Transition handlers",
    metadata: { tokens: 45600, cost: 0.68, duration: "12m 45s" },
  },
  {
    id: "10",
    type: "auto-start",
    timestamp: "11:49:00",
    title: "Auto mode started",
    description: "Milestone M002 — Auto Mode Engine",
  },
]

function EventIcon({ type }: { type: ActivityEvent["type"] }) {
  const baseClass = "h-4 w-4"
  switch (type) {
    case "commit":
      return <GitCommit className={cn(baseClass, "text-foreground")} />
    case "task-start":
      return <Play className={cn(baseClass, "text-muted-foreground")} />
    case "task-complete":
      return <CheckCircle2 className={cn(baseClass, "text-foreground/70")} />
    case "slice-complete":
      return <CheckCircle2 className={cn(baseClass, "text-foreground")} />
    case "auto-start":
      return <Zap className={cn(baseClass, "text-foreground")} />
    case "branch":
      return <GitBranch className={cn(baseClass, "text-muted-foreground")} />
    default:
      return <Clock className={cn(baseClass, "text-muted-foreground")} />
  }
}

export function ActivityView() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-6 py-3">
        <h1 className="text-lg font-semibold">Activity Log</h1>
        <p className="text-sm text-muted-foreground">
          Execution history and git operations
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="relative px-6 py-4">
          {/* Timeline line */}
          <div className="absolute left-10 top-6 bottom-6 w-px bg-border" />

          <div className="space-y-4">
            {activityLog.map((event) => (
              <div key={event.id} className="relative flex gap-4">
                {/* Timeline dot */}
                <div className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-card">
                  <EventIcon type={event.type} />
                </div>

                {/* Content */}
                <div className="flex-1 pt-0.5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-sm">{event.title}</p>
                      {event.description && (
                        <p className="text-sm text-muted-foreground">{event.description}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 font-mono text-xs text-muted-foreground">
                      {event.timestamp}
                    </span>
                  </div>

                  {event.metadata && (
                    <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                      {event.metadata.tokens !== undefined && event.metadata.tokens > 0 && (
                        <span>{(event.metadata.tokens / 1000).toFixed(1)}K tokens</span>
                      )}
                      {event.metadata.cost !== undefined && (
                        <span>${event.metadata.cost.toFixed(2)}</span>
                      )}
                      {event.metadata.duration && <span>{event.metadata.duration}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
