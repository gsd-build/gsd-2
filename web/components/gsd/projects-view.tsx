"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { FolderOpen, Loader2, AlertCircle, Layers, Sparkles, ArrowUpCircle, GitBranch, FolderKanban } from "lucide-react"
import { cn } from "@/lib/utils"
import { useProjectStoreManager } from "@/lib/project-store-manager"

// ─── Types (mirroring server-side ProjectMetadata) ─────────────────────────

type ProjectDetectionKind = "active-gsd" | "empty-gsd" | "v1-legacy" | "brownfield" | "blank"

interface ProjectDetectionSignals {
  hasGsdFolder: boolean
  hasPlanningFolder: boolean
  hasGitRepo: boolean
  hasPackageJson: boolean
  fileCount: number
  hasMilestones?: boolean
  hasCargo?: boolean
  hasGoMod?: boolean
  hasPyproject?: boolean
}

interface ProjectMetadata {
  name: string
  path: string
  kind: ProjectDetectionKind
  signals: ProjectDetectionSignals
  lastModified: number
}

// ─── Kind badge config ─────────────────────────────────────────────────────

const KIND_CONFIG: Record<ProjectDetectionKind, { label: string; className: string; icon: typeof FolderOpen }> = {
  "active-gsd": {
    label: "Active",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    icon: Layers,
  },
  "empty-gsd": {
    label: "Initialized",
    className: "bg-sky-500/15 text-sky-400 border-sky-500/25",
    icon: FolderOpen,
  },
  brownfield: {
    label: "Existing",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    icon: GitBranch,
  },
  "v1-legacy": {
    label: "Legacy v1",
    className: "bg-orange-500/15 text-orange-400 border-orange-500/25",
    icon: ArrowUpCircle,
  },
  blank: {
    label: "Blank",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
    icon: Sparkles,
  },
}

function describeSignals(signals: ProjectDetectionSignals): string {
  const parts: string[] = []
  if (signals.hasGitRepo) parts.push("Git")
  if (signals.hasPackageJson) parts.push("Node.js")
  if (signals.hasCargo) parts.push("Rust")
  if (signals.hasGoMod) parts.push("Go")
  if (signals.hasPyproject) parts.push("Python")
  if (parts.length === 0 && signals.fileCount > 0) parts.push(`${signals.fileCount} files`)
  return parts.join(" · ")
}

// ─── ProjectsView ──────────────────────────────────────────────────────────

export function ProjectsView() {
  const manager = useProjectStoreManager()
  const activeProjectCwd = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot)

  const [projects, setProjects] = useState<ProjectMetadata[]>([])
  const [devRoot, setDevRoot] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const prefsRes = await fetch("/api/preferences")
        if (!prefsRes.ok) throw new Error(`Failed to load preferences: ${prefsRes.status}`)
        const prefs = await prefsRes.json()

        if (!prefs.devRoot) {
          setDevRoot(null)
          setProjects([])
          setLoading(false)
          return
        }

        setDevRoot(prefs.devRoot)

        const projRes = await fetch(`/api/projects?root=${encodeURIComponent(prefs.devRoot)}`)
        if (!projRes.ok) throw new Error(`Failed to discover projects: ${projRes.status}`)
        const discovered: ProjectMetadata[] = await projRes.json()

        if (!cancelled) {
          setProjects(discovered)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  function handleSelectProject(project: ProjectMetadata) {
    manager.switchProject(project.path)
    // Navigate to dashboard for the switched project
    window.dispatchEvent(
      new CustomEvent("gsd:navigate-view", { detail: { view: "dashboard" } })
    )
  }

  // ─── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ─── Error state ───────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  // ─── No dev root configured ────────────────────────────────────────────

  if (!devRoot) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <FolderKanban className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">No development root configured</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Set up a dev root in Settings to discover projects.
              GSD will scan the directory for project folders and show them here.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Dev root set, no projects found ───────────────────────────────────

  if (projects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <FolderOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">No projects found</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No project directories were discovered in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">{devRoot}</code>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Project grid ──────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{devRoot}</code>
            <span className="ml-2 text-muted-foreground/60">·</span>
            <span className="ml-2">{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const isActive = activeProjectCwd === project.path
            const config = KIND_CONFIG[project.kind]
            const BadgeIcon = config.icon
            const signalText = describeSignals(project.signals)

            return (
              <button
                key={project.path}
                onClick={() => handleSelectProject(project)}
                className={cn(
                  "group relative flex flex-col gap-3 rounded-lg border p-4 text-left transition-all",
                  "hover:bg-accent/50",
                  isActive
                    ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border bg-card",
                )}
              >
                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}

                {/* Name */}
                <div className="space-y-1 pr-4">
                  <h3 className="text-sm font-semibold text-foreground truncate">{project.name}</h3>
                  <p className="text-[11px] text-muted-foreground/60 font-mono truncate">{project.path}</p>
                </div>

                {/* Kind badge + signal chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      config.className,
                    )}
                  >
                    <BadgeIcon className="h-3 w-3" />
                    {config.label}
                  </span>
                  {signalText && (
                    <span className="text-[10px] text-muted-foreground/50">{signalText}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
