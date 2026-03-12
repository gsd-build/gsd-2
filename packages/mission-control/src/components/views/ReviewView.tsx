/**
 * ReviewView — full-panel review mode experience.
 *
 * ReviewView: pure render function (no hooks) — testable directly via function call.
 *   Accepts optional animatedScores/openPillars for animation wrapper integration.
 *   Falls back to actual scores and all-closed state for direct test use.
 *
 * ReviewViewWithAnimation: stateful wrapper owning accordion state and count-up animation.
 */
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewResults, FixAction, PillarScore } from "@/server/chat-types";

// -- Score color lookup (follows BUDGET_COLORS pattern) --

const SCORE_COLORS = {
  green: { bar: "bg-status-success", text: "text-status-success" },
  amber: { bar: "bg-status-warning", text: "text-status-warning" },
  red: { bar: "bg-status-error", text: "text-status-error" },
} as const;

function getScoreColor(score: number): keyof typeof SCORE_COLORS {
  if (score >= 8.0) return "green";
  if (score >= 5.0) return "amber";
  return "red";
}

// -- FixCard sub-component (pure, no hooks) --

interface FixCardProps {
  fix: FixAction;
  onFix: (msg: string) => void;
}

function FixCard({ fix, onFix }: FixCardProps) {
  const badgeColors: Record<number, string> = {
    1: "bg-status-error/20 text-status-error border-status-error/30",
    2: "bg-status-warning/20 text-status-warning border-status-warning/30",
    3: "bg-navy-700 text-slate-400 border-navy-600",
  };
  const badgeClass = badgeColors[fix.priority] ?? badgeColors[3];

  return (
    <div className="rounded-md border border-navy-600 bg-navy-800 p-3 flex items-start gap-3">
      <span
        className={cn(
          "inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-mono font-bold shrink-0 mt-0.5",
          badgeClass
        )}
      >
        #{fix.priority}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300">{fix.description}</p>
        <p className="text-xs text-slate-500 mt-0.5">{fix.pillar}</p>
      </div>
      <button
        type="button"
        onClick={() => onFix(fix.draftMessage)}
        className="rounded-md bg-cyan-accent px-3 py-1.5 text-xs font-mono text-navy-base font-bold hover:bg-cyan-accent/90 shrink-0"
      >
        Fix
      </button>
    </div>
  );
}

// -- PillarRow sub-component (pure) --

interface PillarRowProps {
  pillar: PillarScore;
  animatedScore: number;
  isOpen: boolean;
  onToggle: () => void;
}

function PillarRow({ pillar, animatedScore, isOpen, onToggle }: PillarRowProps) {
  const color = getScoreColor(pillar.score);
  const displayScore = Math.round(animatedScore * 10) / 10;

  return (
    <div className="border-b border-navy-600">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 p-4 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-navy-800"
      >
        <span className="flex-1">{pillar.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          {/* Score bar */}
          <div className="w-20 h-1.5 rounded-full bg-navy-700 overflow-hidden">
            <div
              className={cn("h-1.5 rounded-full transition-all", SCORE_COLORS[color].bar)}
              style={{ width: `${(animatedScore / 10) * 100}%` }}
            />
          </div>
          {/* Score number */}
          <span className={cn("text-xs font-mono w-8 text-right tabular-nums", SCORE_COLORS[color].text)}>
            {displayScore.toFixed(1)}
          </span>
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
      </button>
      {isOpen && pillar.findings.length > 0 && (
        <ul className="px-4 pb-4 space-y-1.5">
          {pillar.findings.map((finding, i) => (
            <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
              <span className="text-slate-600 shrink-0">•</span>
              <span>{finding}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// -- ReviewView: pure render (no hooks) --

interface ReviewViewProps {
  results: ReviewResults;
  onDismiss: () => void;
  onFix: (draftMessage: string) => void;
  /** Animated score values per pillar name. Defaults to actual scores when not provided. */
  animatedScores?: Record<string, number>;
  /** Open state per pillar name. Defaults to all closed when not provided. */
  openPillars?: Record<string, boolean>;
  /** Toggle callback for pillar accordion rows. No-op when not provided. */
  onTogglePillar?: (name: string) => void;
}

/** Pure render — no hooks. Testable via direct function call. */
export function ReviewView({
  results,
  onDismiss,
  onFix,
  animatedScores,
  openPillars,
  onTogglePillar,
}: ReviewViewProps) {
  // Fall back to actual scores and all-closed when called without animation wrapper
  const scores = animatedScores ?? Object.fromEntries(results.pillars.map((p) => [p.name, p.score]));
  const open = openPillars ?? {};
  const handleToggle = onTogglePillar ?? (() => {});

  return (
    <div className="flex flex-col h-full bg-navy-900">
      {/* Fixed header */}
      <div className="border-b border-navy-600 p-4 flex items-center gap-2 shrink-0">
        <h1 className="text-lg font-display text-slate-200 flex-1">UI Review Results</h1>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1.5 text-slate-500 hover:text-slate-300 hover:bg-navy-800 transition-colors"
          aria-label="Dismiss review"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable pillar list + fix cards */}
      <div className="flex-1 overflow-y-auto">
        {/* Pillar score accordion rows */}
        <div className="border-b border-navy-700">
          {results.pillars.map((pillar) => (
            <PillarRow
              key={pillar.name}
              pillar={pillar}
              animatedScore={scores[pillar.name] ?? pillar.score}
              isOpen={open[pillar.name] ?? false}
              onToggle={() => handleToggle(pillar.name)}
            />
          ))}
        </div>

        {/* Top 3 Priority Fixes */}
        {results.topFixes.length > 0 && (
          <div className="p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
              Top 3 Priority Fixes
            </h3>
            {results.topFixes.map((fix) => (
              <FixCard key={fix.priority} fix={fix} onFix={onFix} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// -- ReviewViewWithAnimation: stateful wrapper with count-up + accordion --

interface ReviewViewWithAnimationProps {
  results: ReviewResults;
  onDismiss: () => void;
  onFix: (msg: string) => void;
}

export function ReviewViewWithAnimation({ results, onDismiss, onFix }: ReviewViewWithAnimationProps) {
  const [openPillars, setOpenPillars] = useState<Record<string, boolean>>({});
  const [animatedScores, setAnimatedScores] = useState<Record<string, number>>(
    Object.fromEntries(results.pillars.map((p) => [p.name, 0]))
  );

  useEffect(() => {
    const duration = 600;
    const start = performance.now();
    const targets = Object.fromEntries(results.pillars.map((p) => [p.name, p.score]));

    const frame = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setAnimatedScores(
        Object.fromEntries(
          Object.entries(targets).map(([name, target]) => [
            name,
            Math.round(progress * target * 10) / 10,
          ])
        )
      );
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, []); // runs once on mount

  const handleToggle = (name: string) =>
    setOpenPillars((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <ReviewView
      results={results}
      animatedScores={animatedScores}
      openPillars={openPillars}
      onTogglePillar={handleToggle}
      onDismiss={onDismiss}
      onFix={onFix}
    />
  );
}
