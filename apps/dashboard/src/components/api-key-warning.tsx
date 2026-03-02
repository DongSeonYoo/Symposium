import Link from "next/link";
import { getMissingRequiredKeys } from "@/lib/api-keys";

export async function ApiKeyWarning() {
  let missing: string[] = [];
  try {
    missing = await getMissingRequiredKeys();
  } catch {
    // DB 조회 실패 시 무음 처리 — 배너 미표시
    return null;
  }

  if (missing.length === 0) return null;

  return (
    <Link href="/settings/api-keys" style={{ textDecoration: "none" }}>
      <div style={{
        marginBottom: "20px",
        padding: "10px 16px",
        border: "1px solid rgba(239,68,68,0.4)",
        borderRadius: "6px",
        background: "rgba(239,68,68,0.08)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "11px",
          letterSpacing: "0.08em",
          color: "#ef4444",
          fontWeight: 600,
        }}>
          ⚠ PIPELINE BLOCKED — {missing.join(", ")} 미설정
        </span>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "10px",
          color: "#ef4444",
          opacity: 0.7,
        }}>
          설정하기 →
        </span>
      </div>
    </Link>
  );
}
