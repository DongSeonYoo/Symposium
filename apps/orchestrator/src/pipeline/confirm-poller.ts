import type { DbClient } from "@symposium/db";
import { decisions, decisionEvents, eq, and, sql } from "@symposium/db";

export type OrderExecutor = (decisionId: string) => Promise<void>;

/**
 * 30초마다 pending decisions를 폴링:
 * - 만료된 것 → expired 전이 + 감사 로그
 * - confirmed 된 것 → 주문 실행
 * 동시 실행 방지를 위해 isRunning 플래그 사용.
 */
export class ConfirmPoller {
  private isRunning = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DbClient,
    private readonly executeOrder: OrderExecutor,
    private readonly intervalMs = 30_000
  ) {}

  start(): void {
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 테스트에서 직접 호출 가능하도록 public */
  async tick(): Promise<void> {
    if (this.isRunning) return; // 재진입 방지
    this.isRunning = true;
    try {
      await this.expireStale();
      await this.executeConfirmed();
    } finally {
      this.isRunning = false;
    }
  }

  /** pending 중 만료된 판단 → expired 전이 */
  private async expireStale(): Promise<void> {
    const stale = await this.db
      .select({ id: decisions.id, status: decisions.status })
      .from(decisions)
      .where(
        and(
          eq(decisions.status, "pending"),
          sql`${decisions.expiresAt} < NOW()`
        )
      );

    for (const row of stale) {
      // 레이스 컨디션 방지: WHERE status='pending' 조건부 UPDATE
      const [updated] = await this.db
        .update(decisions)
        .set({ status: "expired" })
        .where(and(eq(decisions.id, row.id), eq(decisions.status, "pending")))
        .returning({ id: decisions.id });

      if (updated) {
        await this.db.insert(decisionEvents).values({
          decisionId: row.id,
          actor: "system",
          fromStatus: "pending",
          toStatus: "expired",
          reason: "30분 타이머 만료",
        });
      }
    }
  }

  /** confirmed 판단 → 주문 실행 */
  private async executeConfirmed(): Promise<void> {
    const confirmed = await this.db
      .select({ id: decisions.id })
      .from(decisions)
      .where(eq(decisions.status, "confirmed"));

    for (const row of confirmed) {
      await this.executeOrder(row.id);
    }
  }
}
