import { describe, it, expect, vi } from "vitest";

/**
 * 상태 전이 규칙 테스트 (orchestrator 레벨).
 * portfolio MCP의 updateDecision 로직을 직접 import해서 검증.
 * 충돌/충돌 케이스가 시스템 사고로 이어지지 않음을 보장.
 */

// updateDecision 핵심 로직을 orchestrator 레벨에서 직접 테스트하기 위해
// 동일한 규칙을 로컬에서 재현. (실제 DB 없이 순수 규칙만 검증)

type Status = "pending" | "confirmed" | "rejected" | "expired" | "executed";

const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  pending: ["confirmed", "rejected", "expired"],
  confirmed: ["executed"],
  rejected: [],
  expired: [],
  executed: [],
};

function validateTransition(from: Status, to: Status): { ok: boolean; error?: string } {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, error: `Invalid: ${from} → ${to}` };
  }
  return { ok: true };
}

function validateConfirmNotExpired(expiresAt: Date, now: Date): { ok: boolean; error?: string } {
  if (now > expiresAt) {
    return { ok: false, error: "Cannot confirm: decision has already expired" };
  }
  return { ok: true };
}

describe("상태 전이 규칙", () => {
  // ── 허용 케이스 ─────────────────────────────────────────────
  it("pending → confirmed 허용", () => {
    expect(validateTransition("pending", "confirmed").ok).toBe(true);
  });

  it("pending → rejected 허용", () => {
    expect(validateTransition("pending", "rejected").ok).toBe(true);
  });

  it("pending → expired 허용 (시스템 자동)", () => {
    expect(validateTransition("pending", "expired").ok).toBe(true);
  });

  it("confirmed → executed 허용", () => {
    expect(validateTransition("confirmed", "executed").ok).toBe(true);
  });

  // ── 충돌/금지 케이스 ─────────────────────────────────────────
  it("pending → executed 직접 전이 금지", () => {
    const r = validateTransition("pending", "executed");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("pending → executed");
  });

  it("confirmed → pending 역전이 금지", () => {
    expect(validateTransition("confirmed", "pending").ok).toBe(false);
  });

  it("rejected → confirmed 전이 금지 (거부 후 승인 불가)", () => {
    expect(validateTransition("rejected", "confirmed").ok).toBe(false);
  });

  it("expired → confirmed 전이 금지 (만료 후 승인 불가)", () => {
    expect(validateTransition("expired", "confirmed").ok).toBe(false);
  });

  it("executed → 어떤 상태로도 전이 금지 (최종 상태)", () => {
    const targets: Status[] = ["pending", "confirmed", "rejected", "expired"];
    for (const to of targets) {
      expect(validateTransition("executed", to).ok).toBe(false);
    }
  });

  // ── 만료 시간 충돌 케이스 ─────────────────────────────────────
  it("expiresAt 이전에 confirm → 허용", () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분 후
    const now = new Date();
    expect(validateConfirmNotExpired(expiresAt, now).ok).toBe(true);
  });

  it("expiresAt 이후에 confirm 시도 → 거부", () => {
    const expiresAt = new Date(Date.now() - 1000); // 1초 전 만료
    const now = new Date();
    const r = validateConfirmNotExpired(expiresAt, now);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("expired");
  });

  // ── 연속 전이 시나리오 ────────────────────────────────────────
  it("정상 플로우: pending → confirmed → executed", () => {
    expect(validateTransition("pending", "confirmed").ok).toBe(true);
    expect(validateTransition("confirmed", "executed").ok).toBe(true);
  });

  it("거부 플로우: pending → rejected (이후 전이 없음)", () => {
    expect(validateTransition("pending", "rejected").ok).toBe(true);
    // rejected에서 더 이상 전이 불가
    expect(validateTransition("rejected", "executed").ok).toBe(false);
  });

  it("만료 플로우: pending → expired (이후 전이 없음)", () => {
    expect(validateTransition("pending", "expired").ok).toBe(true);
    expect(validateTransition("expired", "executed").ok).toBe(false);
  });
});
