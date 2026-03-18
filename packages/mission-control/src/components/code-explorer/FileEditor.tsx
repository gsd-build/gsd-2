/**
 * FileEditor — CodeMirror 6 editor with full syntax highlighting, line numbers,
 * active-line borders, and VS Code dark theme.
 *
 * Languages: TS/TSX, JS/JSX, CSS/SCSS/SASS, JSON, Python, Markdown,
 *            HTML, XML, SQL, Rust, Java, C/C++, YAML, Go, Shell (plain)
 */
import { useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { basicSetup } from "@codemirror/basic-setup";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { xml } from "@codemirror/lang-xml";
import { sql } from "@codemirror/lang-sql";
import { rust } from "@codemirror/lang-rust";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { yaml } from "@codemirror/lang-yaml";
import { go } from "@codemirror/lang-go";

interface FileEditorProps {
  content: string;
  filePath: string;
  onChange: (content: string) => void;
  onSave: () => void;
}

function isBinaryContent(content: string): boolean {
  return content.slice(0, 8192).includes("\0");
}

const MAX_FILE_SIZE = 500000; // 500KB

function getLanguageExtension(filePath: string) {
  const ext = filePath.replace(/\\/g, "/").split("/").pop()?.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return javascript({ jsx: true });
    case "css":
    case "scss":
    case "sass":
      return css();
    case "json":
    case "jsonc":
      return json();
    case "py":
    case "pyw":
      return python();
    case "md":
    case "markdown":
    case "mdx":
      return markdown();
    case "html":
    case "htm":
    case "svelte":
    case "vue":
      return html();
    case "xml":
    case "svg":
    case "xaml":
      return xml();
    case "sql":
      return sql();
    case "rs":
      return rust();
    case "java":
      return java();
    case "c":
    case "cpp":
    case "cc":
    case "cxx":
    case "h":
    case "hpp":
      return cpp();
    case "yaml":
    case "yml":
      return yaml();
    case "go":
      return go();
    default:
      return null;
  }
}

const vsCodeTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": {
    fontFamily: "'JetBrains Mono', 'Share Tech Mono', monospace",
    lineHeight: "1.6",
  },
  ".cm-activeLine": {
    borderTop: "1px solid rgba(255,255,255,0.07)",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.03) !important",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#5BC8F0",
  },
  ".cm-gutters": {
    borderRight: "1px solid #1E2D3D",
    backgroundColor: "#0F1419",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    color: "#3D5166",
    paddingRight: "12px",
  },
  ".cm-cursor": { borderLeftColor: "#5BC8F0" },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(91,200,240,0.2) !important",
  },
});

export function FileEditor({ content, filePath, onChange, onSave }: FileEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSaveRef = useRef(onSave);
  const onChangeRef = useRef(onChange);
  const isExternalUpdate = useRef(false);
  const langCompartment = useRef(new Compartment());

  onSaveRef.current = onSave;
  onChangeRef.current = onChange;

  // Build editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = getLanguageExtension(filePath);

    const saveKeymap = keymap.of([
      { key: "Ctrl-s", mac: "Mod-s", run: () => { onSaveRef.current(); return true; } },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalUpdate.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        highlightActiveLine(),
        highlightActiveLineGutter(),
        saveKeymap,
        oneDark,
        vsCodeTheme,
        langCompartment.current.of(langExt ?? []),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap language when file changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const langExt = getLanguageExtension(filePath);
    view.dispatch({ effects: langCompartment.current.reconfigure(langExt ?? []) });
  }, [filePath]);

  // Sync external content → editor (file switch)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc === content) return;
    isExternalUpdate.current = true;
    view.dispatch({ changes: { from: 0, to: currentDoc.length, insert: content } });
    isExternalUpdate.current = false;
  }, [content]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      onSaveRef.current();
    }
  }, []);

  if (isBinaryContent(content)) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        Binary file — cannot display
      </div>
    );
  }
  if (content.length > MAX_FILE_SIZE) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        File too large to display ({Math.round(content.length / 1024)}KB)
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-auto"
      onKeyDown={handleKeyDown}
    />
  );
}
