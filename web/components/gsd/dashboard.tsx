"use client"

import {
  Activity,
  Clock,
  DollarSign,
  Zap,
  CheckCircle2,
  Circle,
  Play,
  GitBranch,
  Cpu,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface MetricCardProps {
  label: string
  value: string
  subtext?: string
  icon: React.ReactNode
  trend?: "up" | "down" | "neutral"
}

function MetricCard({ label, value, subtext, icon }: MetricCardProps) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          {subtext && <p className="mt-0.5 text-xs text-muted-foreground">{subtext}</p>}
        </div>
        <div className="rounded-md bg-accent p-2 text-muted-foreground">{icon}</div>
      </div>
    </div>
  )
}

interface ProgressItem {
  id: string
  name: string
  status: "done" | "in-progress" | "pending"
  progress?: number
}

const currentSliceTasks: ProgressItem[] = [
  { id: "T01", name: "Pre-load context files", status: "done" },
  { id: "T02", name: "Dispatch prompt builder", status: "in-progress", progress: 65 },
  { id: "T03", name: "Summary aggregation", status: "pending" },
]

const recentActivity = [
  { time: "2m ago", action: "Task T02 started", type: "info" },
  { time: "8m ago", action: "Committed: feat(S02/T01): pre-load context files", type: "success" },
  { time: "15m ago", action: "Task T01 verified", type: "success" },
  { time: "23m ago", action: "Slice S02 research complete", type: "info" },
  { time: "45m ago", action: "Slice S01 merged to main", type: "success" },
  { time: "1h ago", action: "Auto mode started", type: "info" },
]

const modelUsage = [
  { model: "claude-sonnet-4-6", phase: "execution", tokens: 523400, cost: 7.85 },
  { model: "claude-opus-4-6", phase: "planning", tokens: 189200, cost: 3.78 },
  { model: "claude-sonnet-4-6", phase: "research", tokens: 134600, cost: 0.84 },
]

export function Dashboard() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            M002: Auto Mode Engine — S02: Context Injection
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            <span className="font-medium">Auto Mode Active</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span className="font-mono">gsd/M002/S02</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Elapsed Time"
            value="2h 34m"
            subtext="Started at 11:49 AM"
            icon={<Clock className="h-5 w-5" />}
          />
          <MetricCard
            label="Total Cost"
            value="$12.47"
            subtext="Budget: $50.00"
            icon={<DollarSign className="h-5 w-5" />}
          />
          <MetricCard
            label="Tokens Used"
            value="847K"
            subtext="~1.2M projected"
            icon={<Zap className="h-5 w-5" />}
          />
          <MetricCard
            label="Progress"
            value="58%"
            subtext="5/9 tasks complete"
            icon={<Activity className="h-5 w-5" />}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Current Slice Progress */}
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Current Slice: S02 — Context Injection</h2>
            </div>
            <div className="p-4 space-y-3">
              {currentSliceTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3">
                  {task.status === "done" && (
                    <CheckCircle2 className="h-4 w-4 text-foreground/70" />
                  )}
                  {task.status === "in-progress" && <Play className="h-4 w-4 text-foreground" />}
                  {task.status === "pending" && (
                    <Circle className="h-4 w-4 text-muted-foreground/50" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-sm",
                          task.status === "pending" && "text-muted-foreground"
                        )}
                      >
                        {task.id}: {task.name}
                      </span>
                      {task.progress !== undefined && (
                        <span className="text-xs text-muted-foreground">{task.progress}%</span>
                      )}
                    </div>
                    {task.status === "in-progress" && (
                      <div className="mt-1.5 h-1 w-full rounded-full bg-accent">
                        <div
                          className="h-full rounded-full bg-foreground transition-all"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Model Usage */}
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Model Usage</h2>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                {modelUsage.map((usage, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-xs">{usage.model}</span>
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {usage.phase}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{(usage.tokens / 1000).toFixed(0)}K tokens</span>
                      <span className="font-medium text-foreground">${usage.cost.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">847K tokens</span>
                    <span className="font-semibold">$12.47</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-6 rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Recent Activity</h2>
          </div>
          <div className="divide-y divide-border">
            {recentActivity.map((activity, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-16 text-xs text-muted-foreground">{activity.time}</span>
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    activity.type === "success" && "bg-success",
                    activity.type === "info" && "bg-foreground/50"
                  )}
                />
                <span className="text-sm">{activity.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
