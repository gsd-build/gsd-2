import { useEffect } from "react";
import { cn } from "@/lib/utils";

export interface LogoAnimationProps {
  className?: string;
  onComplete?: () => void;
  size?: "sm" | "lg";
}

const SIZE_CLASSES = {
  sm: "h-8 w-8",
  lg: "h-16 w-16",
} as const;

/**
 * Pure render function for the animated logo SVG.
 * Exported for direct-call testing (no hooks).
 */
export function LogoAnimationView({
  className,
  size = "lg",
}: Omit<LogoAnimationProps, "onComplete">) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(SIZE_CLASSES[size], className)}
      aria-label="GSD Logo Animation"
    >
      {/* Terminal window frame */}
      <g className="logo-anim-frame">
        <rect x="2" y="4" width="28" height="24" rx="2" opacity="0.15" />
      </g>
      {/* Title bar */}
      <g className="logo-anim-titlebar">
        <rect x="2" y="4" width="28" height="4" />
      </g>
      {/* Title bar dots */}
      <g className="logo-anim-dots">
        <rect x="4" y="5" width="2" height="2" fill="currentColor" opacity="0.4" />
        <rect x="8" y="5" width="2" height="2" fill="currentColor" opacity="0.4" />
      </g>
      {/* Prompt chevron > */}
      <g className="logo-anim-chevron">
        <rect x="6" y="12" width="4" height="4" />
        <rect x="10" y="16" width="4" height="4" />
        <rect x="6" y="20" width="4" height="4" />
      </g>
      {/* Cursor block */}
      <g className="logo-anim-cursor">
        <rect x="18" y="14" width="4" height="4" opacity="0.8" />
        <rect x="22" y="14" width="4" height="4" opacity="0.5" />
      </g>
    </svg>
  );
}

/**
 * Animated GSD logo with sequential rect reveals over 600ms.
 * Each rect group fades in with scale using CSS animation classes.
 * Fires onComplete after the full 600ms build sequence.
 */
export function LogoAnimation({
  className,
  onComplete,
  size = "lg",
}: LogoAnimationProps) {
  useEffect(() => {
    if (!onComplete) return;
    const timer = setTimeout(onComplete, 600);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return <LogoAnimationView className={className} size={size} />;
}
