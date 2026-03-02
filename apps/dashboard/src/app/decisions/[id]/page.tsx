import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { decisions, eq } from "@symposium/db";
import { StatusBadge } from "@/components/status-badge";
import type { PersonaVote } from "@symposium/shared-types";

export const dynamic = "force-dynamic";

async function getDecision(id: string) {
  const db = getDb();
  const [row] = await db.select().from(decisions).where(eq(decisions.id, id));
  return row ?? null;
}

const ACTION_COLORS: Record<string, string> = {
  BUY:  "var(--accent-blue)",
  SELL: "var(--accent-red)",
  HOLD: "var(--text-secondary)",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'DM Mono', monospace",
      fontSize: "9px",
      fontWeight: 500,
      letterSpacing: "0.15em",
      color: "var(--text-muted)",
      textTransform: "uppercase",
      marginBottom: "10px",
      paddingBottom: "8px",
      borderBottom: "1px solid var(--border)",
    }}>
      {children}
    </div>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--bg-panel)",
      border: "1px solid var(--border)",
      borderRadius: "6px",
      padding: "16px",
      ...style,
    }}>
      {children}
    </div>
  );
}

export default async function DecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await getDecision(id);
  if (!d) notFound();

  const votes = (d.personaVotes ?? []) as PersonaVote[];
  const reasons = d.reasons as Record<string, string | string[]> | null;
  const risks = (d.risks ?? []) as string[];
  const macro = d.macroContext as Record<string, unknown> | null;

  return (
    <div className="fade-in-up" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Top header ── */}
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "16px",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "22px",
              fontWeight: 600,
              color: ACTION_COLORS[d.action] ?? "var(--text-primary)",
              letterSpacing: "0.02em",
            }}>
              {d.action}
            </span>
            <span style={{ fontSize: "22px", fontWeight: 600, color: "var(--text-primary)" }}>
              {d.ticker}
            </span>
            <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              {d.name}
            </span>
          </div>
          <div className="mono" style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", gap: "16px" }}>
            <span>{d.quantity.toLocaleString()} shares</span>
            <span>@ {Number(d.price) === 0 ? "MKT" : `₩${Number(d.price).toLocaleString()}`}</span>
            <span>conf. {d.confidence}%</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <StatusBadge status={d.status} />
          {d.status === "pending" && (
            <Link href={`/decisions/${d.id}/confirm`} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 16px",
              background: "rgba(245,200,66,0.1)",
              border: "1px solid rgba(245,200,66,0.35)",
              borderRadius: "4px",
              fontFamily: "'DM Mono', monospace",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--accent-yellow)",
              textDecoration: "none",
              transition: "all 0.15s",
            }}>
              CONFIRM →
            </Link>
          )}
        </div>
      </div>

      {/* ── Persona votes ── */}
      {votes.length > 0 && (
        <Panel>
          <SectionLabel>PERSONA VOTES</SectionLabel>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["PERSONA", "VOTE", "CONFIDENCE", "WEIGHT", "KEY ARGUMENT"].map((h) => (
                    <th key={h} style={{
                      textAlign: "left",
                      padding: "6px 12px",
                      fontFamily: "'DM Mono', monospace",
                      fontSize: "9px",
                      letterSpacing: "0.12em",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      borderBottom: "1px solid var(--border)",
                      fontWeight: 400,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {votes.map((v, i) => (
                  <tr key={v.persona} style={{ borderBottom: i < votes.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                    <td style={{ padding: "10px 12px", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", textTransform: "capitalize" }}>
                      {v.persona}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span className="mono" style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: ACTION_COLORS[v.action] ?? "var(--text-secondary)",
                        letterSpacing: "0.08em",
                      }}>
                        {v.action}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "40px", height: "2px", background: "var(--border)", borderRadius: "1px", overflow: "hidden" }}>
                          <div style={{
                            width: `${v.confidence}%`, height: "100%",
                            background: v.confidence >= 75 ? "var(--accent-green)" : v.confidence >= 50 ? "var(--accent-yellow)" : "var(--accent-red)",
                          }} />
                        </div>
                        <span className="mono" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{v.confidence}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span className="mono" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        {(v.weight * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--text-secondary)", maxWidth: "380px" }}>
                      {v.keyArgument}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ── Debate summary ── */}
      {d.debateSummary && (
        <Panel>
          <SectionLabel>DEBATE SUMMARY</SectionLabel>
          <p style={{ fontSize: "13px", lineHeight: 1.7, color: "var(--text-secondary)", whiteSpace: "pre-wrap", margin: 0 }}>
            {d.debateSummary}
          </p>
        </Panel>
      )}

      {/* ── Reasons grid ── */}
      {reasons && (
        <div>
          <SectionLabel>ANALYSIS</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
            {(["technical", "fundamental", "sentiment", "macro"] as const).map((key) => {
              const val = reasons[key];
              if (!val) return null;
              const lines = Array.isArray(val) ? val : [val as string];
              return (
                <Panel key={key} style={{ padding: "14px" }}>
                  <div style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "9px",
                    letterSpacing: "0.15em",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    marginBottom: "10px",
                  }}>
                    {key}
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "5px" }}>
                    {lines.map((line, i) => (
                      <li key={i} style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", gap: "6px" }}>
                        <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>·</span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </Panel>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Risks ── */}
      {risks.length > 0 && (
        <Panel>
          <SectionLabel>RISK FACTORS</SectionLabel>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
            {risks.map((r, i) => (
              <li key={i} style={{ display: "flex", gap: "10px", fontSize: "12px", alignItems: "flex-start" }}>
                <span style={{ color: "var(--accent-red)", flexShrink: 0, fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>▲</span>
                <span style={{ color: "var(--text-secondary)" }}>{r}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* ── Macro context ── */}
      {macro && Object.keys(macro).length > 0 && (
        <Panel>
          <SectionLabel>MACRO CONTEXT</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px" }}>
            {Object.entries(macro).map(([k, v]) => (
              <div key={k}>
                <div style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "9px",
                  letterSpacing: "0.12em",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  marginBottom: "3px",
                }}>
                  {k}
                </div>
                <div className="mono" style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                  {String(v)}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ── Meta ── */}
      <div className="mono" style={{ display: "flex", gap: "24px", fontSize: "10px", color: "var(--text-muted)", flexWrap: "wrap" }}>
        <span>CREATED {new Date(d.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
        <span>EXPIRES {new Date(d.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
        {d.confirmedAt && <span>CONFIRMED {new Date(d.confirmedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>}
        {d.executedAt  && <span>EXECUTED {new Date(d.executedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>}
      </div>
    </div>
  );
}
