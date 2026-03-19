import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  className?: string;
  barClassName?: string;
}

export function ProgressBar({ value, className, barClassName }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("h-1.5 w-full rounded-full bg-navy-700", className)}>
      <div
        className={cn(
          "h-full rounded-full bg-cyan-accent transition-all duration-300",
          barClassName,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
