import { cn } from "@/lib/utils";

interface GsdLogoProps {
  className?: string;
}

/**
 * Pixel-art style GSD logo rendered as inline SVG.
 * Uses currentColor for all fills so parent can set color via text-* classes.
 * Design: stylized terminal/command-prompt icon on a 32x32 grid with 4px cells.
 */
export function GsdLogo({ className }: GsdLogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
      aria-label="GSD Logo"
    >
      {/* Terminal window frame */}
      <rect x="2" y="4" width="28" height="24" rx="2" opacity="0.15" />
      {/* Title bar */}
      <rect x="2" y="4" width="28" height="4" />
      {/* Title bar dots */}
      <rect x="4" y="5" width="2" height="2" fill="currentColor" opacity="0.4" />
      <rect x="8" y="5" width="2" height="2" fill="currentColor" opacity="0.4" />
      {/* Prompt chevron > */}
      <rect x="6" y="12" width="4" height="4" />
      <rect x="10" y="16" width="4" height="4" />
      <rect x="6" y="20" width="4" height="4" />
      {/* Cursor block */}
      <rect x="18" y="14" width="4" height="4" opacity="0.8" />
      <rect x="22" y="14" width="4" height="4" opacity="0.5" />
    </svg>
  );
}
