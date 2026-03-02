import type { KisClient } from "../kis-client.js";

export interface CancelOrderRequest {
  orderId: string;
  ticker: string;
  quantity: number;
}

// 주문 취소: 모의 VTTC0803U / 실전 TTTC0803U
function trId(mode: "paper" | "live"): string {
  return mode === "paper" ? "VTTC0803U" : "TTTC0803U";
}

export async function cancelOrder(
  client: KisClient,
  req: CancelOrderRequest
): Promise<{ success: boolean; message: string }> {
  const [acctNo, acctSuffix] = client.account.split("-");

  await client.post(
    "/uapi/domestic-stock/v1/trading/order-rvsecncl",
    {
      CANO: acctNo ?? "",
      ACNT_PRDT_CD: acctSuffix ?? "01",
      KRX_FWDG_ORD_ORGNO: "",
      ORGN_ODNO: req.orderId,
      ORD_DVSN: "00",
      RVSE_CNCL_DVSN_CD: "02", // 02: 취소
      ORD_QTY: String(req.quantity),
      ORD_UNPR: "0",
      QTY_ALL_ORD_YN: "Y",
    },
    trId(client.mode)
  );

  return { success: true, message: `주문 ${req.orderId} 취소 완료` };
}
