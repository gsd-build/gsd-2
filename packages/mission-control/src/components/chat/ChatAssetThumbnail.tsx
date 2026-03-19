/**
 * ChatAssetThumbnail — inline thumbnail for assets in chat messages.
 *
 * Renders image/video/document previews based on asset type.
 * Images load from /api/assets/file/<name>.
 */
import { FileText } from "lucide-react";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "svg", "webp"];
const VIDEO_EXTS = ["mp4", "webm", "mov"];

interface ChatAssetThumbnailProps {
  assetPath: string;
  assetName: string;
  assetType: string;
}

function getExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function ChatAssetThumbnail({
  assetPath,
  assetName,
  assetType,
}: ChatAssetThumbnailProps) {
  const ext = getExtension(assetName);
  const isImage = IMAGE_EXTS.includes(ext);
  const isVideo = VIDEO_EXTS.includes(ext);

  if (isImage) {
    return (
      <div className="my-1 inline-block">
        <img
          src={`/api/assets/file/${encodeURIComponent(assetName)}`}
          alt={assetName}
          className="max-w-[200px] max-h-[150px] rounded-md object-cover cursor-pointer"
          title={assetPath}
        />
        <div className="text-xs text-slate-500 mt-1 truncate max-w-[200px]">
          {assetName}
        </div>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="my-1 inline-block relative">
        <video
          src={`/api/assets/file/${encodeURIComponent(assetName)}`}
          className="max-w-[200px] max-h-[150px] rounded-md object-cover cursor-pointer"
          title={assetPath}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full bg-navy-900/70 flex items-center justify-center">
            <div className="w-0 h-0 border-l-[8px] border-l-white border-y-[5px] border-y-transparent ml-1" />
          </div>
        </div>
        <div className="text-xs text-slate-500 mt-1 truncate max-w-[200px]">
          {assetName}
        </div>
      </div>
    );
  }

  // Document fallback
  return (
    <div className="my-1 inline-flex items-center gap-2 rounded-md bg-navy-700 px-3 py-2 cursor-pointer">
      <FileText className="h-5 w-5 text-slate-400 flex-shrink-0" />
      <span className="text-sm text-slate-300 truncate max-w-[180px]">
        {assetName}
      </span>
    </div>
  );
}

/**
 * Parse attachment patterns from message content.
 * Matches: [Attached: .planning/assets/<filename>]
 */
export function parseAttachments(
  content: string,
): { assetPath: string; assetName: string; assetType: string }[] {
  const regex = /\[Attached:\s*(.planning\/assets\/([^\]]+))\]/g;
  const results: { assetPath: string; assetName: string; assetType: string }[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const assetPath = match[1];
    const assetName = match[2];
    const ext = getExtension(assetName);
    results.push({ assetPath, assetName, assetType: ext });
  }
  return results;
}

/**
 * Strip attachment patterns from message content for clean display.
 */
export function stripAttachments(content: string): string {
  return content.replace(/\[Attached:\s*.planning\/assets\/[^\]]+\]\n*/g, "").trim();
}
