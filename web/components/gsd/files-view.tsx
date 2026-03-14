"use client"

import { useState } from "react"
import {
  FileText,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  File,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FileNode {
  name: string
  type: "file" | "folder"
  children?: FileNode[]
  content?: string
}

const gsdFiles: FileNode = {
  name: ".gsd",
  type: "folder",
  children: [
    {
      name: "STATE.md",
      type: "file",
      content: `---
milestone: M002
slice: S02
task: T02
phase: execute
auto_mode: true
---

# Current State

## Active Unit
- **Milestone:** M002 — Auto Mode Engine
- **Slice:** S02 — Context Injection
- **Task:** T02 — Dispatch prompt builder

## Progress
- Tasks Completed: 5/9
- Current Phase: Execute
- Auto Mode: Active

## Last Update
2024-03-14T14:23:15Z`,
    },
    {
      name: "PROJECT.md",
      type: "file",
      content: `# GSD 2

A TypeScript CLI application that controls an LLM coding agent.

## Architecture
- CLI binary built with Pi SDK
- State machine driven by .gsd/ files
- Branch-per-slice git strategy
- Fresh context window per task

## Key Features
- Autonomous mode (/gsd auto)
- Step mode (/gsd)
- Crash recovery
- Cost tracking`,
    },
    {
      name: "DECISIONS.md",
      type: "file",
      content: `# Decisions Register

## D001: State lives on disk
**Context:** Need crash recovery and multi-terminal support
**Decision:** All state in .gsd/ files, no in-memory state
**Consequences:** Sessions can resume, but need file I/O

## D002: Fresh context per task
**Context:** Long sessions degrade quality
**Decision:** New 200k window per task
**Consequences:** Better quality, more overhead`,
    },
    {
      name: "milestones",
      type: "folder",
      children: [
        {
          name: "M002-Auto-Mode-Engine",
          type: "folder",
          children: [
            { name: "M002-ROADMAP.md", type: "file" },
            { name: "M002-CONTEXT.md", type: "file" },
            { name: "M002-RESEARCH.md", type: "file" },
            {
              name: "S01-State-Machine",
              type: "folder",
              children: [
                { name: "S01-PLAN.md", type: "file" },
                { name: "S01-UAT.md", type: "file" },
                { name: "T01-PLAN.md", type: "file" },
                { name: "T01-SUMMARY.md", type: "file" },
                { name: "T02-PLAN.md", type: "file" },
                { name: "T02-SUMMARY.md", type: "file" },
              ],
            },
            {
              name: "S02-Context-Injection",
              type: "folder",
              children: [
                { name: "S02-PLAN.md", type: "file" },
                { name: "T01-PLAN.md", type: "file" },
                { name: "T01-SUMMARY.md", type: "file" },
                { name: "T02-PLAN.md", type: "file" },
              ],
            },
          ],
        },
      ],
    },
    { name: "preferences.md", type: "file" },
    { name: "metrics.json", type: "file" },
  ],
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
  selectedFile: string | null
  onSelectFile: (name: string, content?: string) => void
}

function FileTreeItem({ node, depth, selectedFile, onSelectFile }: FileTreeItemProps) {
  const [isOpen, setIsOpen] = useState(depth < 2)

  const handleClick = () => {
    if (node.type === "folder") {
      setIsOpen(!isOpen)
    } else {
      onSelectFile(node.name, node.content)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-1 text-sm hover:bg-accent/50 transition-colors",
          selectedFile === node.name && node.type === "file" && "bg-accent"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === "folder" && (
          isOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )
        )}
        <FileIcon name={node.name} isFolder={node.type === "folder"} isOpen={isOpen} />
        <span className="truncate">{node.name}</span>
      </button>
      {node.type === "folder" && isOpen && node.children && (
        <div>
          {node.children.map((child, i) => (
            <FileTreeItem
              key={i}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FilesView() {
  const [selectedFile, setSelectedFile] = useState<string | null>("STATE.md")
  const [fileContent, setFileContent] = useState<string | undefined>(
    gsdFiles.children?.[0].content
  )

  const handleSelectFile = (name: string, content?: string) => {
    setSelectedFile(name)
    setFileContent(content)
  }

  return (
    <div className="flex h-full">
      {/* File tree */}
      <div className="w-64 flex-shrink-0 border-r border-border overflow-y-auto">
        <div className="py-2">
          <FileTreeItem
            node={gsdFiles}
            depth={0}
            selectedFile={selectedFile}
            onSelectFile={handleSelectFile}
          />
        </div>
      </div>

      {/* File content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedFile && (
          <>
            <div className="flex h-9 items-center border-b border-border px-4">
              <span className="text-sm font-medium">{selectedFile}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
              {fileContent ? (
                <pre className="whitespace-pre-wrap text-muted-foreground">{fileContent}</pre>
              ) : (
                <p className="text-muted-foreground italic">No preview available</p>
              )}
            </div>
          </>
        )}
        {!selectedFile && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  )
}
