/**
 * CycleEmitter — 분석 사이클 이벤트를 DB에 저장.
 * SSE 휘발성 극복을 위한 DB 영구 저장 → 재접속 시 replay 지원.
 *
 * 보안:
 * - redactSecrets: apikey|secret|token|password 키 → "[REDACTED]"
 * - truncatePayload: 직렬화 8KB 초과 시 string 필드 500자 자름
 */

import { analysisCycles, analysisEvents, eq, sql } from "@symposium/db";
import type { DbClient } from "@symposium/db";

// ── 보안 헬퍼 ────────────────────────────────────────────────

const SECRET_KEY_PATTERN = /apikey|secret|token|password/i;

function redactSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEY_PATTERN.test(k)) {
      result[k] = "[REDACTED]";
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      result[k] = redactSecrets(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function truncatePayload(
  obj: Record<string, unknown>,
  maxBytes = 8_192,
  maxStrLen = 500
): Record<string, unknown> {
  const json = JSON.stringify(obj);
  if (json.length <= maxBytes) return obj;

  // 문자열 필드를 500자로 자름
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.length > maxStrLen) {
      result[k] = v.slice(0, maxStrLen) + "…";
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      result[k] = truncatePayload(v as Record<string, unknown>, maxBytes, maxStrLen);
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ── CycleEmitter ─────────────────────────────────────────────

export class CycleEmitter {
  constructor(
    private readonly db: DbClient,
    public readonly cycleId: string
  ) {}

  /**
   * 이벤트를 DB에 저장.
   * analysis_cycles 행을 FOR UPDATE로 잠근 트랜잭션 안에서
   * MAX(seq)+1을 계산·삽입 → 동시 emit 간 seq 레이스 완전 방지.
   * UNIQUE(cycle_id, seq) 제약이 2차 안전망 역할.
   */
  async emit(
    eventType: string,
    payload: Record<string, unknown> = {}
  ): Promise<void> {
    const safe = truncatePayload(redactSecrets(payload));
    const cycleId = this.cycleId;
    const jsonPayload = JSON.stringify(safe);

    await this.db.transaction(async (tx) => {
      // cycle 행 잠금 — 같은 cycle에 대한 동시 emit 직렬화
      await tx.execute(
        sql`SELECT id FROM analysis_cycles WHERE id = ${cycleId}::uuid FOR UPDATE`
      );
      await tx.execute(sql`
        INSERT INTO analysis_events (id, cycle_id, seq, event_type, payload)
        SELECT
          gen_random_uuid(),
          ${cycleId}::uuid,
          COALESCE(
            (SELECT MAX(seq) FROM analysis_events WHERE cycle_id = ${cycleId}::uuid),
            0
          ) + 1,
          ${eventType},
          ${jsonPayload}::jsonb
      `);
    });
  }

  /** 사이클 완료 또는 에러로 상태 갱신 */
  async finish(error?: string): Promise<void> {
    await this.db
      .update(analysisCycles)
      .set({
        status: error ? "error" : "done",
        finishedAt: sql`NOW()`,
        error: error ?? null,
      })
      .where(eq(analysisCycles.id, this.cycleId));
  }
}

// ── 팩토리 ───────────────────────────────────────────────────

export async function createCycle(
  db: DbClient,
  trigger: "manual" | "cron",
  requestedBy?: string
): Promise<string> {
  const [row] = await db
    .insert(analysisCycles)
    .values({ trigger, requestedBy })
    .returning({ id: analysisCycles.id });
  if (!row) throw new Error("createCycle: insert returned no rows");
  return row.id;
}
