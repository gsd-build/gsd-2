/**
 * Hook for project browser state and FS API interaction.
 * Manages directory browsing, project switching, and recent projects.
 */
import { useState, useEffect, useCallback } from "react";
import type { FileSystemEntry, RecentProject } from "../server/fs-types";

export interface UseProjectBrowserResult {
  /** Current directory path being browsed */
  currentPath: string | null;
  /** Entries in the current directory */
  entries: FileSystemEntry[];
  /** Whether a fetch is in progress */
  loading: boolean;
  /** Error message if last operation failed */
  error: string | null;
  /** Recently opened projects */
  recentProjects: RecentProject[];
  /** Browse a directory */
  browse: (path: string) => Promise<void>;
  /** Open a project (triggers pipeline switch) */
  openProject: (path: string) => Promise<void>;
  /** Load recent projects list */
  loadRecentProjects: () => Promise<void>;
  /** Navigate to parent directory */
  goUp: () => void;
}

/**
 * Hook for managing the project browser state.
 * Fetches directory listings from /api/fs/list and triggers project switches via /api/project/switch.
 */
export function useProjectBrowser(): UseProjectBrowserResult {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileSystemEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  const browse = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: FileSystemEntry[] = await res.json();
      setEntries(data);
      setCurrentPath(path);
    } catch (err: any) {
      setError(err.message || "Failed to browse directory");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const openProject = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/project/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Switch failed" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      // Refresh recent projects after successful switch
      await loadRecentProjects();
    } catch (err: any) {
      setError(err.message || "Failed to switch project");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecentProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects/recent");
      if (res.ok) {
        const data: RecentProject[] = await res.json();
        setRecentProjects(data);
      }
    } catch {
      // Silent fail — recent projects are non-critical
    }
  }, []);

  const goUp = useCallback(() => {
    if (!currentPath) return;
    const segments = currentPath.replace(/\\/g, "/").split("/").filter(Boolean);
    if (segments.length <= 1) return; // At root
    segments.pop();
    const parentPath = segments.join("/");
    // On Windows, paths like C:/Users need the drive letter
    const parent = currentPath.match(/^[A-Z]:/i) ? parentPath : "/" + parentPath;
    browse(parent);
  }, [currentPath, browse]);

  // Load recent projects on mount
  useEffect(() => {
    loadRecentProjects();
  }, [loadRecentProjects]);

  return {
    currentPath,
    entries,
    loading,
    error,
    recentProjects,
    browse,
    openProject,
    loadRecentProjects,
    goUp,
  };
}
