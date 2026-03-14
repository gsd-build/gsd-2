"use client"

import { CheckCircle2, Circle, Play, AlertTriangle, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface RoadmapSlice {
  id: string
  name: string
  status: "done" | "in-progress" | "pending"
  tasks: number
  completedTasks: number
  risk?: "low" | "medium" | "high"
  dependencies?: string[]
}

interface RoadmapMilestone {
  id: string
  name: string
  description: string
  status: "done" | "in-progress" | "pending"
  slices: RoadmapSlice[]
}

const roadmapData: RoadmapMilestone[] = [
  {
    id: "M001",
    name: "Core Infrastructure",
    description: "Foundation layer with data models, file I/O, and API setup",
    status: "done",
    slices: [
      { id: "S01", name: "Data Model & Types", status: "done", tasks: 3, completedTasks: 3 },
      { id: "S02", name: "API Endpoints", status: "done", tasks: 2, completedTasks: 2 },
      { id: "S03", name: "File System Utils", status: "done", tasks: 4, completedTasks: 4 },
      { id: "S04", name: "Config Management", status: "done", tasks: 2, completedTasks: 2 },
    ],
  },
  {
    id: "M002",
    name: "Auto Mode Engine",
    description: "The autonomous execution system with state machine and context injection",
    status: "in-progress",
    slices: [
      { id: "S01", name: "State Machine", status: "done", tasks: 2, completedTasks: 2 },
      {
        id: "S02",
        name: "Context Injection",
        status: "in-progress",
        tasks: 3,
        completedTasks: 1,
        risk: "medium",
      },
      {
        id: "S03",
        name: "Crash Recovery",
        status: "pending",
        tasks: 2,
        completedTasks: 0,
        risk: "high",
        dependencies: ["S02"],
      },
      {
        id: "S04",
        name: "Stuck Detection",
        status: "pending",
        tasks: 3,
        completedTasks: 0,
        dependencies: ["S02", "S03"],
      },
      { id: "S05", name: "Timeout Supervision", status: "pending", tasks: 2, completedTasks: 0 },
    ],
  },
  {
    id: "M003",
    name: "Dashboard & Observability",
    description: "Real-time monitoring, cost tracking, and progress visualization",
    status: "pending",
    slices: [
      { id: "S01", name: "Cost Tracking", status: "pending", tasks: 2, completedTasks: 0 },
      { id: "S02", name: "Token Ledger", status: "pending", tasks: 3, completedTasks: 0 },
      { id: "S03", name: "Progress Dashboard", status: "pending", tasks: 4, completedTasks: 0 },
      { id: "S04", name: "Budget Controls", status: "pending", tasks: 2, completedTasks: 0 },
    ],
  },
  {
    id: "M004",
    name: "Git Integration",
    description: "Branch-per-slice workflow with automatic squash merges",
    status: "pending",
    slices: [
      { id: "S01", name: "Branch Management", status: "pending", tasks: 3, completedTasks: 0 },
      { id: "S02", name: "Commit Strategy", status: "pending", tasks: 2, completedTasks: 0 },
      { id: "S03", name: "Squash Merge", status: "pending", tasks: 2, completedTasks: 0 },
    ],
  },
]

const StatusIcon = ({
  status,
  size = "default",
}: {
  status: "done" | "in-progress" | "pending"
  size?: "default" | "large"
}) => {
  const sizeClass = size === "large" ? "h-5 w-5" : "h-4 w-4"
  if (status === "done") {
    return <CheckCircle2 className={cn(sizeClass, "text-foreground/70")} />
  }
  if (status === "in-progress") {
    return <Play className={cn(sizeClass, "text-foreground")} />
  }
  return <Circle className={cn(sizeClass, "text-muted-foreground/40")} />
}

const RiskBadge = ({ risk }: { risk: "low" | "medium" | "high" }) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
        risk === "high" && "bg-destructive/20 text-destructive",
        risk === "medium" && "bg-warning/20 text-warning",
        risk === "low" && "bg-muted text-muted-foreground"
      )}
    >
      {risk === "high" && <AlertTriangle className="h-2.5 w-2.5" />}
      {risk}
    </span>
  )
}

export function Roadmap() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-6 py-3">
        <h1 className="text-lg font-semibold">Roadmap</h1>
        <p className="text-sm text-muted-foreground">
          Project milestone structure with slices and dependencies
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {roadmapData.map((milestone) => (
            <div key={milestone.id} className="rounded-md border border-border bg-card">
              {/* Milestone Header */}
              <div
                className={cn(
                  "flex items-center gap-3 border-b border-border px-4 py-3",
                  milestone.status === "in-progress" && "bg-accent/30"
                )}
              >
                <StatusIcon status={milestone.status} size="large" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{milestone.id}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-semibold">{milestone.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{milestone.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">
                    {milestone.slices.filter((s) => s.status === "done").length}/{milestone.slices.length} slices
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {milestone.slices.reduce((acc, s) => acc + s.completedTasks, 0)}/
                    {milestone.slices.reduce((acc, s) => acc + s.tasks, 0)} tasks
                  </div>
                </div>
              </div>

              {/* Slices */}
              <div className="divide-y divide-border">
                {milestone.slices.map((slice) => (
                  <div
                    key={`${milestone.id}-${slice.id}`}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5",
                      slice.status === "in-progress" && "bg-accent/20",
                      slice.status === "pending" && "opacity-60"
                    )}
                  >
                    <div className="w-4" />
                    <StatusIcon status={slice.status} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{slice.id}</span>
                        <span className="text-sm">{slice.name}</span>
                        {slice.risk && <RiskBadge risk={slice.risk} />}
                        {slice.dependencies && slice.dependencies.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            depends on {slice.dependencies.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-24">
                        <div className="h-1 w-full rounded-full bg-accent">
                          <div
                            className="h-full rounded-full bg-foreground/70 transition-all"
                            style={{
                              width: `${(slice.completedTasks / slice.tasks) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <span className="w-12 text-right text-xs text-muted-foreground">
                        {slice.completedTasks}/{slice.tasks}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
