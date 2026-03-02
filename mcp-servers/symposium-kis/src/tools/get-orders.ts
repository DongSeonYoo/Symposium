import type { KisClient } from "../kis-client.js";

export interface KisOrderRecord {
  orderId: string;
  ticker: string;
  name: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  filledQuantity: number;
  status: string;
  orderedAt: string;
}

// 당일 주문 체결 내역: 모의 VTTC8001R / 실전 TTTC8001R
function trId(mode: "paper" | "live"): string {
  return mode === "paper" ? "VTTC8001R" : "TTTC8001R";
}

export async function getOrders(client: KisClient): Promise<KisOrderRecord[]> {
  const [acctNo, acctSuffix] = client.account.split("-");

  const res = await client.get<{ output1: Record<string, string>[] }>(
    "/uapi/domestic-stock/v1/trading/inquire-daily-ccld",
    {
      CANO: acctNo ?? "",
      ACNT_PRDT_CD: acctSuffix ?? "01",
      INQR_STRT_DT: todayStr(),
      INQR_END_DT: todayStr(),
      SLL_BUY_DVSN_CD: "00", // 00: 전체
      INQR_DVSN: "00",
      PDNO: "",
      CCLD_DVSN: "01",
      ORD_GNO_BRNO: "",
      ODNO: "",
      INQR_DVSN_3: "00",
      INQR_DVSN_1: "",
      CTX_AREA_FK100: "",
      CTX_AREA_NK100: "",
    },
    trId(client.mode)
  );

  return (res.output1 ?? []).map((o) => ({
    orderId: o.odno ?? "",
    ticker: o.pdno ?? "",
    name: o.prdt_name ?? "",
    side: o.sll_buy_dvsn_cd === "02" ? "BUY" : "SELL",
    quantity: Number(o.ord_qty),
    price: Number(o.ord_unpr),
    filledQuantity: Number(o.tot_ccld_qty),
    status: o.ord_tmd ?? "",
    orderedAt: o.ord_dt ?? "",
  }));
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}
