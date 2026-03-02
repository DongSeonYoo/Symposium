import { describe, it, expect, vi } from "vitest";
import { checkKisMode, checkRiskLimits, getKstTodayStart, calcTodayRealizedPnl } from "../pipeline/execute-order.js";

// ── checkKisMode ─────────────────────────────────────────────

describe("checkKisMode", () => {
  it("KIS_MODE=paper → ok", () => {
    process.env.KIS_MODE = "paper";
    expect(checkKisMode().ok).toBe(true);
  });

  it("KIS_MODE=live → ok", () => {
    process.env.KIS_MODE = "live";
    expect(checkKisMode().ok).toBe(true);
  });

  it("KIS_MODE 미설정 → 실패", () => {
    delete process.env.KIS_MODE;
    const r = checkKisMode();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("KIS_MODE");
  });

  it("KIS_MODE=production(invalid) → 실패", () => {
    process.env.KIS_MODE = "production";
    expect(checkKisMode().ok).toBe(false);
  });
});

// ── checkRiskLimits ───────────────────────────────────────────

describe("checkRiskLimits", () => {
  it("BUY 정상 주문 → ok", () => {
    const r = checkRiskLimits({
      side: "BUY",
      orderAmount: 1_000_000,
      totalPortfolioValue: 10_000_000,
      todayRealizedPnl: 0,
    });
    expect(r.ok).toBe(true);
  });

  it("BUY 1종목 비중 20% 초과 → 실패", () => {
    const r = checkRiskLimits({
      side: "BUY",
      orderAmount: 2_500_000,   // 25%
      totalPortfolioValue: 10_000_000,
      todayRealizedPnl: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("비중");
  });

  it("BUY 1종목 비중 정확히 20% → ok (경계값)", () => {
    const r = checkRiskLimits({
      side: "BUY",
      orderAmount: 2_000_000,   // 20%
      totalPortfolioValue: 10_000_000,
      todayRealizedPnl: 0,
    });
    expect(r.ok).toBe(true);
  });

  it("SELL 비중 50% 초과해도 → ok (집중도 체크 면제)", () => {
    const r = checkRiskLimits({
      side: "SELL",
      orderAmount: 5_000_000,   // 50%
      totalPortfolioValue: 10_000_000,
      todayRealizedPnl: 0,
    });
    expect(r.ok).toBe(true);
  });

  it("일일 실현손실 -3% 초과 → 실패", () => {
    const r = checkRiskLimits({
      side: "BUY",
      orderAmount: 500_000,
      totalPortfolioValue: 10_000_000,
      todayRealizedPnl: -350_000,   // -3.5%
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("손실");
  });

  it("일일 실현손실 정확히 -3% → ok (경계값)", () => {
    const r = checkRiskLimits({
      side: "BUY",
      orderAmount: 500_000,
      totalPortfolioValue: 10_000_000,
      todayRealizedPnl: -300_000,   // -3.0%
    });
    expect(r.ok).toBe(true);
  });

  it("todayRealizedPnl=0 (오늘 첫 주문 or pnl 미기록) → ok (fail-open, KIS API 한계)", () => {
    const r = checkRiskLimits({
      side: "BUY",
      orderAmount: 500_000,
      totalPortfolioValue: 10_000_000,
      todayRealizedPnl: 0,
    });
    expect(r.ok).toBe(true);
  });

  it("포트폴리오 총액 0 → 비중/손실 체크 생략 후 ok", () => {
    const r = checkRiskLimits({
      side: "BUY",
      orderAmount: 1_000_000,
      totalPortfolioValue: 0,
      todayRealizedPnl: -100_000,
    });
    expect(r.ok).toBe(true);
  });
});

// ── getKstTodayStart ─────────────────────────────────────────

describe("getKstTodayStart", () => {
  it("반환값이 유효한 Date", () => {
    const d = getKstTodayStart();
    expect(d).toBeInstanceOf(Date);
    expect(isNaN(d.getTime())).toBe(false);
  });

  it("KST 자정(00:00)에 해당하는 UTC 시각 반환 — UTC+9이므로 전날 15:00 UTC", () => {
    // KST 2025-01-15 00:00 = UTC 2025-01-14 15:00
    vi.setSystemTime(new Date("2025-01-15T10:00:00+09:00")); // KST 오전 10시
    const d = getKstTodayStart();
    // KST 당일 자정 = UTC 2025-01-14T15:00:00Z
    expect(d.toISOString()).toBe("2025-01-14T15:00:00.000Z");
    vi.useRealTimers();
  });

  it("서버가 UTC 타임존이어도 KST 기준 자정 반환", () => {
    // UTC 00:30 = KST 09:30 → KST 당일 자정은 전날 UTC 15:00
    vi.setSystemTime(new Date("2025-03-05T00:30:00Z")); // UTC 00:30 = KST 09:30
    const d = getKstTodayStart();
    expect(d.toISOString()).toBe("2025-03-04T15:00:00.000Z"); // KST 2025-03-05 00:00
    vi.useRealTimers();
  });
});

// ── calcTodayRealizedPnl ─────────────────────────────────────

describe("calcTodayRealizedPnl", () => {
  it("pnl 숫자 필드 있는 rows → 합산 반환", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { orderResult: { pnl: 50_000 } },
            { orderResult: { pnl: -20_000 } },
          ]),
        }),
      }),
    };
    const result = await calcTodayRealizedPnl(db as any);
    expect(result).toBe(30_000);
  });

  it("pnl 없는 rows → 0 반환 (fail-open)", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { orderResult: { orderId: "abc" } },  // pnl 없음
            { orderResult: null },
          ]),
        }),
      }),
    };
    const result = await calcTodayRealizedPnl(db as any);
    expect(result).toBe(0);
  });

  it("pnl이 문자열 → 0 누적 (비숫자 무시)", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { orderResult: { pnl: "50000" } },  // 문자열
          ]),
        }),
      }),
    };
    const result = await calcTodayRealizedPnl(db as any);
    expect(result).toBe(0);
  });

  it("오늘 executed 없음 → 0 반환", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    };
    const result = await calcTodayRealizedPnl(db as any);
    expect(result).toBe(0);
  });
});
