type Status = "pending" | "confirmed" | "rejected" | "expired" | "executed";

const BADGE_CONFIG: Record<Status, { label: string; color: string; bg: string; border: string }> = {
  pending:   { label: "PENDING",   color: "var(--accent-yellow)", bg: "rgba(245,200,66,0.08)",  border: "rgba(245,200,66,0.25)"  },
  confirmed: { label: "CONFIRMED", color: "var(--accent-blue)",   bg: "rgba(78,156,245,0.08)",  border: "rgba(78,156,245,0.25)"  },
  executed:  { label: "EXECUTED",  color: "var(--accent-green)",  bg: "rgba(45,206,137,0.08)",  border: "rgba(45,206,137,0.25)"  },
  rejected:  { label: "REJECTED",  color: "var(--accent-red)",    bg: "rgba(245,92,92,0.08)",   border: "rgba(245,92,92,0.25)"   },
  expired:   { label: "EXPIRED",   color: "var(--accent-gray)",   bg: "rgba(90,96,114,0.08)",   border: "rgba(90,96,114,0.2)"    },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = BADGE_CONFIG[status as Status] ?? BADGE_CONFIG.expired;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      padding: "2px 8px",
      borderRadius: "3px",
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      color: cfg.color,
      fontFamily: "'DM Mono', monospace",
      fontSize: "10px",
      fontWeight: 500,
      letterSpacing: "0.08em",
    }}>
      {status === "pending" && (
        <span className="pulse-dot" style={{
          width: "4px", height: "4px", borderRadius: "50%",
          background: cfg.color, display: "inline-block", flexShrink: 0,
        }} />
      )}
      {cfg.label}
    </span>
  );
}
