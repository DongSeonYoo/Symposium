import { LoginModal } from "@/components/login-modal";

export default function LandingPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* subtle grid bg */}
      <div style={{
        position: "fixed",
        inset: 0,
        backgroundImage: `
          linear-gradient(var(--border-subtle) 1px, transparent 1px),
          linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)
        `,
        backgroundSize: "48px 48px",
        opacity: 0.5,
        pointerEvents: "none",
      }} />

      <div className="fade-in-up" style={{ textAlign: "center", position: "relative", maxWidth: "560px" }}>
        {/* logo */}
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "11px",
          letterSpacing: "0.3em",
          color: "var(--accent-yellow)",
          textTransform: "uppercase",
          marginBottom: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
        }}>
          <span style={{ fontSize: "16px" }}>◈</span>
          SYMPOSIUM
        </div>

        {/* headline */}
        <h1 style={{
          fontSize: "clamp(28px, 5vw, 40px)",
          fontWeight: 600,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
          margin: "0 0 16px",
        }}>
          LLM 투자 판단 시스템
        </h1>

        <p style={{
          fontSize: "14px",
          lineHeight: 1.8,
          color: "var(--text-secondary)",
          margin: "0 0 48px",
        }}>
          5인의 투자 거물 페르소나가 3라운드 토론을 거쳐<br />
          매매 판단을 제시합니다. 최종 결정은 당신이 합니다.
        </p>

        {/* stats row */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: "40px",
          marginBottom: "48px",
        }}>
          {[
            { label: "PERSONAS", value: "5" },
            { label: "ROUNDS", value: "3" },
            { label: "API CALLS", value: "16×" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="mono" style={{ fontSize: "24px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1 }}>
                {value}
              </div>
              <div style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "9px",
                letterSpacing: "0.15em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                marginTop: "6px",
              }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* login trigger */}
        <LoginModal />

        <p style={{
          marginTop: "24px",
          fontFamily: "'DM Mono', monospace",
          fontSize: "10px",
          color: "var(--text-muted)",
          letterSpacing: "0.08em",
        }}>
          Buffett · Soros · Dalio · Lynch · 박현주
        </p>
      </div>
    </div>
  );
}
