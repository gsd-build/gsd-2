/**
 * FileTree — recursive file tree component for Code Explorer.
 * Loads directory contents via /api/fs/list and lazily expands directories.
 * Enhanced with FileTypeIcon, git status coloring, and vertical indent guides.
 */
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Folder, FolderOpen } from "lucide-react";
import { FileTypeIcon } from "./FileTypeIcon";
import type { FileSystemEntry } from "@/server/fs-types";

interface FileTreeProps {
  projectRoot: string;
  onSelectFile: (path: string) => void;
  selectedFile: string | null;
  gitStatus?: Map<string, string>;
}

/** Map git status code to a highlight color. */
function getGitColor(status: string): string | undefined {
  if (status === "M" || status === "MM") return "#f97316";  // orange — modified
  if (status === "??") return "#22c55e";                     // green — untracked
  if (status === "A" || status === "AM") return "#10b981";  // emerald — staged/added
  if (status === "D") return "#ef4444";                      // red — deleted
  return undefined;
}

export function FileTree({ projectRoot, onSelectFile, selectedFile, gitStatus }: FileTreeProps) {
  const [entries, setEntries] = useState<Map<string, FileSystemEntry[]>>(new Map());
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const loadDir = useCallback(async (dirPath: string) => {
    if (entries.has(dirPath)) return;
    setLoading((prev) => new Set(prev).add(dirPath));
    try {
      const res = await fetch("/api/fs/list?path=" + encodeURIComponent(dirPath));
      if (res.ok) {
        const data: FileSystemEntry[] = await res.json();
        setEntries((prev) => new Map(prev).set(dirPath, data));
      }
    } catch {
      // ignore network errors
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  }, [entries]);

  // Reset tree state when projectRoot changes so stale entries from the previous
  // project don't linger in the entries map or expandedDirs set.
  // This runs before the load effect (React processes effects in declaration order),
  // so the state is clean when loadDir fires for the new root.
  useEffect(() => {
    setEntries(new Map());
    setExpandedDirs(new Set());
  }, [projectRoot]);

  // Load root on mount (and when projectRoot changes, after the reset above)
  useEffect(() => {
    if (projectRoot) {
      loadDir(projectRoot);
      setExpandedDirs(new Set([projectRoot]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot]);

  const toggleDir = useCallback((dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
        loadDir(dirPath);
      }
      return next;
    });
  }, [loadDir]);

  /** Check if a directory has any git-modified children (recursive via statusMap keys). */
  const dirHasChanges = (dirPath: string): string | undefined => {
    if (!gitStatus || gitStatus.size === 0) return undefined;
    const normalizedDir = dirPath.replace(/\\/g, "/");
    for (const [filePath, status] of gitStatus) {
      if (filePath.startsWith(normalizedDir + "/")) {
        return getGitColor(status);
      }
    }
    return undefined;
  };

  const renderEntries = (dirPath: string, depth: number): ReactNode => {
    const dirEntries = entries.get(dirPath);
    if (!dirEntries) {
      if (loading.has(dirPath)) {
        return (
          <div style={{ paddingLeft: `${(depth + 1) * 16}px` }} className="py-1 text-xs text-slate-500">
            Loading…
          </div>
        );
      }
      return null;
    }

    return dirEntries.map((entry) => {
      const isSelected = entry.path === selectedFile;
      const isExpanded = expandedDirs.has(entry.path);
      const normalizedEntryPath = entry.path.replace(/\\/g, "/");

      if (entry.isDirectory) {
        const changeColor = dirHasChanges(entry.path);
        return (
          <div key={entry.path}>
            <button
              type="button"
              onClick={() => toggleDir(entry.path)}
              className="flex w-full items-center gap-1 py-1 text-xs text-slate-400 transition-colors hover:bg-navy-700 hover:text-slate-300 rounded"
              style={{ paddingLeft: `${depth * 16 + 8}px`, position: "relative" }}
              title={entry.path}
            >
              {depth > 0 && (
                <span style={{
                  position: "absolute",
                  left: `${(depth - 1) * 16 + 8 + 6}px`,
                  top: 0,
                  bottom: 0,
                  width: "1px",
                  background: "#2D3B4E",
                  pointerEvents: "none",
                }} />
              )}
              {isExpanded
                ? <FolderOpen className="h-3 w-3 shrink-0 text-status-warning" />
                : <Folder className="h-3 w-3 shrink-0 text-slate-500" />
              }
              <span className="truncate">{entry.name}</span>
              {changeColor && (
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: changeColor,
                    flexShrink: 0,
                    marginLeft: "4px",
                  }}
                />
              )}
            </button>
            {isExpanded && renderEntries(entry.path, depth + 1)}
          </div>
        );
      }

      const fileStatus = gitStatus?.get(normalizedEntryPath);
      const statusColor = fileStatus ? getGitColor(fileStatus) : undefined;

      return (
        <button
          key={entry.path}
          type="button"
          onClick={() => onSelectFile(entry.path)}
          className={`flex w-full items-center gap-1 py-1 text-xs rounded transition-colors ${
            isSelected
              ? "bg-navy-700 text-cyan-accent"
              : "text-slate-400 hover:bg-navy-700 hover:text-slate-300"
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px`, position: "relative" }}
          title={entry.path}
        >
          {depth > 0 && (
            <span style={{
              position: "absolute",
              left: `${(depth - 1) * 16 + 8 + 6}px`,
              top: 0,
              bottom: 0,
              width: "1px",
              background: "#2D3B4E",
              pointerEvents: "none",
            }} />
          )}
          <FileTypeIcon filename={entry.name} className="h-3 w-3 shrink-0" />
          <span className="truncate" style={statusColor && !isSelected ? { color: statusColor } : undefined}>
            {entry.name}
          </span>
        </button>
      );
    });
  };

  return (
    <div className="h-full overflow-auto scrollbar-thin py-1">
      {renderEntries(projectRoot, 0)}
    </div>
  );
}
