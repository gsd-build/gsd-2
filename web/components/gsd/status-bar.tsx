"use client"

import { GitBranch, Cpu, DollarSign, Clock, Zap } from "lucide-react"

export function StatusBar() {
  return (
    <div className="flex h-6 items-center justify-between border-t border-border bg-card px-3 text-xs">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
          <span className="text-muted-foreground">Auto Mode</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <GitBranch className="h-3 w-3" />
          <span className="font-mono">gsd/M002/S02</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Cpu className="h-3 w-3" />
          <span className="font-mono">claude-sonnet-4-6</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>2h 34m</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Zap className="h-3 w-3" />
          <span>847K tokens</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <DollarSign className="h-3 w-3" />
          <span>$12.47</span>
        </div>
        <span className="text-muted-foreground">M002/S02/T02 — 58%</span>
      </div>
    </div>
  )
}
