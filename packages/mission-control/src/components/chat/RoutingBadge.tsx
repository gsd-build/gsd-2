/**
 * RoutingBadge — inline routing transparency banner for Builder mode.
 *
 * Renders below the chat input after a message is sent in Builder mode,
 * showing how the message was routed and offering an Override option.
 *
 * Not rendered for UI_PHASE_GATE intent (PhaseGateCard is shown instead).
 */

export interface RoutingBadgeProps {
  intent: "GSD_COMMAND" | "PHASE_QUESTION" | "GENERAL_CODING";
  originalMessage: string;
  sentAs: string;
  onOverride: () => void;
  onDismiss: () => void;
}

const BADGE_LABELS: Record<RoutingBadgeProps["intent"], string> = {
  GSD_COMMAND: "GSD command",
  PHASE_QUESTION: "Project question",
  GENERAL_CODING: "Coding task",
};

/** Pure render component — no hooks. */
export function RoutingBadge({ intent, sentAs, onOverride, onDismiss }: RoutingBadgeProps) {
  const label = BADGE_LABELS[intent];

  return (
    <div
      role="status"
      aria-label={`Routed as ${label}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        background: "#1A2332",
        border: "1px solid #1E2D3D",
        borderRadius: "6px",
        padding: "4px 10px",
        fontSize: "12px",
        fontFamily: "JetBrains Mono, monospace",
        color: "#64748B",
        margin: "4px 12px",
        flexShrink: 0,
      }}
    >
      <span style={{ color: "#94A3B8" }}>Sent as:</span>
      <span
        style={{
          color: "#5BC8F0",
          fontWeight: 600,
          background: "#0F1419",
          borderRadius: "4px",
          padding: "1px 6px",
          border: "1px solid #1E2D3D",
        }}
      >
        {label}
      </span>
      {sentAs && sentAs !== "" && (
        <span style={{ color: "#475569", fontSize: "11px" }}>
          &middot; {sentAs.length > 40 ? `${sentAs.slice(0, 40)}...` : sentAs}
        </span>
      )}
      <span style={{ flexGrow: 1 }} />
      <button
        type="button"
        onClick={onOverride}
        style={{
          background: "transparent",
          border: "none",
          color: "#5BC8F0",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "12px",
          padding: "0 4px",
          textDecoration: "underline",
        }}
      >
        Override
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss routing badge"
        style={{
          background: "transparent",
          border: "none",
          color: "#475569",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "14px",
          padding: "0 2px",
          lineHeight: 1,
        }}
      >
        &times;
      </button>
    </div>
  );
}
