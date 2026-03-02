import Link from "next/link";
import { Providers } from "../providers";
import { RunNowButton } from "@/components/run-now-button";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <header style={{
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
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "13px",
              fontWeight: 500,
              letterSpacing: "0.12em",
              color: "var(--accent-yellow)",
              textTransform: "uppercase",
            }}>
              ◈ SYMPOSIUM
            </span>
          </Link>
          <nav style={{ display: "flex", gap: "24px" }}>
            <Link href="/dashboard" className="nav-link" style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.1em",
              textDecoration: "none",
              textTransform: "uppercase",
            }}>
              DECISIONS
            </Link>
            <Link href="/settings/api-keys" className="nav-link" style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.1em",
              textDecoration: "none",
              textTransform: "uppercase",
            }}>
              API KEYS
            </Link>
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <RunNowButton />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="pulse-dot" style={{
              width: "6px", height: "6px",
              borderRadius: "50%",
              background: "var(--accent-green)",
              display: "inline-block",
            }} />
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "10px",
              letterSpacing: "0.1em",
              color: "var(--text-secondary)",
            }}>
              LIVE
            </span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
        {children}
      </main>
    </Providers>
  );
}
