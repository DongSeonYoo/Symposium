import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { decisions, eq } from "@symposium/db";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmPanel } from "./confirm-panel";

export const dynamic = "force-dynamic";

async function getDecision(id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: decisions.id,
      ticker: decisions.ticker,
      name: decisions.name,
      action: decisions.action,
      quantity: decisions.quantity,
      price: decisions.price,
      confidence: decisions.confidence,
      status: decisions.status,
      expiresAt: decisions.expiresAt,
    })
    .from(decisions)
    .where(eq(decisions.id, id));
  return row ?? null;
}

const ACTION_COLORS: Record<string, string> = {
  BUY:  "var(--accent-blue)",
  SELL: "var(--accent-red)",
  HOLD: "var(--text-secondary)",
};

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await getDecision(id);
  if (!d) notFound();

  const isPending = d.status === "pending";

  return (
    <div className="fade-in-up" style={{ maxWidth: "480px", margin: "0 auto" }}>
      {/* Back link */}
      <a href={`/decisions/${d.id}`} style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: "'DM Mono', monospace",
        fontSize: "10px",
        letterSpacing: "0.1em",
        color: "var(--text-muted)",
        textDecoration: "none",
        textTransform: "uppercase",
        marginBottom: "24px",
        transition: "color 0.15s",
      }}>
        ← BACK
      </a>

      {/* Decision summary card */}
      <div style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "20px",
        marginBottom: "16px",
      }}>
        {/* Header */}
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "9px",
          letterSpacing: "0.15em",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          marginBottom: "16px",
          paddingBottom: "10px",
          borderBottom: "1px solid var(--border)",
        }}>
          DECISION SUMMARY
        </div>

        {/* Ticker + action */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "20px",
            fontWeight: 700,
            color: ACTION_COLORS[d.action] ?? "var(--text-primary)",
            letterSpacing: "0.04em",
          }}>
            {d.action}
          </span>
          <span style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)" }}>
            {d.ticker}
          </span>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            {d.name}
          </span>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
          {[
            { label: "QUANTITY",   value: `${d.quantity.toLocaleString()} shares` },
            { label: "PRICE",      value: Number(d.price) === 0 ? "MKT" : `₩${Number(d.price).toLocaleString()}` },
            { label: "CONFIDENCE", value: `${d.confidence}%` },
          ].map((item) => (
            <div key={item.label}>
              <div style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "8px",
                letterSpacing: "0.14em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}>
                {item.label}
              </div>
              <div className="mono" style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Status */}
        <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
          <StatusBadge status={d.status} />
        </div>
      </div>

      {/* Action panel */}
      {isPending ? (
        <ConfirmPanel
          decisionId={d.id}
          expiresAt={d.expiresAt.toISOString()}
        />
      ) : (
        <div style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          padding: "24px",
          textAlign: "center",
          fontFamily: "'DM Mono', monospace",
          fontSize: "11px",
          letterSpacing: "0.1em",
          color: "var(--text-muted)",
          textTransform: "uppercase",
        }}>
          DECISION ALREADY PROCESSED
        </div>
      )}
    </div>
  );
}
