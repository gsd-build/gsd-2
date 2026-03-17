"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { GSDWorkspaceStore } from "./gsd-workspace-store"

/**
 * ProjectStoreManager maintains a Map<string, GSDWorkspaceStore> of per-project
 * stores with SSE lifecycle management. Only the active project's store keeps its
 * SSE connection open — background stores are disconnected to save resources.
 *
 * Exposes a useSyncExternalStore-compatible interface for React components to
 * reactively read the active project path.
 */
export class ProjectStoreManager {
  private stores = new Map<string, GSDWorkspaceStore>()
  private activeProjectCwd: string | null = null
  private listeners = new Set<() => void>()

  // ─── useSyncExternalStore interface ──────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): string | null => this.activeProjectCwd

  // ─── Public API ──────────────────────────────────────────────────────────

  getActiveStore(): GSDWorkspaceStore | null {
    if (!this.activeProjectCwd) return null
    return this.stores.get(this.activeProjectCwd) ?? null
  }

  getActiveProjectCwd(): string | null {
    return this.activeProjectCwd
  }

  /**
   * Switch to the given project. Disconnects SSE on the previous active store,
   * creates a new store if needed (lazily), reconnects SSE on re-activated stores.
   */
  switchProject(projectCwd: string): GSDWorkspaceStore {
    // Disconnect SSE on current active store
    if (this.activeProjectCwd && this.activeProjectCwd !== projectCwd) {
      const prev = this.stores.get(this.activeProjectCwd)
      if (prev) prev.disconnectSSE()
    }

    // Get or create store for new project
    let store = this.stores.get(projectCwd)
    if (!store) {
      store = new GSDWorkspaceStore(projectCwd)
      this.stores.set(projectCwd, store)
      store.start()
    } else {
      // Reconnect SSE on re-activated store
      store.reconnectSSE()
    }

    this.activeProjectCwd = projectCwd
    this.notify()
    return store
  }

  /** Dispose all stores and clear manager state. */
  disposeAll(): void {
    for (const store of this.stores.values()) {
      store.dispose()
    }
    this.stores.clear()
    this.activeProjectCwd = null
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

// ─── React Context + Provider + Hook ──────────────────────────────────────

export const ProjectStoreManagerContext = createContext<ProjectStoreManager | null>(null)

export function ProjectStoreManagerProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(() => new ProjectStoreManager())

  useEffect(() => {
    return () => manager.disposeAll()
  }, [manager])

  return (
    <ProjectStoreManagerContext.Provider value={manager}>
      {children}
    </ProjectStoreManagerContext.Provider>
  )
}

export function useProjectStoreManager(): ProjectStoreManager {
  const mgr = useContext(ProjectStoreManagerContext)
  if (!mgr) throw new Error("useProjectStoreManager must be used within ProjectStoreManagerProvider")
  return mgr
}
