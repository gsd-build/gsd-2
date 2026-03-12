import { cn } from "@/lib/utils";

interface LoadingLogoProps {
  className?: string;
}

/**
 * GSD logo at 50% opacity with a horizontal scan line that
 * continuously translates across at 200ms. Used for the
 * "initializing" loading state.
 */
export function LoadingLogo({ className }: LoadingLogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
      aria-label="GSD Loading"
    >
      {/* Logo at 50% opacity */}
      <g opacity="0.5">
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
      </g>
      {/* Scan line overlay */}
      <rect
        className="logo-scan-line"
        x="0"
        y="4"
        width="4"
        height="24"
        fill="currentColor"
        opacity="0.3"
      />
    </svg>
  );
}
