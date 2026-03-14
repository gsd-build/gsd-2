"use client"

import { useState } from "react"
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Circle,
  Play,
  Folder,
  FileText,
  GitBranch,
  Settings,
  Terminal,
  LayoutDashboard,
  Map,
  Activity,
  Columns2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Task {
  id: string
  name: string
  status: "done" | "in-progress" | "pending"
}

interface Slice {
  id: string
  name: string
  status: "done" | "in-progress" | "pending"
  tasks: Task[]
}

interface Milestone {
  id: string
  name: string
  status: "done" | "in-progress" | "pending"
  slices: Slice[]
}

const mockMilestones: Milestone[] = [
  {
    id: "M001",
    name: "Core Infrastructure",
    status: "done",
    slices: [
      {
        id: "S01",
        name: "Data Model & Types",
        status: "done",
        tasks: [
          { id: "T01", name: "Core types and interfaces", status: "done" },
          { id: "T02", name: "Markdown parser for plan files", status: "done" },
          { id: "T03", name: "File writer with round-trip fidelity", status: "done" },
        ],
      },
      {
        id: "S02",
        name: "API Endpoints",
        status: "done",
        tasks: [
          { id: "T01", name: "REST endpoint setup", status: "done" },
          { id: "T02", name: "Middleware configuration", status: "done" },
        ],
      },
    ],
  },
  {
    id: "M002",
    name: "Auto Mode Engine",
    status: "in-progress",
    slices: [
      {
        id: "S01",
        name: "State Machine",
        status: "done",
        tasks: [
          { id: "T01", name: "State reader implementation", status: "done" },
          { id: "T02", name: "Transition handlers", status: "done" },
        ],
      },
      {
        id: "S02",
        name: "Context Injection",
        status: "in-progress",
        tasks: [
          { id: "T01", name: "Pre-load context files", status: "done" },
          { id: "T02", name: "Dispatch prompt builder", status: "in-progress" },
          { id: "T03", name: "Summary aggregation", status: "pending" },
        ],
      },
      {
        id: "S03",
        name: "Crash Recovery",
        status: "pending",
        tasks: [
          { id: "T01", name: "Lock file management", status: "pending" },
          { id: "T02", name: "Session forensics", status: "pending" },
        ],
      },
    ],
  },
  {
    id: "M003",
    name: "Dashboard & Observability",
    status: "pending",
    slices: [
      {
        id: "S01",
        name: "Cost Tracking",
        status: "pending",
        tasks: [
          { id: "T01", name: "Token counter", status: "pending" },
          { id: "T02", name: "Cost ledger", status: "pending" },
        ],
      },
    ],
  },
]

const StatusIcon = ({ status }: { status: "done" | "in-progress" | "pending" }) => {
  if (status === "done") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-foreground/70" />
  }
  if (status === "in-progress") {
    return <Play className="h-3.5 w-3.5 text-foreground" />
  }
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
}

interface SidebarProps {
  activeView: string
  onViewChange: (view: string) => void
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const [expandedMilestones, setExpandedMilestones] = useState<string[]>(["M002"])
  const [expandedSlices, setExpandedSlices] = useState<string[]>(["M002-S02"])

  const toggleMilestone = (id: string) => {
    setExpandedMilestones((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    )
  }

  const toggleSlice = (id: string) => {
    setExpandedSlices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "terminal", label: "Terminal", icon: Terminal },
    { id: "power", label: "Power Mode", icon: Columns2 },
    { id: "roadmap", label: "Roadmap", icon: Map },
    { id: "files", label: "Files", icon: Folder },
    { id: "activity", label: "Activity", icon: Activity },
  ]

  return (
    <div className="flex h-full">
      {/* Icon bar */}
      <div className="flex w-12 flex-col items-center border-r border-border bg-sidebar py-3 gap-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md transition-colors",
              activeView === item.id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
            title={item.label}
          >
            <item.icon className="h-5 w-5" />
          </button>
        ))}
        <div className="mt-auto flex flex-col gap-1">
          <button
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            title="Git"
          >
            <GitBranch className="h-5 w-5" />
          </button>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Explorer panel */}
      <div className="flex w-56 flex-col border-r border-border bg-sidebar">
        <div className="flex h-9 items-center border-b border-border px-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Explorer
          </span>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          <div className="px-2 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Milestones
            </span>
          </div>
          {mockMilestones.map((milestone) => (
            <div key={milestone.id}>
              <button
                onClick={() => toggleMilestone(milestone.id)}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-sm hover:bg-accent/50 transition-colors"
              >
                {expandedMilestones.includes(milestone.id) ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <StatusIcon status={milestone.status} />
                <span
                  className={cn(
                    "truncate",
                    milestone.status === "pending" && "text-muted-foreground"
                  )}
                >
                  {milestone.id}: {milestone.name}
                </span>
              </button>
              {expandedMilestones.includes(milestone.id) && (
                <div className="ml-4">
                  {milestone.slices.map((slice) => (
                    <div key={`${milestone.id}-${slice.id}`}>
                      <button
                        onClick={() => toggleSlice(`${milestone.id}-${slice.id}`)}
                        className="flex w-full items-center gap-1.5 px-2 py-1 text-sm hover:bg-accent/50 transition-colors"
                      >
                        {expandedSlices.includes(`${milestone.id}-${slice.id}`) ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        )}
                        <StatusIcon status={slice.status} />
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            slice.status === "pending" && "text-muted-foreground"
                          )}
                        >
                          {slice.id}: {slice.name}
                        </span>
                      </button>
                      {expandedSlices.includes(`${milestone.id}-${slice.id}`) && (
                        <div className="ml-5">
                          {slice.tasks.map((task) => (
                            <div
                              key={`${milestone.id}-${slice.id}-${task.id}`}
                              className="flex items-center gap-1.5 px-2 py-0.5 text-xs hover:bg-accent/50 transition-colors cursor-pointer"
                            >
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <StatusIcon status={task.status} />
                              <span
                                className={cn(
                                  "truncate",
                                  task.status === "pending" && "text-muted-foreground"
                                )}
                              >
                                {task.id}: {task.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
