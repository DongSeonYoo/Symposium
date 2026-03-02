"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Countdown } from "@/components/countdown";

interface DecisionRow {
  id: string;
  ticker: string;
  name: string;
  action: string;
  quantity: number;
  price: string;
  confidence: number;
  status: string;
  expiresAt: string;
  createdAt: string;
}

async function fetchDecisions(): Promise<DecisionRow[]> {
  const res = await fetch("/api/decisions", { cache: "no-store" });
  if (!res.ok) throw new Error("판단 목록 조회 실패");
  return res.json() as Promise<DecisionRow[]>;
}

function ActionPill({ action }: { action: string }) {
  const cls =
    action === "BUY"  ? "pill-buy"  :
    action === "SELL" ? "pill-sell" : "pill-hold";
  return (
    <span className={`mono ${cls}`} style={{
      padding: "1px 7px",
      borderRadius: "3px",
      fontSize: "11px",
      fontWeight: 600,
      letterSpacing: "0.08em",
    }}>
      {action}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 75 ? "var(--accent-green)" :
    value >= 50 ? "var(--accent-yellow)" : "var(--accent-red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{
        width: "48px", height: "3px",
        background: "var(--border)",
        borderRadius: "2px",
        overflow: "hidden",
      }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, transition: "width 0.3s" }} />
      </div>
      <span className="mono" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
        {value}%
      </span>
    </div>
  );
}

export function DecisionList({ initialData }: { initialData: DecisionRow[] }) {
  const { data: rows = initialData, isRefetching, dataUpdatedAt } = useQuery({
    queryKey: ["decisions"],
    queryFn: fetchDecisions,
    initialData,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="fade-in-up">
      {/* ── Header row ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "11px",
            fontWeight: 500,
            letterSpacing: "0.12em",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
          }}>
            DECISIONS
          </span>
          {pending.length > 0 && (
            <span style={{
              padding: "1px 8px",
              background: "rgba(245,200,66,0.1)",
              border: "1px solid rgba(245,200,66,0.3)",
              borderRadius: "3px",
              fontFamily: "'DM Mono', monospace",
              fontSize: "10px",
              color: "var(--accent-yellow)",
              letterSpacing: "0.06em",
            }}>
              {pending.length} PENDING
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isRefetching && (
            <span className="pulse-dot" style={{
              width: "5px", height: "5px", borderRadius: "50%",
              background: "var(--accent-blue)", display: "inline-block",
            }} />
          )}
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "10px",
            color: "var(--text-muted)",
            letterSpacing: "0.06em",
          }}>
            {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      {rows.length === 0 ? (
        <div style={{
          padding: "64px 0",
          textAlign: "center",
          color: "var(--text-muted)",
          fontFamily: "'DM Mono', monospace",
          fontSize: "12px",
          letterSpacing: "0.1em",
        }}>
          NO DECISIONS FOUND
        </div>
      ) : (
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: "6px",
          overflow: "hidden",
          background: "var(--bg-panel)",
        }}>
          {/* thead */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "140px 70px 80px 100px 120px 100px 90px 70px 80px",
            padding: "8px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-panel-alt)",
          }}>
            {["TICKER", "ACTION", "QTY", "PRICE", "CONFIDENCE", "STATUS", "EXPIRES", "CONF%", ""].map((h) => (
              <span key={h} style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "9px",
                fontWeight: 500,
                letterSpacing: "0.12em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}>{h}</span>
            ))}
          </div>

          {/* rows */}
          {rows.map((r, i) => (
            <div
              key={r.id}
              className="row-hover"
              style={{
                display: "grid",
                gridTemplateColumns: "140px 70px 80px 100px 120px 100px 90px 70px 80px",
                padding: "10px 16px",
                borderBottom: i < rows.length - 1 ? "1px solid var(--border-subtle)" : "none",
                alignItems: "center",
                cursor: "default",
              }}
            >
              {/* Ticker */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {r.ticker}
                </div>
                <div className="mono" style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "1px" }}>
                  {r.name.length > 10 ? r.name.slice(0, 10) + "…" : r.name}
                </div>
              </div>

              {/* Action */}
              <div><ActionPill action={r.action} /></div>

              {/* Qty */}
              <div className="mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                {r.quantity.toLocaleString()}
              </div>

              {/* Price */}
              <div className="mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                {Number(r.price) === 0 ? (
                  <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>MKT</span>
                ) : (
                  Number(r.price).toLocaleString()
                )}
              </div>

              {/* Confidence bar */}
              <div><ConfidenceBar value={r.confidence} /></div>

              {/* Status */}
              <div><StatusBadge status={r.status} /></div>

              {/* Expires */}
              <div>
                {r.status === "pending"
                  ? <Countdown expiresAt={r.expiresAt} />
                  : <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>—</span>
                }
              </div>

              {/* Created */}
              <div className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                {new Date(r.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" })}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <Link href={`/decisions/${r.id}`} style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  textDecoration: "none",
                  letterSpacing: "0.06em",
                  padding: "2px 6px",
                  border: "1px solid var(--border)",
                  borderRadius: "3px",
                  transition: "all 0.15s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--text-muted)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  VIEW
                </Link>
                {r.status === "pending" && (
                  <Link href={`/decisions/${r.id}/confirm`} style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "10px",
                    color: "var(--accent-yellow)",
                    textDecoration: "none",
                    letterSpacing: "0.06em",
                    padding: "2px 6px",
                    background: "rgba(245,200,66,0.1)",
                    border: "1px solid rgba(245,200,66,0.3)",
                    borderRadius: "3px",
                    transition: "all 0.15s",
                  }}>
                    ACT
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
