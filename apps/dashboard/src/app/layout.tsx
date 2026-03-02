import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Symposium",
  description: "LLM 기반 반자동 주식매매 판단 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <style>{`
          .nav-link { color: var(--text-secondary); transition: color 0.15s; }
          .nav-link:hover { color: var(--text-primary); }
          .row-hover { transition: background 0.1s; }
          .row-hover:hover { background: var(--bg-elevated); }
          .btn-link { transition: all 0.15s; }
          .btn-link:hover { color: var(--text-primary) !important; border-color: var(--text-muted) !important; }
          .holding-card { background: var(--bg-panel); transition: background 0.15s; }
          .holding-card:hover { background: var(--bg-elevated); }
        `}</style>
      </head>
      <body style={{ background: "var(--bg-base)", color: "var(--text-primary)", minHeight: "100vh", margin: 0 }}>
        {/* ── Top bar ── */}
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
            <nav style={{ display: "flex", gap: "24px" }}>
              <a href="/" className="nav-link" style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "11px",
                fontWeight: 500,
                letterSpacing: "0.1em",
                textDecoration: "none",
                textTransform: "uppercase",
              }}>
                DECISIONS
              </a>
            </nav>
          </div>

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
        </header>

        <Providers>
          <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
