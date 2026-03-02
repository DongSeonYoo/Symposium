"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiKeyStatus } from "@/lib/api-keys";

async function fetchApiKeys(): Promise<ApiKeyStatus[]> {
  const res = await fetch("/api/settings/api-keys");
  if (!res.ok) throw new Error("API key 목록 조회 실패");
  return res.json();
}

async function saveApiKey(name: string, value: string): Promise<void> {
  const res = await fetch("/api/settings/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "저장 실패");
  }
}

async function removeApiKey(name: string): Promise<void> {
  const res = await fetch(`/api/settings/api-keys?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("삭제 실패");
}

function ApiKeyCard({ status }: { status: ApiKeyStatus }) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () => saveApiKey(status.name, inputValue),
    onSuccess: () => {
      setIsEditing(false);
      setInputValue("");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => removeApiKey(status.name),
    onSuccess: () => {
      setDeleteConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const dotColor = status.isSet ? "var(--accent-green)" : "var(--accent-red, #ef4444)";

  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius: "6px",
      padding: "20px",
      background: "var(--bg-panel)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            width: "8px", height: "8px",
            borderRadius: "50%",
            background: dotColor,
            display: "inline-block",
            flexShrink: 0,
          }} />
          <div>
            <div style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--text-primary)",
              marginBottom: "2px",
            }}>
              {status.name}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {status.label}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "9px",
            letterSpacing: "0.1em",
            padding: "2px 6px",
            borderRadius: "3px",
            background: status.required ? "rgba(239,68,68,0.15)" : "rgba(100,116,139,0.15)",
            color: status.required ? "#ef4444" : "var(--text-muted)",
            fontWeight: 600,
          }}>
            {status.required ? "REQUIRED" : "OPTIONAL"}
          </span>
          {status.isSet && (
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "9px",
              letterSpacing: "0.1em",
              padding: "2px 6px",
              borderRadius: "3px",
              background: status.source === "env" ? "rgba(59,130,246,0.15)" : "rgba(34,197,94,0.15)",
              color: status.source === "env" ? "#3b82f6" : "var(--accent-green)",
              fontWeight: 600,
            }}>
              {status.source === "env" ? "ENV" : "DB"}
            </span>
          )}
        </div>
      </div>

      {status.isSet && !isEditing && (
        <div style={{ marginBottom: "12px" }}>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "12px",
            color: "var(--text-muted)",
            letterSpacing: "0.05em",
          }}>
            {status.maskedValue}
          </span>
          {status.updatedAt && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "12px" }}>
              {new Date(status.updatedAt).toLocaleString("ko-KR")}
            </span>
          )}
        </div>
      )}

      {!isEditing ? (
        <div style={{ display: "flex", gap: "8px" }}>
          {status.source !== "env" && (
            <button
              onClick={() => setIsEditing(true)}
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "10px",
                letterSpacing: "0.08em",
                padding: "5px 12px",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {status.isSet ? "UPDATE" : "SET"}
            </button>
          )}
          {status.source === "db" && (
            <>
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                    padding: "5px 12px",
                    border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: "4px",
                    background: "transparent",
                    color: "#ef4444",
                    cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                >
                  DELETE
                </button>
              ) : (
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", color: "#ef4444" }}>삭제 확인?</span>
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: "10px",
                      padding: "4px 10px",
                      border: "none",
                      borderRadius: "4px",
                      background: "#ef4444",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {deleteMutation.isPending ? "..." : "YES"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: "10px",
                      padding: "4px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    NO
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <input
            type="password"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={status.hint}
            autoFocus
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "12px",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              background: "var(--bg)",
              color: "var(--text-primary)",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          {saveMutation.error && (
            <span style={{ fontSize: "11px", color: "#ef4444" }}>
              {saveMutation.error.message}
            </span>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !inputValue.trim()}
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "10px",
                letterSpacing: "0.08em",
                padding: "5px 16px",
                border: "none",
                borderRadius: "4px",
                background: "var(--accent-yellow)",
                color: "#000",
                cursor: "pointer",
                fontWeight: 600,
                textTransform: "uppercase",
                opacity: saveMutation.isPending || !inputValue.trim() ? 0.5 : 1,
              }}
            >
              {saveMutation.isPending ? "SAVING..." : "SAVE"}
            </button>
            <button
              onClick={() => { setIsEditing(false); setInputValue(""); }}
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "10px",
                letterSpacing: "0.08em",
                padding: "5px 12px",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApiKeysPage() {
  const { data, isLoading, error } = useQuery<ApiKeyStatus[]>({
    queryKey: ["api-keys"],
    queryFn: fetchApiKeys,
    refetchInterval: 30_000,
  });

  const missingRequired = data?.filter((k) => k.required && !k.isSet) ?? [];

  return (
    <div style={{ maxWidth: "640px" }}>
      <div style={{ marginBottom: "28px" }}>
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "11px",
          fontWeight: 500,
          letterSpacing: "0.12em",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          marginBottom: "6px",
        }}>
          SETTINGS / API KEYS
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
          API 키는 AES-256-GCM으로 암호화되어 DB에 저장됩니다.
          환경변수(ENV)에 설정된 키는 여기서 수정할 수 없습니다.
        </p>
      </div>

      {missingRequired.length > 0 && (
        <div style={{
          marginBottom: "20px",
          padding: "12px 16px",
          border: "1px solid rgba(239,68,68,0.4)",
          borderRadius: "6px",
          background: "rgba(239,68,68,0.08)",
        }}>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#ef4444",
            fontWeight: 600,
          }}>
            ⚠ PIPELINE BLOCKED — {missingRequired.map((k) => k.name).join(", ")} 미설정
          </span>
        </div>
      )}

      {isLoading && (
        <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>로딩 중...</div>
      )}

      {error && (
        <div style={{ color: "#ef4444", fontSize: "13px" }}>목록 조회 실패</div>
      )}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {data.map((status) => (
            <ApiKeyCard key={status.name} status={status} />
          ))}
        </div>
      )}
    </div>
  );
}
