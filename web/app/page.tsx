"use client"

import { useState } from "react"
import { Sidebar } from "@/components/gsd/sidebar"
import { Terminal } from "@/components/gsd/terminal"
import { Dashboard } from "@/components/gsd/dashboard"
import { Roadmap } from "@/components/gsd/roadmap"
import { FilesView } from "@/components/gsd/files-view"
import { ActivityView } from "@/components/gsd/activity-view"
import { StatusBar } from "@/components/gsd/status-bar"
import { DualTerminal } from "@/components/gsd/dual-terminal"
import { cn } from "@/lib/utils"

export default function GSDInterface() {
  const [activeView, setActiveView] = useState("dashboard")
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false)

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex h-10 flex-shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-background text-xs font-bold">
              G
            </div>
            <span className="font-semibold tracking-tight">GSD 2</span>
          </div>
          <span className="text-xs text-muted-foreground">Autonomous Coding Agent</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Connected
          </span>
          <span className="font-mono text-xs text-muted-foreground">v2.0.0</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar activeView={activeView} onViewChange={setActiveView} />

        {/* Main Panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* View Area */}
          <div
            className={cn(
              "flex-1 overflow-hidden transition-all",
              isTerminalExpanded && "h-1/3"
            )}
          >
            {activeView === "dashboard" && <Dashboard />}
            {activeView === "terminal" && <Terminal className="h-full" />}
            {activeView === "power" && <DualTerminal />}
            {activeView === "roadmap" && <Roadmap />}
            {activeView === "files" && <FilesView />}
            {activeView === "activity" && <ActivityView />}
          </div>

          {/* Terminal Panel (when not in terminal view) */}
          {activeView !== "terminal" && activeView !== "power" && (
            <div className="border-t border-border">
              <button
                onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
                className="flex h-7 w-full items-center justify-between bg-card px-3 text-xs hover:bg-accent/50 transition-colors"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-medium">Terminal</span>
                  <span className="font-mono text-[10px]">gsd/M002/S02</span>
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  AUTO
                </span>
              </button>
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  isTerminalExpanded ? "h-64" : "h-0"
                )}
              >
                <Terminal className="h-full" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar />
    </div>
  )
}
