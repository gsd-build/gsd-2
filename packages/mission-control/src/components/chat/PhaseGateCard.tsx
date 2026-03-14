/**
 * PhaseGateCard — inline intercept card for UI_PHASE_GATE intent.
 *
 * Shown instead of sending the message when the classifier determines
 * the user wants to build something visual but no design context exists.
 * Offers two paths: set up the design (preferred) or skip and proceed anyway.
 */

export interface PhaseGateCardProps {
  onSetupDesign: () => void;
  onSkip: () => void;
  originalMessage: string;
}

/** Pure render component — no hooks. */
export function PhaseGateCard({ onSetupDesign, onSkip }: PhaseGateCardProps) {
  return (
    <div
      role="dialog"
      aria-label="Phase gate: design setup recommended"
      style={{
        background: "#131C2B",
        border: "1px solid rgba(30, 45, 61, 0.6)",
        borderRadius: "12px",
        padding: "24px",
        margin: "16px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      }}
    >
      <p
        style={{
          margin: "0 0 8px 0",
          fontWeight: 700,
          color: "#F1F5F9",
          fontSize: "15px",
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        One step first
      </p>
      <p
        style={{
          margin: "0 0 20px 0",
          color: "#CBD5E1",
          fontSize: "14px",
          lineHeight: 1.6,
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        You want to build something visual. Setting up the design first makes everything smoother.
      </p>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onSetupDesign}
          style={{
            background: "#5BC8F0",
            color: "#0F1419",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
            fontWeight: 700,
            fontSize: "13px",
            fontFamily: "JetBrains Mono, monospace",
            cursor: "pointer",
          }}
        >
          Set up the design
        </button>
        <button
          type="button"
          onClick={onSkip}
          style={{
            background: "transparent",
            color: "#94A3B8",
            border: "1px solid #1E2D3D",
            borderRadius: "6px",
            padding: "8px 16px",
            fontSize: "13px",
            fontFamily: "JetBrains Mono, monospace",
            cursor: "pointer",
          }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
