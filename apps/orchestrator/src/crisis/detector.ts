import type { DbClient } from "@symposium/db";
import { systemState, eq } from "@symposium/db";

export interface MacroSnapshot {
  vix: number;
  dxyChange: number;     // % change
  wtiChange: number;     // % change
  kospiChange: number;   // % change
  usdKrwChange: number;  // % change
}

export interface CrisisState {
  active: boolean;
  triggers: string[];
  activatedAt: string | null;
  cooldownUntil: string | null;
}

// 트리거 평가 — 해당하는 트리거명 배열 반환
export function evaluateTriggers(macro: MacroSnapshot): string[] {
  const triggers: string[] = [];
  if (macro.vix > 40) triggers.push("vix_spike");
  if (macro.dxyChange > 1.5) triggers.push("dxy_surge");
  if (macro.wtiChange < -5) triggers.push("oil_crash");
  if (macro.kospiChange < -3) triggers.push("kospi_circuit");
  if (macro.usdKrwChange > 2) triggers.push("krw_crash");
  return triggers;
}

/**
 * 위기모드 감지 및 DB 업데이트.
 * - 진입: 트리거 2개 이상
 * - 해제: 트리거 0개 (cooldownUntil 이후에만)
 * - 쿨다운: 해제 후 2사이클(1시간) 억제
 */
export async function detectAndUpdateCrisis(
  db: DbClient,
  macro: MacroSnapshot,
  cycleMinutes = 30
): Promise<CrisisState> {
  const now = new Date();

  // 현재 DB 상태 조회
  const [row] = await db
    .select()
    .from(systemState)
    .where(eq(systemState.key, "crisis_mode"));

  const current = (row?.value ?? {
    active: false,
    triggers: [],
    activatedAt: null,
    cooldownUntil: null,
  }) as CrisisState;

  const triggers = evaluateTriggers(macro);
  let next: CrisisState = { ...current };

  if (!current.active) {
    // 진입 조건: 트리거 2개 이상 + 쿨다운 종료
    const cooldownOver =
      !current.cooldownUntil || now > new Date(current.cooldownUntil);

    if (triggers.length >= 2 && cooldownOver) {
      next = {
        active: true,
        triggers,
        activatedAt: now.toISOString(),
        cooldownUntil: null,
      };
    }
  } else {
    // 해제 조건: 트리거 0개
    if (triggers.length === 0) {
      const cooldownUntil = new Date(
        now.getTime() + cycleMinutes * 2 * 60 * 1000
      );
      next = {
        active: false,
        triggers: [],
        activatedAt: null,
        cooldownUntil: cooldownUntil.toISOString(),
      };
    } else {
      // 위기 지속: 트리거 목록만 갱신
      next = { ...current, triggers };
    }
  }

  // 상태가 변경됐을 때만 DB 업데이트
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    await db
      .update(systemState)
      .set({ value: next as unknown as Record<string, unknown>, updatedAt: now })
      .where(eq(systemState.key, "crisis_mode"));
  }

  return next;
}
