import { cn } from "@/lib/utils";

interface LoadingLogoProps {
  className?: string;
}

/**
 * GSD terminal icon with a pulse animation for the "initializing" loading state.
 * Uses the official terminal.svg brand asset.
 */
export function LoadingLogo({ className }: LoadingLogoProps) {
  return (
    <img
      src="/assets/terminal.svg"
      alt="Loading"
      className={cn("h-8 w-8 animate-pulse", className)}
    />
  );
}
