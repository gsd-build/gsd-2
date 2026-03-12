/**
 * Recursive tree node component for the project browser.
 * Renders a single file/directory entry with lazy-loaded children.
 */
import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Folder, File } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileSystemEntry } from "@/server/fs-types";

interface FileTreeNodeProps {
  entry: FileSystemEntry;
  depth: number;
  onSelect: (path: string, isGsdProject: boolean) => void;
}

export function FileTreeNode({ entry, depth, onSelect }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileSystemEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (!entry.isDirectory) return;

    // Notify parent of selection
    onSelect(entry.path, entry.isGsdProject);

    // Toggle expand/collapse
    if (expanded) {
      setExpanded(false);
      return;
    }

    // Fetch children on first expand
    if (children === null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/fs/list?path=${encodeURIComponent(entry.path)}`);
        if (res.ok) {
          const data: FileSystemEntry[] = await res.json();
          setChildren(data);
        }
      } catch {
        // Silent — just don't expand
      } finally {
        setLoading(false);
      }
    }

    setExpanded(true);
  }, [entry, expanded, children, onSelect]);

  const paddingLeft = depth * 16 + 8;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-1 py-1 px-2 text-left text-xs font-mono text-slate-300",
          "hover:bg-navy-700 transition-colors",
          entry.isDirectory ? "cursor-pointer" : "cursor-default opacity-70"
        )}
        style={{ paddingLeft }}
      >
        {/* Expand/collapse chevron for directories */}
        {entry.isDirectory ? (
          loading ? (
            <span className="h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-transparent" />
          ) : expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />
          )
        ) : (
          <span className="h-3 w-3 shrink-0" />
        )}

        {/* Icon */}
        {entry.isDirectory ? (
          <Folder className="h-3 w-3 shrink-0 text-slate-400" />
        ) : (
          <File className="h-3 w-3 shrink-0 text-slate-500" />
        )}

        {/* Name */}
        <span className="truncate">{entry.name}</span>

        {/* GSD badge */}
        {entry.isGsdProject && (
          <span className="ml-auto shrink-0 rounded px-1 text-[10px] font-bold text-cyan-accent bg-cyan-accent/10">
            GSD
          </span>
        )}
      </button>

      {/* Recursively render children */}
      {expanded && children && children.map((child) => (
        <FileTreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
