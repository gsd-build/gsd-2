/**
 * InlineReadPanel — modal overlay for displaying file content
 * when view_plan / view_task / view_diff / view_uat_results is triggered.
 */
import { X } from "lucide-react";
import { marked } from "marked";

interface InlineReadPanelProps {
  isOpen: boolean;
  title: string;
  content: string;
  isLoading: boolean;
  onClose: () => void;
}

export function InlineReadPanel({ isOpen, title, content, isLoading, onClose }: InlineReadPanelProps) {
  if (!isOpen) return null;

  const html = marked(content, { async: false }) as string;

  return (
    <div
      data-testid="inline-read-panel"
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col rounded-lg overflow-hidden"
        style={{ width: "80vw", height: "80vh", background: "#131A21", border: "1px solid #2D3B4E" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between shrink-0 px-4"
          style={{ height: "44px", borderBottom: "1px solid #2D3B4E", background: "#0F1419" }}
        >
          <span className="font-mono text-sm text-slate-200 font-bold">{title}</span>
          <button
            aria-label="Close"
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded text-slate-400 transition-colors hover:bg-navy-700 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <span className="font-mono text-xs text-slate-500">Loading...</span>
          ) : (
            <div
              className="prose prose-invert prose-sm max-w-none
                prose-headings:text-slate-100 prose-headings:font-semibold
                prose-p:text-slate-300 prose-p:leading-relaxed
                prose-a:text-[#5BC8F0] prose-a:no-underline hover:prose-a:underline
                prose-strong:text-slate-200
                prose-code:text-[#5BC8F0] prose-code:bg-[#0D1520] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-[#0D1520] prose-pre:border prose-pre:border-[#2D3B4E] prose-pre:text-xs
                prose-li:text-slate-300
                prose-hr:border-[#2D3B4E]
                prose-blockquote:border-l-[#5BC8F0] prose-blockquote:text-slate-400"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
