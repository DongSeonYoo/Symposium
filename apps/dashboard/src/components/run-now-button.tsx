"use client";

import { useState } from "react";

export function RunNowButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function handleClick() {
    if (state === "running") return;
    setState("running");
    setMsg("");
    try {
      const url = `${process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:3010"}/run-now`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) {
        setState("error");
        setMsg(data.error ?? "실행 실패");
      } else {
        setState("done");
        setMsg(data.message ?? "시작됨");
        setTimeout(() => setState("idle"), 4000);
      }
    } catch {
      setState("error");
      setMsg("orchestrator 연결 실패");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  const label =
    state === "running" ? "RUNNING..." :
    state === "done"    ? "STARTED ✓" :
    state === "error"   ? "ERROR"      : "▶ RUN NOW";

  const bg =
    state === "running" ? "rgba(234,179,8,0.15)" :
    state === "done"    ? "rgba(34,197,94,0.15)"  :
    state === "error"   ? "rgba(239,68,68,0.15)"  : "var(--accent-yellow)";

  const color =
    state === "running" ? "var(--accent-yellow)" :
    state === "done"    ? "var(--accent-green)"   :
    state === "error"   ? "#ef4444"               : "#000";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <button
        onClick={handleClick}
        disabled={state === "running"}
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.1em",
          padding: "6px 16px",
          border: "none",
          borderRadius: "4px",
          background: bg,
          color,
          cursor: state === "running" ? "not-allowed" : "pointer",
          textTransform: "uppercase",
          transition: "background 0.2s",
        }}
      >
        {label}
      </button>
      {msg && (
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "10px",
          color: state === "error" ? "#ef4444" : "var(--text-muted)",
          letterSpacing: "0.05em",
        }}>
          {msg}
        </span>
      )}
    </div>
  );
}
