import type { Metadata } from "next";
import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
