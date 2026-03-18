"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import { Loader2 } from "lucide-react"
import { createTheme } from "@uiw/codemirror-themes"
import { tags as t } from "@lezer/highlight"
import { loadLanguage, type LanguageName } from "@uiw/codemirror-extensions-langs"
import { EditorView } from "@codemirror/view"
import { cn } from "@/lib/utils"

/* ── Dynamic import (no SSR — CodeMirror needs browser DOM) ── */

const ReactCodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[120px] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

/* ── Monochrome syntax highlighting styles ── */

const darkStyles = [
  { tag: [t.comment, t.lineComment, t.blockComment], color: "oklch(0.45 0 0)" },
  { tag: [t.keyword, t.operator], color: "oklch(0.75 0 0)" },
  { tag: [t.string, t.special(t.string)], color: "oklch(0.65 0 0)" },
  { tag: [t.number, t.bool, t.null], color: "oklch(0.7 0 0)" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "oklch(0.85 0 0)" },
  { tag: [t.typeName, t.className], color: "oklch(0.8 0 0)" },
  { tag: [t.bracket], color: "oklch(0.5 0 0)" },
]

const lightStyles = [
  { tag: [t.comment, t.lineComment, t.blockComment], color: "oklch(0.55 0 0)" },
  { tag: [t.keyword, t.operator], color: "oklch(0.25 0 0)" },
  { tag: [t.string, t.special(t.string)], color: "oklch(0.35 0 0)" },
  { tag: [t.number, t.bool, t.null], color: "oklch(0.3 0 0)" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "oklch(0.15 0 0)" },
  { tag: [t.typeName, t.className], color: "oklch(0.2 0 0)" },
  { tag: [t.bracket], color: "oklch(0.5 0 0)" },
]

/* ── Static theme objects (module-level, never recreated on render) ── */

const darkTheme = createTheme({
  theme: "dark",
  settings: {
    background: "oklch(0.09 0 0)",
    foreground: "oklch(0.9 0 0)",
    caret: "oklch(0.9 0 0)",
    selection: "oklch(0.2 0 0)",
    lineHighlight: "oklch(0.12 0 0)",
    gutterBackground: "oklch(0.09 0 0)",
    gutterForeground: "oklch(0.35 0 0)",
    gutterBorder: "transparent",
  },
  styles: darkStyles,
})

const lightTheme = createTheme({
  theme: "light",
  settings: {
    background: "oklch(0.98 0 0)",
    foreground: "oklch(0.15 0 0)",
    caret: "oklch(0.15 0 0)",
    selection: "oklch(0.9 0 0)",
    lineHighlight: "oklch(0.96 0 0)",
    gutterBackground: "oklch(0.98 0 0)",
    gutterForeground: "oklch(0.55 0 0)",
    gutterBorder: "transparent",
  },
  styles: lightStyles,
})

/* ── Language mapping (shiki lang names → CodeMirror loadLanguage names) ── */

const CM_LANG_MAP: Record<string, LanguageName | null> = {
  // TypeScript / JavaScript family
  typescript: "ts",
  tsx: "tsx",
  javascript: "js",
  jsx: "jsx",
  // Shell variants
  bash: "bash",
  sh: "sh",
  zsh: "sh",
  // Data formats
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  toml: "toml",
  // Markup
  markdown: "markdown",
  mdx: "markdown", // CM has no mdx — use markdown
  html: "html",
  xml: "xml",
  // Styles
  css: "css",
  scss: "scss",
  less: "less",
  // Systems
  python: "py",
  ruby: "rb",
  rust: "rs",
  go: "go",
  java: "java",
  kotlin: "kt",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  // Other
  php: "php",
  sql: "sql",
  graphql: null, // CM has no graphql support
  dockerfile: null, // CM has no dockerfile support
  makefile: null, // CM has no makefile support
  lua: "lua",
  r: "r",
  latex: "tex",
  diff: "diff",
  // No CM equivalent → plain text
  viml: null,
  dotenv: null,
  fish: null,
  ini: "ini",
}

/* ── Component ── */

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language: string | null
  fontSize: number
  className?: string
}

export function CodeEditor({
  value,
  onChange,
  language,
  fontSize,
  className,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme !== "light" ? darkTheme : lightTheme

  // Resolve and cache language extension
  const langExtension = useMemo(() => {
    if (!language) return null
    const cmName = CM_LANG_MAP[language]
    if (cmName === undefined || cmName === null) return null
    return loadLanguage(cmName)
  }, [language])

  // Font size extension
  const fontSizeExt = useMemo(
    () =>
      EditorView.theme({
        "&": { fontSize: `${fontSize}px` },
        ".cm-gutters": { fontSize: `${fontSize}px` },
      }),
    [fontSize],
  )

  // Combined extensions (memoized to avoid re-initialization)
  const extensions = useMemo(() => {
    const exts = [fontSizeExt]
    if (langExtension) exts.push(langExtension)
    return exts
  }, [fontSizeExt, langExtension])

  return (
    <ReactCodeMirror
      value={value}
      onChange={onChange}
      theme={theme}
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        foldGutter: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false,
        tabSize: 2,
      }}
      className={cn("overflow-hidden rounded-md border", className)}
    />
  )
}
