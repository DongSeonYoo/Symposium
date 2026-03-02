"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// ── 타입 ─────────────────────────────────────────────────────

interface StreamEvent {
  seq: number;
  type: string;
  cycleId: string;
  payload: Record<string, unknown>;
  ts: string;
}

type StepStatus = "pending" | "running" | "done" | "error";

interface TickerProgress {
  ticker: string;
  name?: string;
  collect: StepStatus;
  round1: StepStatus;
  round2: StepStatus;
  round3: StepStatus;
  synthesis: StepStatus;
}

// ── 시간 포맷 헬퍼 ───────────────────────────────────────────

function formatElapsed(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0
    ? `${m}:${String(sec).padStart(2, "0")}`
    : `00:${String(sec).padStart(2, "0")}`;
}

// ── 컴포넌트 ─────────────────────────────────────────────────

function DebateLiveInner() {
  const searchParams = useSearchParams();
  const cycleId = searchParams.get("cycleId") ?? "";

  const [cycleStatus, setCycleStatus] = useState<
    "running" | "done" | "error" | "unknown"
  >("unknown");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [tickerMap, setTickerMap] = useState<Map<string, TickerProgress>>(
    new Map()
  );
  const [connected, setConnected] = useState(false);
  const [startMs] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState("00:00");
  const [rawExpanded, setRawExpanded] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const lastSeqRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  // ── elapsed 타이머 ───────────────────────────────────────
  useEffect(() => {
    const id = setInterval(
      () => setElapsed(formatElapsed(startMs)),
      1_000
    );
    return () => clearInterval(id);
  }, [startMs]);

  // ── 이벤트 파서 ─────────────────────────────────────────
  const applyEvent = useCallback((ev: StreamEvent) => {
    const { type, payload } = ev;

    setTickerMap((prev) => {
      const next = new Map(prev);

      switch (type) {
        case "ticker:start": {
          const ticker = String(payload["ticker"] ?? "");
          next.set(ticker, {
            ticker,
            name: payload["name"] ? String(payload["name"]) : undefined,
            collect: "running",
            round1: "pending",
            round2: "pending",
            round3: "pending",
            synthesis: "pending",
          });
          break;
        }
        case "collect:done": {
          const ticker = String(payload["ticker"] ?? "");
          const existing = next.get(ticker);
          if (existing) next.set(ticker, { ...existing, collect: "done", round1: "running" });
          break;
        }
        case "round1:done": {
          const ticker = String(payload["ticker"] ?? "");
          const existing = next.get(ticker);
          if (existing) next.set(ticker, { ...existing, round1: "done", round2: "running" });
          break;
        }
        case "round2:done": {
          const ticker = String(payload["ticker"] ?? "");
          const existing = next.get(ticker);
          if (existing) next.set(ticker, { ...existing, round2: "done", round3: "running" });
          break;
        }
        case "round3:done": {
          const ticker = String(payload["ticker"] ?? "");
          const existing = next.get(ticker);
          if (existing) next.set(ticker, { ...existing, round3: "done", synthesis: "running" });
          break;
        }
        case "synthesis:done": {
          const ticker = String(payload["ticker"] ?? "");
          const existing = next.get(ticker);
          if (existing) next.set(ticker, { ...existing, synthesis: "done" });
          break;
        }
        case "ticker:error": {
          const ticker = String(payload["ticker"] ?? "");
          const existing = next.get(ticker);
          if (existing) {
            const updated = { ...existing };
            if (updated.collect === "running") updated.collect = "error";
            if (updated.round1 === "running") updated.round1 = "error";
            if (updated.round2 === "running") updated.round2 = "error";
            if (updated.round3 === "running") updated.round3 = "error";
            if (updated.synthesis === "running") updated.synthesis = "error";
            next.set(ticker, updated);
          }
          break;
        }
      }

      return next;
    });
  }, []);

  // ── SSE 연결 ─────────────────────────────────────────────
  useEffect(() => {
    if (!cycleId) return;

    function connect(afterSeq: number): EventSource {
      const url = `/api/debate/stream?cycleId=${encodeURIComponent(cycleId)}&after=${afterSeq}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => setConnected(true);

      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data as string) as StreamEvent;
          lastSeqRef.current = Math.max(lastSeqRef.current, ev.seq);

          if (ev.type === "stream:end") {
            const status = ev.payload["status"];
            setCycleStatus(status === "error" ? "error" : "done");
            es.close();
            setConnected(false);
            return;
          }
          if (ev.type === "stream:timeout") {
            setCycleStatus("unknown");
            es.close();
            setConnected(false);
            return;
          }

          setEvents((prev) => {
            if (prev.some((p) => p.seq === ev.seq)) return prev;
            return [...prev, ev].sort((a, b) => a.seq - b.seq);
          });

          applyEvent(ev);
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        setConnected(false);
        // 재접속 (2초 후)
        setTimeout(() => {
          const newEs = connect(lastSeqRef.current);
          esRef.current = newEs;
        }, 2_000);
      };

      return es;
    }

    const es = connect(0);
    setCycleStatus("running");

    return () => {
      es.close();
      esRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  // ── 자동 스크롤 ─────────────────────────────────────────
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // ── 렌더링 ───────────────────────────────────────────────

  const shortId = cycleId.slice(0, 8).toUpperCase();
  const tickers = Array.from(tickerMap.values());

  const statusDot =
    cycleStatus === "running"
      ? { color: "var(--accent-yellow)", label: "RUNNING", blink: true }
      : cycleStatus === "done"
      ? { color: "var(--accent-green)", label: "DONE", blink: false }
      : cycleStatus === "error"
      ? { color: "#ef4444", label: "ERROR", blink: false }
      : { color: "var(--text-muted)", label: "CONNECTING", blink: true };

  const STEP_LABELS: (keyof Omit<TickerProgress, "ticker" | "name">)[] = [
    "collect",
    "round1",
    "round2",
    "round3",
    "synthesis",
  ];

  function stepIcon(s: StepStatus): string {
    return s === "done" ? "✓" : s === "running" ? "●" : s === "error" ? "✗" : "─";
  }

  function stepColor(s: StepStatus): string {
    return s === "done"
      ? "var(--accent-green)"
      : s === "running"
      ? "var(--accent-yellow)"
      : s === "error"
      ? "#ef4444"
      : "var(--text-muted)";
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: "'DM Mono', monospace",
      }}
    >
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          padding: "0 24px",
          height: "48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 500,
                letterSpacing: "0.12em",
                color: "var(--accent-yellow)",
                textTransform: "uppercase",
              }}
            >
              ◈ SYMPOSIUM
            </span>
          </Link>
          <span
            style={{
              fontSize: "11px",
              letterSpacing: "0.1em",
              color: "var(--text-secondary)",
            }}
          >
            DEBATE LIVE · {shortId}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span
            style={{
              fontSize: "10px",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
            }}
          >
            {elapsed}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: statusDot.color,
                display: "inline-block",
                animation: statusDot.blink
                  ? "blink 1.2s ease-in-out infinite"
                  : "none",
              }}
            />
            <span
              style={{
                fontSize: "10px",
                letterSpacing: "0.1em",
                color: statusDot.color,
                fontWeight: 600,
              }}
            >
              {statusDot.label}
            </span>
          </div>
        </div>
      </header>

      {/* ── 본문 ─────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          height: "calc(100vh - 48px)",
          overflow: "hidden",
        }}
      >
        {/* ── 왼쪽: 진행 상황 ──────────────────────────── */}
        <div
          style={{
            borderRight: "1px solid var(--border)",
            padding: "20px 16px",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: "9px",
              letterSpacing: "0.15em",
              color: "var(--text-muted)",
              marginBottom: "16px",
              textTransform: "uppercase",
            }}
          >
            PROGRESS
          </div>

          {!connected && cycleStatus === "unknown" && (
            <div
              style={{ fontSize: "11px", color: "var(--text-muted)" }}
            >
              연결 중...
            </div>
          )}

          {tickers.length === 0 && connected && (
            <div
              style={{ fontSize: "11px", color: "var(--text-muted)" }}
            >
              사이클 시작 대기 중...
            </div>
          )}

          {tickers.map((t) => (
            <div
              key={t.ticker}
              style={{
                marginBottom: "20px",
                padding: "12px",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "var(--bg-panel)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: "8px",
                  letterSpacing: "0.06em",
                }}
              >
                {t.ticker}
                {t.name && (
                  <span
                    style={{
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      marginLeft: "6px",
                      fontWeight: 400,
                    }}
                  >
                    {t.name}
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                {STEP_LABELS.map((step) => (
                  <div
                    key={step}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "10px",
                    }}
                  >
                    <span style={{ color: stepColor(t[step]), width: "12px" }}>
                      {stepIcon(t[step])}
                    </span>
                    <span
                      style={{
                        color:
                          t[step] === "pending"
                            ? "var(--text-muted)"
                            : "var(--text-secondary)",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── 오른쪽: 이벤트 로그 ─────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid var(--border)",
              fontSize: "9px",
              letterSpacing: "0.15em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              background: "var(--bg-panel)",
            }}
          >
            EVENT LOG ({events.length})
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 16px",
            }}
          >
            {events.length === 0 && (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  paddingTop: "8px",
                }}
              >
                이벤트 대기 중...
              </div>
            )}

            {events.map((ev) => (
              <EventRow key={ev.seq} ev={ev} />
            ))}
            <div ref={logEndRef} />
          </div>

          {/* ── Raw JSON 패널 ─────────────────────────── */}
          <div
            style={{
              borderTop: "1px solid var(--border)",
              background: "var(--bg-panel)",
            }}
          >
            <button
              onClick={() => setRawExpanded((v) => !v)}
              style={{
                width: "100%",
                padding: "8px 16px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "9px",
                letterSpacing: "0.12em",
                color: "var(--text-muted)",
                fontFamily: "'DM Mono', monospace",
                textTransform: "uppercase",
              }}
            >
              RAW JSON {rawExpanded ? "▲" : "▼"}
            </button>
            {rawExpanded && (
              <pre
                style={{
                  margin: 0,
                  padding: "0 16px 16px",
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  overflowX: "auto",
                  maxHeight: "200px",
                  overflowY: "auto",
                  background: "var(--bg)",
                }}
              >
                {JSON.stringify(events.slice(-10), null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ── 이벤트 행 컴포넌트 ────────────────────────────────────────

function EventRow({ ev }: { ev: StreamEvent }) {
  const [expanded, setExpanded] = useState(false);

  const ts = new Date(ev.ts);
  const timeStr = ts.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const typeColor =
    ev.type.startsWith("round") && ev.type.endsWith(":done")
      ? "var(--accent-green)"
      : ev.type === "cycle:done" || ev.type === "synthesis:done"
      ? "var(--accent-green)"
      : ev.type.includes("error")
      ? "#ef4444"
      : ev.type === "stream:end"
      ? "var(--accent-yellow)"
      : "var(--text-secondary)";

  // 주요 필드 요약
  let summary = "";
  if (ev.type === "collect:done") {
    const sources = ev.payload["sources"] as Record<string, string> | undefined;
    if (sources)
      summary = Object.entries(sources)
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");
  } else if (
    ev.type === "round1:done" ||
    ev.type === "round2:done" ||
    ev.type === "round3:done"
  ) {
    const results = ev.payload["results"] as
      | Array<{ persona: string; action: string; confidence: number }>
      | undefined;
    if (results)
      summary = results
        .map((r) => `${r.persona}:${r.action}(${r.confidence})`)
        .join(" ");
  } else if (ev.type === "synthesis:done") {
    summary = `${String(ev.payload["finalAction"] ?? "")} conf=${String(ev.payload["finalConfidence"] ?? "")}`;
  } else if (ev.type === "decision:saved") {
    summary = `saved ${String(ev.payload["action"] ?? "")}`;
  }

  return (
    <div style={{ marginBottom: "8px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          style={{
            fontSize: "9px",
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          [{timeStr}]
        </span>
        <span
          style={{
            fontSize: "10px",
            color: typeColor,
            fontWeight: 600,
            letterSpacing: "0.05em",
            flexShrink: 0,
          }}
        >
          {ev.type}
        </span>
        {summary && (
          <span
            style={{
              fontSize: "10px",
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {summary}
          </span>
        )}
      </div>
      {expanded && (
        <pre
          style={{
            margin: "4px 0 0 0",
            padding: "8px",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            fontSize: "10px",
            color: "var(--text-muted)",
            overflowX: "auto",
          }}
        >
          {JSON.stringify(ev.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── default export — useSearchParams를 Suspense로 래핑 ────────
export default function DebateLivePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'DM Mono', monospace",
            fontSize: "12px",
            color: "var(--text-muted)",
          }}
        >
          로딩 중...
        </div>
      }
    >
      <DebateLiveInner />
    </Suspense>
  );
}
