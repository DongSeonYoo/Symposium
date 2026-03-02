import { describe, it, expect } from "vitest";

/**
 * 상태 전이 규칙 테스트 — actor × status 매트릭스 기반.
 * portfolio MCP update-decision.ts의 ACTOR_TRANSITIONS와 동일한 규칙.
 */

type Status = "pending" | "confirmed" | "rejected" | "expired" | "executed";
type Actor = "dashboard" | "orchestrator" | "system";

// update-decision.ts의 ACTOR_TRANSITIONS와 동일
const ACTOR_TRANSITIONS: Record<Actor, Partial<Record<Status, Status[]>>> = {
  dashboard:    { pending:   ["confirmed", "rejected"] },
  orchestrator: { confirmed: ["executed", "rejected"] },
  system:       { pending:   ["expired"] },
};

function validateTransition(
  actor: Actor,
  from: Status,
  to: Status
): { ok: boolean; error?: string } {
  const allowed = ACTOR_TRANSITIONS[actor]?.[from] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, error: `Forbidden: ${actor} cannot move ${from} → ${to}` };
  }
  return { ok: true };
}

function validateConfirmNotExpired(expiresAt: Date, now: Date): { ok: boolean; error?: string } {
  if (now > expiresAt) {
    return { ok: false, error: "Cannot confirm: decision has already expired" };
  }
  return { ok: true };
}

// ── dashboard 허용 케이스 ─────────────────────────────────────
describe("dashboard 전이", () => {
  it("pending → confirmed 허용", () => {
    expect(validateTransition("dashboard", "pending", "confirmed").ok).toBe(true);
  });

  it("pending → rejected 허용", () => {
    expect(validateTransition("dashboard", "pending", "rejected").ok).toBe(true);
  });

  it("confirmed → executed 금지 (dashboard 불가)", () => {
    expect(validateTransition("dashboard", "confirmed", "executed").ok).toBe(false);
  });

  it("confirmed → rejected 금지 (dashboard 불가)", () => {
    expect(validateTransition("dashboard", "confirmed", "rejected").ok).toBe(false);
  });

  it("pending → expired 금지 (dashboard 불가)", () => {
    expect(validateTransition("dashboard", "pending", "expired").ok).toBe(false);
  });
});

// ── orchestrator 허용 케이스 ─────────────────────────────────
describe("orchestrator 전이", () => {
  it("confirmed → executed 허용", () => {
    expect(validateTransition("orchestrator", "confirmed", "executed").ok).toBe(true);
  });

  it("confirmed → rejected 허용 (주문 실패 경로)", () => {
    expect(validateTransition("orchestrator", "confirmed", "rejected").ok).toBe(true);
  });

  it("pending → confirmed 금지 (orchestrator 불가)", () => {
    expect(validateTransition("orchestrator", "pending", "confirmed").ok).toBe(false);
  });

  it("pending → rejected 금지 (orchestrator 불가)", () => {
    expect(validateTransition("orchestrator", "pending", "rejected").ok).toBe(false);
  });

  it("executed → 어떤 상태로도 전이 금지 (최종 상태)", () => {
    const targets: Status[] = ["pending", "confirmed", "rejected", "expired"];
    for (const to of targets) {
      expect(validateTransition("orchestrator", "executed", to).ok).toBe(false);
    }
  });
});

// ── system 허용 케이스 ────────────────────────────────────────
describe("system 전이", () => {
  it("pending → expired 허용 (자동 만료)", () => {
    expect(validateTransition("system", "pending", "expired").ok).toBe(true);
  });

  it("confirmed → expired 금지 (system 불가)", () => {
    expect(validateTransition("system", "confirmed", "expired").ok).toBe(false);
  });

  it("expired → confirmed 금지 (만료 후 승인 불가)", () => {
    expect(validateTransition("system", "expired", "confirmed").ok).toBe(false);
  });
});

// ── 만료 시간 검증 ────────────────────────────────────────────
describe("만료 시간 검증", () => {
  it("expiresAt 이전 confirm → 허용", () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    expect(validateConfirmNotExpired(expiresAt, new Date()).ok).toBe(true);
  });

  it("expiresAt 이후 confirm 시도 → 거부", () => {
    const expiresAt = new Date(Date.now() - 1000);
    const r = validateConfirmNotExpired(expiresAt, new Date());
    expect(r.ok).toBe(false);
    expect(r.error).toContain("expired");
  });
});

// ── 정상/비정상 플로우 시나리오 ──────────────────────────────
describe("플로우 시나리오", () => {
  it("정상: dashboard confirm → orchestrator execute", () => {
    expect(validateTransition("dashboard", "pending", "confirmed").ok).toBe(true);
    expect(validateTransition("orchestrator", "confirmed", "executed").ok).toBe(true);
  });

  it("거부: dashboard reject", () => {
    expect(validateTransition("dashboard", "pending", "rejected").ok).toBe(true);
  });

  it("주문실패: dashboard confirm → orchestrator reject", () => {
    expect(validateTransition("dashboard", "pending", "confirmed").ok).toBe(true);
    expect(validateTransition("orchestrator", "confirmed", "rejected").ok).toBe(true);
  });

  it("만료: system expire", () => {
    expect(validateTransition("system", "pending", "expired").ok).toBe(true);
  });
});
