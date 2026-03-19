/**
 * PhaseTransitionCard — inline divider rendered when a phase_transition event arrives.
 *
 * Renders a horizontal rule with the phase name centered, using amber accent color.
 * Design: Share Tech Mono font, amber (#F59E0B) phase name, navy divider lines.
 */

interface PhaseTransitionCardProps {
  phase: string;
}

export function PhaseTransitionCard({ phase }: PhaseTransitionCardProps) {
  return (
    <div className="my-3 flex items-center gap-2 px-4">
      <div className="h-px flex-1" style={{ backgroundColor: "#1E2D3D" }} />
      <span
        className="font-display text-[10px] uppercase tracking-widest"
        style={{ color: "#F59E0B" }}
      >
        ◆ {phase}
      </span>
      <div className="h-px flex-1" style={{ backgroundColor: "#1E2D3D" }} />
    </div>
  );
}
