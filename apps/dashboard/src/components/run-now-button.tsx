"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunNowButton() {
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function handleClick() {
    if (state === "running") return;
    setState("running");
    setMsg("");
    try {
      const res = await fetch("/api/debate/run-now", { method: "POST" });
      const data = await res.json() as { ok?: boolean; cycleId?: string; error?: string };
      if (!res.ok || !data.ok) {
        setState("error");
        setMsg(data.error ?? "실행 실패");
        setTimeout(() => setState("idle"), 4000);
      } else if (data.cycleId) {
        // cycleId를 받아 /debate/live 페이지로 이동
        router.push(`/debate/live?cycleId=${encodeURIComponent(data.cycleId)}`);
      }
    } catch {
      setState("error");
      setMsg("orchestrator 연결 실패");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  const label =
    state === "running" ? "LAUNCHING..." :
    state === "error"   ? "ERROR"        : "▶ RUN NOW";

  const bg =
    state === "running" ? "rgba(234,179,8,0.15)" :
    state === "error"   ? "rgba(239,68,68,0.15)"  : "var(--accent-yellow)";

  const color =
    state === "running" ? "var(--accent-yellow)" :
    state === "error"   ? "#ef4444"              : "#000";

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
