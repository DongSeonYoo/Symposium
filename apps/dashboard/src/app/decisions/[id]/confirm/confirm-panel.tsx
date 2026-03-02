"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Countdown } from "@/components/countdown";

interface Props {
  decisionId: string;
  expiresAt: string;
}

interface ConfirmBody {
  action: "confirmed" | "rejected";
  reason?: string;
}

interface ConfirmResult {
  ok: boolean;
  error?: string;
}

async function postConfirm(decisionId: string, body: ConfirmBody): Promise<ConfirmResult> {
  const res = await fetch(`/api/decisions/${decisionId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as ConfirmResult;
  if (!res.ok || !data.ok) throw new Error(data.error ?? `오류 (${res.status})`);
  return data;
}

export function ConfirmPanel({ decisionId, expiresAt }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (body: ConfirmBody) => postConfirm(decisionId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["decisions"] });
      router.push(`/decisions/${decisionId}`);
    },
  });

  const expired = new Date(expiresAt).getTime() <= Date.now();
  const isLoading = mutation.isPending;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Timer */}
      <div style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "10px",
          letterSpacing: "0.12em",
          color: "var(--text-muted)",
          textTransform: "uppercase",
        }}>
          TIME REMAINING
        </span>
        <Countdown expiresAt={expiresAt} />
      </div>

      {/* Error */}
      {mutation.isError && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(245,92,92,0.08)",
          border: "1px solid rgba(245,92,92,0.25)",
          borderRadius: "4px",
          fontFamily: "'DM Mono', monospace",
          fontSize: "12px",
          color: "var(--accent-red)",
        }}>
          {mutation.error.message}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <button
          onClick={() => mutation.mutate({ action: "confirmed" })}
          disabled={isLoading || expired}
          style={{
            padding: "14px",
            background: isLoading || expired ? "var(--bg-panel-alt)" : "rgba(45,206,137,0.1)",
            border: `1px solid ${isLoading || expired ? "var(--border)" : "rgba(45,206,137,0.35)"}`,
            borderRadius: "5px",
            fontFamily: "'DM Mono', monospace",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: isLoading || expired ? "var(--text-muted)" : "var(--accent-green)",
            cursor: isLoading || expired ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            textTransform: "uppercase",
          }}
        >
          {isLoading ? "PROCESSING…" : "✓ CONFIRM"}
        </button>
        <button
          onClick={() => mutation.mutate({ action: "rejected" })}
          disabled={isLoading || expired}
          style={{
            padding: "14px",
            background: isLoading || expired ? "var(--bg-panel-alt)" : "rgba(245,92,92,0.08)",
            border: `1px solid ${isLoading || expired ? "var(--border)" : "rgba(245,92,92,0.3)"}`,
            borderRadius: "5px",
            fontFamily: "'DM Mono', monospace",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: isLoading || expired ? "var(--text-muted)" : "var(--accent-red)",
            cursor: isLoading || expired ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            textTransform: "uppercase",
          }}
        >
          ✕ REJECT
        </button>
      </div>

      {expired && (
        <p style={{
          textAlign: "center",
          fontFamily: "'DM Mono', monospace",
          fontSize: "11px",
          color: "var(--text-muted)",
          letterSpacing: "0.08em",
        }}>
          THIS DECISION HAS EXPIRED
        </p>
      )}
    </div>
  );
}
