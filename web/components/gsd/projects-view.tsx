"use client"

import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react"
import { FolderOpen, Loader2, AlertCircle, Layers, Sparkles, ArrowUpCircle, GitBranch, CheckCircle2, FolderRoot, ChevronDown, ExternalLink, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useProjectStoreManager } from "@/lib/project-store-manager"
import { useGSDWorkspaceState, getLiveWorkspaceIndex, getLiveAutoDashboard, formatCost, getCurrentSlice } from "@/lib/gsd-workspace-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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

interface ProjectProgressInfo {
  activeMilestone: string | null
  activeSlice: string | null
  phase: string | null
  milestonesCompleted: number
  milestonesTotal: number
}

interface ProjectMetadata {
  name: string
  path: string
  kind: ProjectDetectionKind
  signals: ProjectDetectionSignals
  lastModified: number
  progress?: ProjectProgressInfo | null
}

// ─── Kind badge config ─────────────────────────────────────────────────────

const KIND_CONFIG: Record<ProjectDetectionKind, { label: string; className: string; icon: typeof FolderOpen }> = {
  "active-gsd": {
    label: "Active",
    className: "bg-success/15 text-success border-success/25",
    icon: Layers,
  },
  "empty-gsd": {
    label: "Initialized",
    className: "bg-info/15 text-info border-info/25",
    icon: FolderOpen,
  },
  brownfield: {
    label: "Existing",
    className: "bg-warning/15 text-warning border-warning/25",
    icon: GitBranch,
  },
  "v1-legacy": {
    label: "Legacy v1",
    className: "bg-warning/15 text-warning border-warning/25",
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

  const loadProjects = useCallback(async (root: string) => {
    const projRes = await fetch(`/api/projects?root=${encodeURIComponent(root)}&detail=true`)
    if (!projRes.ok) throw new Error(`Failed to discover projects: ${projRes.status}`)
    return await projRes.json() as ProjectMetadata[]
  }, [])

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
        const discovered = await loadProjects(prefs.devRoot)
        if (!cancelled) setProjects(discovered)
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
  }, [loadProjects])

  /** Called after dev root is saved — refreshes the view with discovered projects */
  const handleDevRootSaved = useCallback(async (newRoot: string) => {
    setDevRoot(newRoot)
    setLoading(true)
    setError(null)
    try {
      const discovered = await loadProjects(newRoot)
      setProjects(discovered)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [loadProjects])

  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const switchPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const workspaceState = useGSDWorkspaceState()

  // Clean up poll on unmount
  useEffect(() => {
    return () => {
      if (switchPollRef.current) clearInterval(switchPollRef.current)
    }
  }, [])

  const handleProjectCreated = useCallback((newProject: ProjectMetadata) => {
    setProjects(prev => [...prev, newProject].sort((a, b) => a.name.localeCompare(b.name)))
    setNewProjectOpen(false)
    handleSelectProject(newProject)
  }, [])

  function handleSelectProject(project: ProjectMetadata) {
    // Already active — just navigate
    if (activeProjectCwd === project.path) {
      window.dispatchEvent(
        new CustomEvent("gsd:navigate-view", { detail: { view: "dashboard" } })
      )
      return
    }

    setSwitchingTo(project.name)
    const store = manager.switchProject(project.path)

    // Poll the store's boot status until ready (or error/timeout)
    if (switchPollRef.current) clearInterval(switchPollRef.current)
    const startTime = Date.now()
    switchPollRef.current = setInterval(() => {
      const state = store.getSnapshot()
      const elapsed = Date.now() - startTime
      if (state.bootStatus === "ready" || state.bootStatus === "error" || elapsed > 30000) {
        if (switchPollRef.current) clearInterval(switchPollRef.current)
        switchPollRef.current = null
        setSwitchingTo(null)
        window.dispatchEvent(
          new CustomEvent("gsd:navigate-view", { detail: { view: "dashboard" } })
        )
      }
    }, 150)
  }

  // ─── Switching dialog ────────────────────────────────────────────────

  const switchingDialog = (
    <Dialog open={!!switchingTo} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-foreground">
              Opening {switchingTo}
            </h3>
            <p className="text-sm text-muted-foreground">
              Starting project bridge and loading workspace…
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  // ─── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        {switchingDialog}
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  // ─── Error state ───────────────────────────────────────────────────────

  if (error) {
    return (
      <>
        {switchingDialog}
        <div className="flex h-full items-center justify-center px-6">
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      </>
    )
  }

  // ─── No dev root configured ────────────────────────────────────────────

  if (!devRoot) {
    return <DevRootSetup onSaved={handleDevRootSaved} />
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

  // ─── Project list ──────────────────────────────────────────────────────

  return (
    <>
      {switchingDialog}
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6 space-y-6">
          {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{devRoot}</code>
              <span className="ml-2 text-muted-foreground/60">·</span>
              <span className="ml-2">{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0"
            onClick={() => setNewProjectOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Project
          </Button>
        </div>

        {/* New project dialog */}
        <NewProjectDialog
          open={newProjectOpen}
          onOpenChange={setNewProjectOpen}
          devRoot={devRoot}
          existingNames={projects.map(p => p.name)}
          onCreated={handleProjectCreated}
        />

        {/* List */}
        <div className="flex flex-col gap-2">
          {projects.map((project) => {
            const isActive = activeProjectCwd === project.path
            const isExpanded = expandedProject === project.path
            const config = KIND_CONFIG[project.kind]
            const BadgeIcon = config.icon
            const signalText = describeSignals(project.signals)

            return (
              <div key={project.path} className="flex flex-col">
                {/* Row */}
                <button
                  onClick={() => setExpandedProject(isExpanded ? null : project.path)}
                  onDoubleClick={() => handleSelectProject(project)}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all",
                    "hover:bg-accent/50",
                    isActive
                      ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card",
                    isExpanded && "rounded-b-none border-b-0",
                  )}
                >
                  {/* Active indicator dot */}
                  {isActive && (
                    <div className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
                  )}

                  {/* Name */}
                  <h3 className="text-sm font-semibold text-foreground truncate">{project.name}</h3>

                  {/* Kind badge */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0",
                      config.className,
                    )}
                  >
                    <BadgeIcon className="h-3 w-3" />
                    {config.label}
                  </span>

                  {/* Signal chips */}
                  {signalText && (
                    <span className="text-[10px] text-muted-foreground/50 shrink-0 hidden sm:inline">{signalText}</span>
                  )}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Chevron */}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground/40 transition-transform shrink-0",
                      isExpanded && "rotate-180",
                    )}
                  />
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    className={cn(
                      "rounded-b-lg border border-t-0 px-4 py-3 space-y-3",
                      isActive
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-card",
                    )}
                  >
                    {/* Path */}
                    <p className="text-[11px] text-muted-foreground/60 font-mono truncate">{project.path}</p>

                    {/* Progress detail */}
                    {isActive ? (
                      <ActiveProjectDetail workspaceState={workspaceState} />
                    ) : (
                      <InactiveProjectDetail progress={project.progress ?? null} />
                    )}

                    {/* Open button */}
                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        className="gap-1.5 h-8 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectProject(project)
                        }}
                      >
                        <ExternalLink className="h-3 w-3" />
                        {isActive ? "Go to Dashboard" : "Open"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
    </>
  )
}

// ─── New Project Dialog ────────────────────────────────────────────────

function NewProjectDialog({
  open,
  onOpenChange,
  devRoot,
  existingNames,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  devRoot: string
  existingNames: string[]
  onCreated: (project: ProjectMetadata) => void
}) {
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setName("")
      setError(null)
      setCreating(false)
      // Small delay to let the dialog render
      const t = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [open])

  const nameValid = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)
  const nameConflict = existingNames.includes(name)
  const canSubmit = name.length > 0 && nameValid && !nameConflict && !creating

  const validationHint = (() => {
    if (!name) return null
    if (nameConflict) return "A project with this name already exists"
    if (!nameValid) return "Use letters, numbers, hyphens, underscores, dots. Must start with a letter or number."
    return null
  })()

  async function handleCreate() {
    if (!canSubmit) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devRoot, name }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Failed (${res.status})`)
      }
      const project = await res.json() as ProjectMetadata
      onCreated(project)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project")
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Create a new project directory in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{devRoot}</code>
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleCreate()
          }}
          className="space-y-4 py-2"
        >
          <div className="space-y-2">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              ref={inputRef}
              id="project-name"
              placeholder="my-project"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              autoComplete="off"
              aria-invalid={!!validationHint}
            />
            {validationHint && (
              <p className="text-xs text-destructive">{validationHint}</p>
            )}
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            {name && nameValid && !nameConflict && (
              <p className="text-xs text-muted-foreground font-mono">
                {devRoot}/{name}
              </p>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleCreate()}
            disabled={!canSubmit}
            className="gap-1.5"
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Active project detail (reads from workspace store) ────────────────

function ActiveProjectDetail({ workspaceState }: { workspaceState: ReturnType<typeof useGSDWorkspaceState> }) {
  const workspace = getLiveWorkspaceIndex(workspaceState)
  const dashboard = getLiveAutoDashboard(workspaceState)
  const currentSlice = getCurrentSlice(workspace)

  if (!workspace) {
    return <p className="text-xs text-muted-foreground italic">Workspace not loaded</p>
  }

  // Find active milestone
  const activeMilestone = workspace.milestones.find(
    (m) => m.id === workspace.active.milestoneId
  )

  // Count tasks across all slices in the active milestone
  let tasksDone = 0
  let tasksTotal = 0
  if (activeMilestone) {
    for (const slice of activeMilestone.slices) {
      for (const task of slice.tasks) {
        tasksTotal++
        if (task.done) tasksDone++
      }
    }
  }

  const cost = dashboard?.totalCost ?? 0

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
      <div className="space-y-0.5 min-w-[140px]">
        <p className="text-muted-foreground/60 uppercase tracking-wider text-[10px] font-medium">Milestone</p>
        <p className="text-foreground font-medium truncate">
          {activeMilestone ? `${activeMilestone.id}: ${activeMilestone.title}` : "None"}
        </p>
      </div>
      <div className="space-y-0.5 min-w-[140px]">
        <p className="text-muted-foreground/60 uppercase tracking-wider text-[10px] font-medium">Active Slice</p>
        <p className="text-foreground font-medium truncate">
          {currentSlice ? `${currentSlice.id}: ${currentSlice.title}` : "None"}
        </p>
      </div>
      <div className="space-y-0.5 min-w-[100px]">
        <p className="text-muted-foreground/60 uppercase tracking-wider text-[10px] font-medium">Tasks</p>
        <p className="text-foreground font-medium">
          {tasksDone} / {tasksTotal} done
        </p>
      </div>
      <div className="space-y-0.5 min-w-[100px]">
        <p className="text-muted-foreground/60 uppercase tracking-wider text-[10px] font-medium">Session Cost</p>
        <p className="text-foreground font-medium">{formatCost(cost)}</p>
      </div>
    </div>
  )
}

// ─── Inactive project detail (reads from API progress) ─────────────────

function InactiveProjectDetail({ progress }: { progress: ProjectProgressInfo | null }) {
  if (!progress) {
    return <p className="text-xs text-muted-foreground italic">No progress data available</p>
  }

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
      <div className="space-y-0.5 min-w-[140px]">
        <p className="text-muted-foreground/60 uppercase tracking-wider text-[10px] font-medium">Milestone</p>
        <p className="text-foreground font-medium truncate">{progress.activeMilestone ?? "None"}</p>
      </div>
      <div className="space-y-0.5 min-w-[140px]">
        <p className="text-muted-foreground/60 uppercase tracking-wider text-[10px] font-medium">Active Slice</p>
        <p className="text-foreground font-medium truncate">{progress.activeSlice ?? "None"}</p>
      </div>
      <div className="space-y-0.5 min-w-[100px]">
        <p className="text-muted-foreground/60 uppercase tracking-wider text-[10px] font-medium">Phase</p>
        <p className="text-foreground font-medium">{progress.phase ?? "Unknown"}</p>
      </div>
      <div className="space-y-0.5 min-w-[100px]">
        <p className="text-muted-foreground/60 uppercase tracking-wider text-[10px] font-medium">Milestones</p>
        <p className="text-foreground font-medium">{progress.milestonesCompleted} / {progress.milestonesTotal}</p>
      </div>
    </div>
  )
}

// ─── Folder Picker Dialog ───────────────────────────────────────────────

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronRight, Folder, CornerLeftUp } from "lucide-react"

interface BrowseEntry {
  name: string
  path: string
}

interface BrowseResult {
  current: string
  parent: string | null
  entries: BrowseEntry[]
}

function FolderPickerDialog({
  open,
  onOpenChange,
  onSelect,
  initialPath,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
  initialPath?: string | null
}) {
  const [currentPath, setCurrentPath] = useState<string>("")
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<BrowseEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const browse = useCallback(async (targetPath?: string) => {
    setLoading(true)
    setError(null)
    try {
      const param = targetPath ? `?path=${encodeURIComponent(targetPath)}` : ""
      const res = await fetch(`/api/browse-directories${param}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `${res.status}`)
      }
      const data: BrowseResult = await res.json()
      setCurrentPath(data.current)
      setParentPath(data.parent)
      setEntries(data.entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to browse")
    } finally {
      setLoading(false)
    }
  }, [])

  // Load initial directory when dialog opens
  useEffect(() => {
    if (open) {
      void browse(initialPath ?? undefined)
    }
  }, [open, initialPath, browse])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">Choose Folder</DialogTitle>
          <DialogDescription className="text-xs">
            Navigate to the folder that contains your project directories.
          </DialogDescription>
        </DialogHeader>

        {/* Current path breadcrumb */}
        <div className="border-y border-border/40 bg-muted/30 px-5 py-2">
          <p className="font-mono text-xs text-muted-foreground truncate" title={currentPath}>
            {currentPath}
          </p>
        </div>

        {/* Directory listing */}
        <ScrollArea className="h-[320px]">
          <div className="px-2 py-1">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="px-3 py-4 text-center text-xs text-destructive">{error}</div>
            )}

            {!loading && !error && (
              <>
                {/* Parent directory */}
                {parentPath && (
                  <button
                    onClick={() => void browse(parentPath)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
                  >
                    <CornerLeftUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">..</span>
                  </button>
                )}

                {/* Subdirectories */}
                {entries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => void browse(entry.path)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50 group"
                  >
                    <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-foreground truncate flex-1">{entry.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}

                {/* Empty directory */}
                {!parentPath && entries.length === 0 && (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                    No subdirectories
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border/40 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSelect(currentPath)
              onOpenChange(false)
            }}
            disabled={!currentPath}
            className="gap-1.5"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Select This Folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dev Root Setup Component (uses folder picker) ──────────────────────

function DevRootSetup({ onSaved, currentRoot }: { onSaved: (root: string) => void; currentRoot?: string | null }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleSave = useCallback(async (selectedPath: string) => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devRoot: selectedPath }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          (body as { error?: string }).error ?? `Request failed (${res.status})`,
        )
      }

      setSuccess(true)
      onSaved(selectedPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preference")
    } finally {
      setSaving(false)
    }
  }, [onSaved])

  const isCompact = !!currentRoot

  if (isCompact) {
    // Compact inline form for settings panel
    return (
      <div className="space-y-3" data-testid="devroot-settings">
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded border border-border/40 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
            {currentRoot}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
            disabled={saving}
            className="h-9 gap-1.5 shrink-0"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : success ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : (
              <>
                <FolderOpen className="h-3.5 w-3.5" />
                Change
              </>
            )}
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {success && <p className="text-xs text-success">Dev root updated</p>}

        <FolderPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(path) => void handleSave(path)}
          initialPath={currentRoot}
        />
      </div>
    )
  }

  // Full-page centered setup for first-time configuration
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <FolderRoot className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Set your development root</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The folder that contains your projects. GSD will scan it for project directories.
          </p>
        </div>

        <Button
          onClick={() => setPickerOpen(true)}
          disabled={saving}
          className="h-11 gap-2.5 px-6"
          data-testid="projects-devroot-browse"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <FolderOpen className="h-4 w-4" />
              Browse for Folder
            </>
          )}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <FolderPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(path) => void handleSave(path)}
        />
      </div>
    </div>
  )
}

// ─── Exported Dev Root Section for Settings ──────────────────────────────

export function DevRootSettingsSection() {
  const [devRoot, setDevRoot] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((prefs) => setDevRoot(prefs.devRoot ?? null))
      .catch(() => setDevRoot(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading preferences…
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="settings-devroot">
      <div className="flex items-center gap-2.5">
        <FolderRoot className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
          Development Root
        </h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        The parent folder containing your project directories. GSD scans one level deep for projects.
      </p>
      <DevRootSetup
        currentRoot={devRoot ?? ""}
        onSaved={(root) => setDevRoot(root)}
      />
    </div>
  )
}
