import { getDb } from "@/lib/db";
import { decisions, holdings, desc } from "@symposium/db";
import { DecisionList } from "./decision-list";

export const dynamic = "force-dynamic";

async function getInitialDecisions() {
  const db = getDb();
  return db
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
      createdAt: decisions.createdAt,
    })
    .from(decisions)
    .orderBy(desc(decisions.createdAt))
    .limit(30);
}

async function getHoldingRows() {
  const db = getDb();
  return db.select().from(holdings).orderBy(desc(holdings.updatedAt));
}

export default async function HomePage() {
  const [initialDecisions, holdingRows] = await Promise.all([
    getInitialDecisions(),
    getHoldingRows(),
  ]);

  const serialized = initialDecisions.map((d) => ({
    ...d,
    expiresAt: d.expiresAt.toISOString(),
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* ── Decisions ── */}
      <DecisionList initialData={serialized} />

      {/* ── Holdings ── */}
      {holdingRows.length > 0 && (
        <div>
          <div style={{ marginBottom: "12px" }}>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.12em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}>
              PORTFOLIO
            </span>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "1px",
            background: "var(--border)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            overflow: "hidden",
          }}>
            {holdingRows.map((h) => (
              <div key={h.id} className="holding-card" style={{ padding: "16px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                  {h.ticker}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px" }}>
                  {h.name}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em", marginBottom: "2px" }}>QTY</div>
                    <div className="mono" style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {h.quantity.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em", marginBottom: "2px" }}>AVG</div>
                    <div className="mono" style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                      {Number(h.avgPrice).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
