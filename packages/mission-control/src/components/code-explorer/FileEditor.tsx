/**
 * FileEditor — simple textarea-based editor for Code Explorer.
 * Replaces CodeMirror to eliminate silent EditorState.create() failures
 * and Rules of Hooks violations. All hooks run unconditionally before guards.
 */
import { useCallback } from "react";

interface FileEditorProps {
  content: string;
  filePath: string;
  onChange: (content: string) => void;
  onSave: () => void;
}

/** Returns true if the content appears to be binary (contains null bytes). */
function isBinaryContent(content: string): boolean {
  return content.slice(0, 8192).includes("\0");
}

const MAX_FILE_SIZE = 500_000; // 500KB

export function FileEditor({ content, filePath: _filePath, onChange, onSave }: FileEditorProps) {
  // All hooks unconditionally before any early returns
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSave();
      }
    },
    [onSave],
  );

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
    <textarea
      className="w-full h-full bg-[#1a2332] text-slate-200 font-mono text-[13px] p-4 resize-none outline-none border-none leading-relaxed"
      value={content}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      spellCheck={false}
    />
  );
}
