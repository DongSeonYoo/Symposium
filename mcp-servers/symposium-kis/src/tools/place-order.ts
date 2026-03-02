import type { KisClient } from "../kis-client.js";
import type { KisOrderRequest, OrderResult } from "@symposium/shared-types";

// 주문: 모의 VTTC0802U(매수) VTTC0801U(매도) / 실전 TTTC0802U TTTC0801U
function trId(client: KisClient, side: "BUY" | "SELL"): string {
  if (client.mode === "paper") {
    return side === "BUY" ? "VTTC0802U" : "VTTC0801U";
  }
  return side === "BUY" ? "TTTC0802U" : "TTTC0801U";
}

export async function placeOrder(
  client: KisClient,
  req: KisOrderRequest
): Promise<OrderResult> {
  // 안전장치: confirmed 플래그 재확인
  if (req.confirmed !== true) {
    throw new Error("kis_place_order: confirmed 플래그가 true가 아닙니다. 주문을 거부합니다.");
  }

  // 실전 모드 추가 경고 로그
  if (client.mode === "live") {
    console.error(`[KIS] ⚠️  실전 주문 실행: ${req.side} ${req.ticker} ${req.quantity}주 @${req.price}`);
  }

  const [acctNo, acctSuffix] = client.account.split("-");
  const orderType = req.price === 0 ? "01" : "00"; // 01: 시장가, 00: 지정가

  const res = await client.post<{ output: Record<string, string> }>(
    "/uapi/domestic-stock/v1/trading/order-cash",
    {
      CANO: acctNo ?? "",
      ACNT_PRDT_CD: acctSuffix ?? "01",
      PDNO: req.ticker,
      ORD_DVSN: orderType,
      ORD_QTY: String(req.quantity),
      ORD_UNPR: req.price === 0 ? "0" : String(req.price),
    },
    trId(client, req.side)
  );

  const o = res.output;
  return {
    orderId: o.ODNO ?? "",
    ticker: req.ticker,
    side: req.side,
    quantity: req.quantity,
    price: req.price,
    status: "accepted",
    message: o.ORD_TMD ? `주문 접수 완료 (${o.ORD_TMD})` : "주문 접수 완료",
    executedAt: new Date().toISOString(),
  };
}
