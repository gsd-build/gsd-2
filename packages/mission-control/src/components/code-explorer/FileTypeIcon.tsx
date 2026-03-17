/**
 * FileTypeIcon — maps file extension to a colored Lucide icon.
 * Provides VSCode-like visual distinction between file types.
 */
import type { ComponentType, CSSProperties } from "react";
import {
  Code2, FileText, Braces, Paintbrush, Globe, Terminal,
  Settings, Lock, File, Image, Package,
} from "lucide-react";

interface FileTypeIconProps {
  filename: string;
  className?: string;
}

// Map of extension -> [LucideIcon component, color hex]
const EXT_MAP: Record<string, [ComponentType<{ className?: string; style?: CSSProperties }>, string]> = {
  // TypeScript
  ts: [Code2, "#3b82f6"],
  tsx: [Code2, "#3b82f6"],
  // JavaScript
  js: [Code2, "#f59e0b"],
  jsx: [Code2, "#f59e0b"],
  mjs: [Code2, "#f59e0b"],
  cjs: [Code2, "#f59e0b"],
  // JSON / data
  json: [Braces, "#f97316"],
  jsonc: [Braces, "#f97316"],
  // Markdown / text
  md: [FileText, "#94a3b8"],
  mdx: [FileText, "#94a3b8"],
  txt: [FileText, "#64748b"],
  // Styles
  css: [Paintbrush, "#a855f7"],
  scss: [Paintbrush, "#a855f7"],
  sass: [Paintbrush, "#a855f7"],
  less: [Paintbrush, "#a855f7"],
  // Web
  html: [Globe, "#ef4444"],
  htm: [Globe, "#ef4444"],
  svg: [Image, "#22c55e"],
  // Python
  py: [Code2, "#22c55e"],
  // Shell
  sh: [Terminal, "#22c55e"],
  bash: [Terminal, "#22c55e"],
  zsh: [Terminal, "#22c55e"],
  // Config
  yml: [Settings, "#f97316"],
  yaml: [Settings, "#f97316"],
  toml: [Settings, "#64748b"],
  ini: [Settings, "#64748b"],
  // Env / secrets
  env: [Lock, "#f59e0b"],
  // Package
  lock: [Package, "#64748b"],
};

export function FileTypeIcon({ filename, className }: FileTypeIconProps) {
  const ext = filename.includes(".")
    ? filename.split(".").pop()?.toLowerCase() ?? ""
    : "";

  // Special case: .env.local, .env.production etc.
  const lowerName = filename.toLowerCase();
  if (lowerName.startsWith(".env") || lowerName === "env") {
    return <Lock className={className} style={{ color: "#f59e0b" }} />;
  }

  const match = EXT_MAP[ext];
  if (match) {
    const [Icon, color] = match;
    return <Icon className={className} style={{ color }} />;
  }

  return <File className={className} style={{ color: "#64748b" }} />;
}
