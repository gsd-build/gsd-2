"use client"

import { useState, useEffect, useCallback } from "react"
import {
  FileText,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  File,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FileNode {
  name: string
  type: "file" | "directory"
  children?: FileNode[]
}

function FileIcon({ name, isFolder, isOpen }: { name: string; isFolder: boolean; isOpen?: boolean }) {
  if (isFolder) {
    return isOpen ? (
      <FolderOpen className="h-4 w-4 text-muted-foreground" />
    ) : (
      <Folder className="h-4 w-4 text-muted-foreground" />
    )
  }
  if (name.endsWith(".md")) {
    return <FileText className="h-4 w-4 text-muted-foreground" />
  }
  if (name.endsWith(".json") || name.endsWith(".ts") || name.endsWith(".tsx")) {
    return <FileCode className="h-4 w-4 text-muted-foreground" />
  }
  return <File className="h-4 w-4 text-muted-foreground" />
}

interface FileTreeItemProps {
  node: FileNode
  depth: number
  parentPath: string
  selectedPath: string | null
  onSelectFile: (path: string) => void
}

function FileTreeItem({ node, depth, parentPath, selectedPath, onSelectFile }: FileTreeItemProps) {
  const [isOpen, setIsOpen] = useState(depth < 2)
  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name

  const handleClick = () => {
    if (node.type === "directory") {
      setIsOpen(!isOpen)
    } else {
      onSelectFile(fullPath)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-1 text-sm hover:bg-accent/50 transition-colors",
          selectedPath === fullPath && node.type === "file" && "bg-accent"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === "directory" && (
          isOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )
        )}
        <FileIcon name={node.name} isFolder={node.type === "directory"} isOpen={isOpen} />
        <span className="truncate">{node.name}</span>
      </button>
      {node.type === "directory" && isOpen && node.children && (
        <div>
          {node.children.map((child, i) => (
            <FileTreeItem
              key={i}
              node={child}
              depth={depth + 1}
              parentPath={fullPath}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FilesView() {
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchTree() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch("/api/files")
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Failed to fetch files (${res.status})`)
        }
        const data = await res.json()
        if (!cancelled) {
          setTree(data.tree ?? [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch files")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    fetchTree()
    return () => { cancelled = true }
  }, [])

  const handleSelectFile = useCallback(async (path: string) => {
    setSelectedPath(path)
    setFileContent(null)
    setContentError(null)
    setContentLoading(true)

    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed to fetch file (${res.status})`)
      }
      const data = await res.json()
      setFileContent(data.content ?? null)
    } catch (err) {
      setContentError(err instanceof Error ? err.message : "Failed to fetch file content")
    } finally {
      setContentLoading(false)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading files…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-destructive">
        <AlertCircle className="h-5 w-5 mr-2" />
        {error}
      </div>
    )
  }

  if (tree.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No .gsd/ files found
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* File tree */}
      <div className="w-64 flex-shrink-0 border-r border-border overflow-y-auto">
        <div className="py-2">
          {tree.map((node, i) => (
            <FileTreeItem
              key={i}
              node={node}
              depth={0}
              parentPath=""
              selectedPath={selectedPath}
              onSelectFile={handleSelectFile}
            />
          ))}
        </div>
      </div>

      {/* File content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedPath && (
          <>
            <div className="flex h-9 items-center border-b border-border px-4">
              <span className="text-sm font-medium">{selectedPath}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
              {contentLoading ? (
                <div className="flex items-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading…
                </div>
              ) : contentError ? (
                <div className="flex items-center text-destructive">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  {contentError}
                </div>
              ) : fileContent !== null ? (
                <pre className="whitespace-pre-wrap text-muted-foreground">{fileContent}</pre>
              ) : (
                <p className="text-muted-foreground italic">No preview available</p>
              )}
            </div>
          </>
        )}
        {!selectedPath && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  )
}
