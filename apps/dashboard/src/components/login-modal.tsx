"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export function LoginModal() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const close = useCallback(() => {
    setOpen(false);
    setPassword("");
    setError("");
  }, []);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        setError("비밀번호가 올바르지 않습니다.");
      }
    } catch {
      setError("연결 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 28px",
          background: "var(--accent-yellow)",
          color: "#0a0b0d",
          border: "none",
          borderRadius: "4px",
          fontFamily: "'DM Mono', monospace",
          fontSize: "12px",
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          cursor: "pointer",
          transition: "opacity 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
      >
        ENTER →
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              zIndex: 200,
              backdropFilter: "blur(4px)",
            }}
          />

          {/* modal */}
          <div style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 201,
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "32px",
            width: "100%",
            maxWidth: "360px",
            animation: "fade-in-up 0.2s ease both",
          }}>
            <div style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "10px",
              letterSpacing: "0.2em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              marginBottom: "20px",
            }}>
              ◈ SYMPOSIUM — ACCESS
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="Password"
                autoFocus
                style={{
                  background: "var(--bg-base)",
                  border: `1px solid ${error ? "var(--accent-red)" : "var(--border)"}`,
                  borderRadius: "4px",
                  padding: "10px 14px",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "border-color 0.15s",
                  width: "100%",
                  boxSizing: "border-box",
                }}
                onFocus={e => { if (!error) e.target.style.borderColor = "var(--accent-yellow)"; }}
                onBlur={e => { if (!error) e.target.style.borderColor = "var(--border)"; }}
              />

              {error && (
                <div style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "11px",
                  color: "var(--accent-red)",
                  letterSpacing: "0.05em",
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                style={{
                  padding: "10px",
                  background: loading || !password ? "var(--bg-elevated)" : "var(--accent-yellow)",
                  color: loading || !password ? "var(--text-muted)" : "#0a0b0d",
                  border: "none",
                  borderRadius: "4px",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor: loading || !password ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                {loading ? "..." : "ENTER"}
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
