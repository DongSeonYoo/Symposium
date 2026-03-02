import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateTriggers, detectAndUpdateCrisis } from "../crisis/detector.js";
import type { MacroSnapshot, CrisisState } from "../crisis/detector.js";

// ── evaluateTriggers (순수 함수) ─────────────────────────────

describe("evaluateTriggers", () => {
  it("정상 시황 → 트리거 없음", () => {
    const macro: MacroSnapshot = {
      vix: 20,
      dxyChange: 0.2,
      wtiChange: -1,
      kospiChange: 0.5,
      usdKrwChange: 0.3,
    };
    expect(evaluateTriggers(macro)).toHaveLength(0);
  });

  it("VIX > 40 단독 → 트리거 1개", () => {
    const macro: MacroSnapshot = {
      vix: 45,
      dxyChange: 0,
      wtiChange: 0,
      kospiChange: 0,
      usdKrwChange: 0,
    };
    const triggers = evaluateTriggers(macro);
    expect(triggers).toContain("vix_spike");
    expect(triggers).toHaveLength(1);
  });

  it("VIX > 40 + DXY 급등 → 트리거 2개", () => {
    const macro: MacroSnapshot = {
      vix: 42,
      dxyChange: 2.0,
      wtiChange: 0,
      kospiChange: 0,
      usdKrwChange: 0,
    };
    const triggers = evaluateTriggers(macro);
    expect(triggers).toContain("vix_spike");
    expect(triggers).toContain("dxy_surge");
    expect(triggers).toHaveLength(2);
  });

  it("모든 트리거 동시 → 5개", () => {
    const macro: MacroSnapshot = {
      vix: 50,
      dxyChange: 3,
      wtiChange: -10,
      kospiChange: -4,
      usdKrwChange: 3,
    };
    expect(evaluateTriggers(macro)).toHaveLength(5);
  });
});

// ── detectAndUpdateCrisis (DB mock) ──────────────────────────

function makeDbMock(currentState: CrisisState) {
  const updateMock = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });

  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: currentState }]),
      }),
    }),
    update: updateMock,
  };
}

describe("detectAndUpdateCrisis", () => {
  const normalMacro: MacroSnapshot = {
    vix: 20, dxyChange: 0, wtiChange: 0, kospiChange: 0, usdKrwChange: 0,
  };
  const crisisMacro: MacroSnapshot = {
    vix: 45, dxyChange: 2, wtiChange: 0, kospiChange: 0, usdKrwChange: 0,
  };

  it("트리거 1개 → 위기 미진입 (DB 업데이트 없음)", async () => {
    const singleTriggerMacro: MacroSnapshot = {
      vix: 45, dxyChange: 0, wtiChange: 0, kospiChange: 0, usdKrwChange: 0,
    };
    const db = makeDbMock({ active: false, triggers: [], activatedAt: null, cooldownUntil: null });
    const result = await detectAndUpdateCrisis(db as any, singleTriggerMacro);
    expect(result.active).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("트리거 2개 이상 → 위기 진입 + DB 업데이트", async () => {
    const db = makeDbMock({ active: false, triggers: [], activatedAt: null, cooldownUntil: null });
    const result = await detectAndUpdateCrisis(db as any, crisisMacro);
    expect(result.active).toBe(true);
    expect(result.triggers).toContain("vix_spike");
    expect(db.update).toHaveBeenCalled();
  });

  it("위기 중 트리거 0개 → 해제 + 쿨다운 설정", async () => {
    const db = makeDbMock({
      active: true,
      triggers: ["vix_spike", "dxy_surge"],
      activatedAt: new Date().toISOString(),
      cooldownUntil: null,
    });
    const result = await detectAndUpdateCrisis(db as any, normalMacro);
    expect(result.active).toBe(false);
    expect(result.cooldownUntil).not.toBeNull();
    expect(db.update).toHaveBeenCalled();
  });

  it("쿨다운 중 트리거 2개 → 재진입 억제", async () => {
    const cooldownUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1시간 후
    const db = makeDbMock({
      active: false,
      triggers: [],
      activatedAt: null,
      cooldownUntil,
    });
    const result = await detectAndUpdateCrisis(db as any, crisisMacro);
    expect(result.active).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("위기 중 트리거 지속 → 트리거 목록만 갱신", async () => {
    const continuedMacro: MacroSnapshot = {
      vix: 50, dxyChange: 2, wtiChange: -6, kospiChange: 0, usdKrwChange: 0,
    };
    const db = makeDbMock({
      active: true,
      triggers: ["vix_spike", "dxy_surge"],
      activatedAt: new Date().toISOString(),
      cooldownUntil: null,
    });
    const result = await detectAndUpdateCrisis(db as any, continuedMacro);
    expect(result.active).toBe(true);
    expect(result.triggers).toContain("oil_crash");
  });
});
