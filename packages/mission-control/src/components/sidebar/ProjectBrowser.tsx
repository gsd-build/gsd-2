/**
 * Main file tree browser panel for the sidebar.
 * Allows browsing directories, detecting GSD projects, and switching projects.
 */
import { useState, useCallback } from "react";
import { ArrowLeft, FolderOpen, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileTreeNode } from "./FileTreeNode";
import type { UseProjectBrowserResult } from "@/hooks/useProjectBrowser";

interface ProjectBrowserProps {
  browser: UseProjectBrowserResult;
  onProjectOpened: () => void;
  onClose: () => void;
}

export function ProjectBrowser({ browser, onProjectOpened, onClose }: ProjectBrowserProps) {
  const { currentPath, entries, loading, error, browse, openProject, goUp } = browser;
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedIsGsd, setSelectedIsGsd] = useState(false);

  const handleStartBrowse = useCallback(() => {
    // Browse from home directory (empty path defaults to homedir on server)
    browse("");
  }, [browse]);

  const handleSelect = useCallback((path: string, isGsdProject: boolean) => {
    setSelectedPath(path);
    setSelectedIsGsd(isGsdProject);
  }, []);

  const handleOpenProject = useCallback(async () => {
    if (!selectedPath) return;
    await openProject(selectedPath);
    onProjectOpened();
  }, [selectedPath, openProject, onProjectOpened]);

  // Build breadcrumb segments from currentPath
  const breadcrumbs = currentPath
    ? currentPath.replace(/\\/g, "/").split("/").filter(Boolean)
    : [];

  return (
    <div className="flex h-full flex-col">
      {/* Header: Back button + breadcrumb */}
      <div className="flex items-center gap-2 border-b border-navy-600 p-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-navy-700 hover:text-slate-300 transition-colors"
          title="Close browser"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="font-display text-xs uppercase tracking-wider text-slate-400">
          Browse
        </span>
      </div>

      {/* Breadcrumb navigation */}
      {currentPath && (
        <div className="flex items-center gap-1 overflow-x-auto p-2 border-b border-navy-700">
          <button
            type="button"
            onClick={goUp}
            className="shrink-0 rounded p-1 text-slate-500 hover:text-slate-300 transition-colors"
            title="Go up"
          >
            <ArrowLeft className="h-3 w-3" />
          </button>
          {breadcrumbs.map((segment, i) => {
            const segmentPath = breadcrumbs.slice(0, i + 1).join("/");
            // Restore drive letter prefix on Windows
            const fullPath = currentPath.match(/^[A-Z]:/i) ? segmentPath : "/" + segmentPath;
            return (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-slate-600">/</span>}
                <button
                  type="button"
                  onClick={() => browse(fullPath)}
                  className="text-xs font-mono text-slate-400 hover:text-cyan-accent transition-colors truncate max-w-[80px]"
                  title={fullPath}
                >
                  {segment}
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Body: file tree or start state */}
      <div className="flex-1 overflow-auto">
        {!currentPath && !loading && (
          <div className="flex flex-col items-center gap-4 p-4 pt-8">
            <FolderOpen className="h-8 w-8 text-slate-500" />
            <p className="text-xs text-slate-400 text-center">
              Browse your file system to find a project directory.
            </p>
            <button
              type="button"
              onClick={handleStartBrowse}
              className={cn(
                "flex items-center gap-2 rounded px-4 py-2",
                "bg-cyan-accent/10 text-cyan-accent text-xs font-display",
                "hover:bg-cyan-accent/20 transition-colors"
              )}
            >
              <FolderOpen className="h-4 w-4" />
              Open Folder
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-4 w-4 animate-spin text-slate-500" />
            <span className="ml-2 text-xs text-slate-400">Loading...</span>
          </div>
        )}

        {error && (
          <div className="p-4">
            <p className="text-xs text-status-error mb-2">{error}</p>
            <button
              type="button"
              onClick={() => currentPath && browse(currentPath)}
              className="text-xs text-cyan-accent hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && currentPath && entries.length === 0 && (
          <p className="p-4 text-xs text-slate-500">Empty directory</p>
        )}

        {!loading && !error && entries.map((entry) => (
          <FileTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* Bottom action bar */}
      {selectedPath && (
        <div className="border-t border-navy-600 p-2">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate text-xs font-mono text-slate-400" title={selectedPath}>
              {selectedPath.split("/").pop()}
            </span>
            <button
              type="button"
              onClick={handleOpenProject}
              className={cn(
                "shrink-0 rounded px-4 py-1 text-xs font-display transition-colors",
                selectedIsGsd
                  ? "bg-cyan-accent text-navy-900 hover:bg-cyan-accent/80"
                  : "bg-navy-600 text-slate-300 hover:bg-navy-500"
              )}
            >
              {selectedIsGsd ? "Open Project" : "Open Here"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
