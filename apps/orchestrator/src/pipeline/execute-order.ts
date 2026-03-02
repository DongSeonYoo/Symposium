import type { DbClient } from "@symposium/db";
import { decisions, decisionEvents, eq, and, sql } from "@symposium/db";
import type { McpClientManager } from "../mcp/client-manager.js";

// db는 decision 조회 및 일일 손실 계산 전용 (상태 쓰기는 모두 portfolio MCP 경유)

// ── 리스크 한도 상수 ────────────────────────────────────────
const MAX_POSITION_RATIO = 0.20;   // 1종목 최대 포트폴리오 20%
const MAX_DAILY_LOSS_AMOUNT_RATE = -0.03; // 일일 손실 한도 -3% (포트폴리오 대비)

export type OrderGuard =
  | { ok: true }
  | { ok: false; reason: string };

// ── 안전장치 1: KIS_MODE 확인 ────────────────────────────────
export function checkKisMode(): OrderGuard {
  const mode = process.env.KIS_MODE;
  if (mode !== "paper" && mode !== "live" && mode !== "mock") {
    return { ok: false, reason: `KIS_MODE 환경변수 미설정 또는 invalid: "${mode}"` };
  }
  return { ok: true };
}

// ── 안전장치 2: 집중도 + 일일 손실 체크 ──────────────────────
// KIS API는 todayPnlRate를 직접 제공하지 않으므로
// 일일 손실은 DB의 오늘 executed 판단들의 orderResult.pnl 합산으로 계산.
// pnl 데이터가 없는 경우 0으로 간주 (fail-open) — KIS API 한계 명시.
export function checkRiskLimits(params: {
  side: "BUY" | "SELL";
  orderAmount: number;          // 주문 금액 (quantity × price)
  totalPortfolioValue: number;
  todayRealizedPnl: number;     // 오늘 실현손익 합산 (DB 기반, 없으면 0)
}): OrderGuard {
  // 집중도 한도는 BUY에만 적용 (SELL은 리스크 감소 방향)
  if (params.side === "BUY" && params.totalPortfolioValue > 0) {
    const positionRatio = params.orderAmount / params.totalPortfolioValue;
    if (positionRatio > MAX_POSITION_RATIO) {
      return {
        ok: false,
        reason: `1종목 비중 초과: ${(positionRatio * 100).toFixed(1)}% > ${MAX_POSITION_RATIO * 100}%`,
      };
    }
  }

  // 일일 손실 한도: 오늘 실현손익 / 총 포트폴리오 가치
  if (params.totalPortfolioValue > 0) {
    const dailyLossRate = params.todayRealizedPnl / params.totalPortfolioValue;
    if (dailyLossRate < MAX_DAILY_LOSS_AMOUNT_RATE) {
      return {
        ok: false,
        reason: `일일 손실 한도 초과: ${(dailyLossRate * 100).toFixed(2)}% < ${MAX_DAILY_LOSS_AMOUNT_RATE * 100}%`,
      };
    }
  }

  return { ok: true };
}

// ── KST 기준 오늘 자정 계산 ──────────────────────────────────
// Railway 서버 타임존에 관계없이 KST(UTC+9) 거래일 기준으로 고정
export function getKstTodayStart(): Date {
  const now = new Date();
  // KST 오프셋: UTC+9 = 9 * 60 * 60 * 1000 ms
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  // KST 기준 자정 (년/월/일만 취하고 시분초 = 0)
  const kstMidnight = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate())
  );
  // UTC로 변환해서 반환 (DB 쿼리에 사용)
  return new Date(kstMidnight.getTime() - KST_OFFSET_MS);
}

// ── 오늘 실현손익 계산 (DB 기반) ─────────────────────────────
// KIS API가 당일 손익을 직접 제공하지 않으므로 DB orderResult.pnl 합산으로 대체.
// pnl 미기록(체결 결과 파싱 미완성) 시 0 누적 → fail-open (Phase 2: KIS 체결 pnl 파싱 추가 예정).
// 신뢰도 경고: executed 수 대비 pnl 기록 수를 비교해 데이터 품질 로깅.
export async function calcTodayRealizedPnl(db: DbClient): Promise<number> {
  const todayStart = getKstTodayStart();

  const rows = await db
    .select({ orderResult: decisions.orderResult })
    .from(decisions)
    .where(
      and(
        eq(decisions.status, "executed"),
        sql`${decisions.executedAt} >= ${todayStart}`
      )
    );

  let pnlSum = 0;
  let pnlRecordedCount = 0;

  for (const row of rows) {
    const pnl = (row.orderResult as Record<string, unknown> | null)?.["pnl"];
    if (typeof pnl === "number") {
      pnlSum += pnl;
      pnlRecordedCount++;
    }
    // pnl 없거나 비숫자면 0 누적 (fail-open)
  }

  // 데이터 신뢰도 경고: pnl 기록률이 50% 미만이면 경고 로그
  if (rows.length > 0 && pnlRecordedCount < rows.length / 2) {
    console.error(
      `[execute-order] ⚠️  일일 손실 계산 신뢰도 낮음: ` +
      `${pnlRecordedCount}/${rows.length}개만 pnl 기록됨. ` +
      `Phase 2에서 KIS 체결 결과 pnl 파싱 필요.`
    );
  }

  return pnlSum;
}

// ── 메인: 주문 실행 ───────────────────────────────────────────
export async function executeOrder(
  db: DbClient,
  mcp: McpClientManager,
  decisionId: string
): Promise<void> {
  // 1. 판단 조회 — confirmed 상태 재확인
  const [decision] = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.id, decisionId), eq(decisions.status, "confirmed")));

  if (!decision) {
    console.error(`[execute-order] decision not found or not confirmed: ${decisionId}`);
    return;
  }

  // HOLD 판단은 주문 경로로 진입하지 않음
  if (decision.action === "HOLD") {
    await rejectOrder(mcp, decisionId, "system", "HOLD 판단 — 주문 없음");
    return;
  }

  // 2. KIS_MODE 안전장치
  const modeGuard = checkKisMode();
  if (!modeGuard.ok) {
    await rejectOrder(mcp, decisionId, "system", modeGuard.reason);
    console.error(`[execute-order] KIS_MODE guard failed: ${modeGuard.reason}`);
    return;
  }

  // 3. 잔고 조회 + 일일 손실 계산 → 리스크 한도 체크
  let balanceResult: Record<string, unknown>;
  try {
    balanceResult = await mcp.callTool("kis", "kis_get_balance", {}) as Record<string, unknown>;
  } catch (err) {
    await rejectOrder(mcp, decisionId, "system", `잔고 조회 실패: ${String(err)}`);
    return;
  }

  const totalValue = Number(balanceResult["totalEvaluationAmount"] ?? 0);
  const orderPrice = Number(decision.price);
  const quantity = Number(decision.quantity);
  const orderAmount = orderPrice * quantity;
  const side = decision.action as "BUY" | "SELL";

  // 일일 실현손익: DB executed 판단들의 orderResult.pnl 합산
  // KIS API가 todayPnlRate를 직접 제공하지 않으므로 DB 기반으로 계산
  // 오늘 첫 주문이거나 pnl 미기록 시 0 (fail-open, KIS API 한계)
  const todayRealizedPnl = await calcTodayRealizedPnl(db);

  const riskGuard = checkRiskLimits({ side, orderAmount, totalPortfolioValue: totalValue, todayRealizedPnl });
  if (!riskGuard.ok) {
    await rejectOrder(mcp, decisionId, "system", riskGuard.reason);
    console.error(`[execute-order] risk guard failed: ${riskGuard.reason}`);
    return;
  }

  // 4. 주문 실행 — confirmed: true 필수 (MCP 서버에서도 재검증)
  let orderResult: Record<string, unknown>;
  try {
    orderResult = await mcp.callTool("kis", "kis_place_order", {
      ticker: decision.ticker,
      side: decision.action,
      quantity,
      price: orderPrice,
      orderType: orderPrice === 0 ? "01" : "00",
      confirmed: true,          // 안전장치 플래그
    }) as Record<string, unknown>;
  } catch (err) {
    await rejectOrder(mcp, decisionId, "system", `주문 실패: ${String(err)}`);
    console.error(`[execute-order] place order failed: ${err}`);
    return;
  }

  // 5. executed 전이 — portfolio MCP 경유 (상태 전이 규칙 중앙 강제)
  await mcp.callTool("portfolio", "portfolio_update_decision", {
    id: decisionId,
    status: "executed",
    actor: "orchestrator",
    reason: `주문 체결: ${orderResult["orderId"] ?? ""}`,
    orderResult,
  });
  console.error(`[execute-order] executed: ${decisionId}`);
}

// ── 헬퍼: 비주문 경로 종료 — portfolio MCP 경유 ───────────────
async function rejectOrder(
  mcp: McpClientManager,
  decisionId: string,
  actor: "orchestrator" | "system",
  reason: string
): Promise<void> {
  await mcp.callTool("portfolio", "portfolio_update_decision", {
    id: decisionId,
    status: "rejected",
    actor,
    reason,
  });
}
