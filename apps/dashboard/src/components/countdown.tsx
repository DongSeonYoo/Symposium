"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "EXPIRED";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState<number>(() =>
    new Date(expiresAt).getTime() - Date.now()
  );

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(new Date(expiresAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const expired = remaining <= 0;
  const urgent  = remaining > 0 && remaining < 5 * 60 * 1000;

  return (
    <span className="mono" style={{
      fontSize: "12px",
      color: expired ? "var(--text-muted)" : urgent ? "var(--accent-red)" : "var(--accent-yellow)",
      fontWeight: urgent ? 600 : 400,
      letterSpacing: "0.05em",
    }}>
      {formatRemaining(remaining)}
    </span>
  );
}
