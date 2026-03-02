import { z } from "zod";
import { type DbClient, decisions, decisionEvents, eq, and } from "@symposium/db";

export const updateDecisionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["confirmed", "rejected", "expired", "executed"]),
  actor: z.enum(["orchestrator", "dashboard", "system"]),
  reason: z.string().optional(),
  orderResult: z.record(z.unknown()).optional(),
});

export type UpdateDecisionInput = z.infer<typeof updateDecisionSchema>;

// actor별 허용 전이 규칙 (상태 × actor 매트릭스)
// dashboard    : 사용자 Confirm/Reject — pending 단계에서만
// orchestrator : 주문 실행/실패 — confirmed 단계에서만
// system       : 자동 만료 — pending 단계에서만
const ACTOR_TRANSITIONS: Record<string, Record<string, string[]>> = {
  dashboard:    { pending:   ["confirmed", "rejected"] },
  orchestrator: { confirmed: ["executed", "rejected"] },
  system:       { pending:   ["expired"] },
};

export async function updateDecision(db: DbClient, input: UpdateDecisionInput) {
  // 현재 상태 조회
  const [current] = await db
    .select({ status: decisions.status, expiresAt: decisions.expiresAt })
    .from(decisions)
    .where(eq(decisions.id, input.id));

  if (!current) {
    throw new Error(`Decision not found: ${input.id}`);
  }

  // actor별 허용 전이 검증
  const allowed = ACTOR_TRANSITIONS[input.actor]?.[current.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw new Error(
      `Forbidden transition: ${input.actor} cannot move ${current.status} → ${input.status}`
    );
  }

  // confirmed 전이 시 만료 여부 확인
  if (input.status === "confirmed" && new Date() > current.expiresAt) {
    throw new Error("Cannot confirm: decision has already expired");
  }

  // 상태별 추가 필드
  const extraFields: Record<string, unknown> = {};
  if (input.status === "confirmed") extraFields.confirmedAt = new Date();
  if (input.status === "executed") {
    extraFields.executedAt = new Date();
    if (input.orderResult) extraFields.orderResult = input.orderResult;
  }

  // 조건부 UPDATE (레이스 컨디션 방지: WHERE status = current.status)
  const [updated] = await db
    .update(decisions)
    .set({ status: input.status, ...extraFields })
    .where(and(eq(decisions.id, input.id), eq(decisions.status, current.status)))
    .returning({ id: decisions.id, status: decisions.status });

  if (!updated) {
    throw new Error(
      `Concurrent update detected: decision ${input.id} status changed`
    );
  }

  // 감사 로그 기록
  await db.insert(decisionEvents).values({
    decisionId: input.id,
    actor: input.actor,
    fromStatus: current.status,
    toStatus: input.status,
    reason: input.reason ?? null,
  });

  return { id: updated.id, status: updated.status };
}
