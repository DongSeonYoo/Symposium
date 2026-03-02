/**
 * 페르소나 가중치 조회.
 * personaWeights 테이블에서 global/neutral 조건 가중치를 조회.
 * 데이터 없으면 기본값 (각 0.2) 반환.
 */

import { type DbClient, personaWeights, eq, and } from "@symposium/db";

const DEFAULT_WEIGHTS: Record<string, number> = {
  buffett: 0.2,
  soros: 0.2,
  dalio: 0.2,
  lynch: 0.2,
  parkhyunju: 0.2,
};

export async function getWeights(db: DbClient): Promise<Record<string, number>> {
  try {
    const rows = await db
      .select({ persona: personaWeights.persona, weight: personaWeights.weight })
      .from(personaWeights)
      .where(
        and(
          eq(personaWeights.sector, "global"),
          eq(personaWeights.condition, "neutral")
        )
      );

    if (rows.length === 0) {
      return { ...DEFAULT_WEIGHTS };
    }

    const result: Record<string, number> = { ...DEFAULT_WEIGHTS };
    for (const row of rows) {
      result[row.persona] = Number(row.weight);
    }
    return result;
  } catch {
    // DB 조회 실패 시 기본값 반환 (fail-open)
    return { ...DEFAULT_WEIGHTS };
  }
}
