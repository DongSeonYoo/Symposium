import type { KisClient } from "../kis-client.js";
import type { KisOhlcv } from "@symposium/shared-types";

// 일봉: 모의/실전 동일
const TR_ID = "FHKST01010400";

export async function getOhlcv(
  client: KisClient,
  ticker: string,
  days = 30
): Promise<KisOhlcv[]> {
  const today = new Date();
  const end = formatDate(today);
  const start = formatDate(new Date(today.getTime() - days * 24 * 60 * 60 * 1000));

  const res = await client.get<{ output2: Record<string, string>[] }>(
    "/uapi/domestic-stock/v1/quotations/inquire-daily-price",
    {
      fid_cond_mrkt_div_code: "J",
      fid_input_iscd: ticker,
      fid_input_date_1: start,
      fid_input_date_2: end,
      fid_period_div_code: "D", // 일봉
      fid_org_adj_prc: "0",     // 수정주가
    },
    TR_ID
  );

  return (res.output2 ?? []).map((o) => ({
    date: o.stck_bsop_date ?? "",
    open: Number(o.stck_oprc),
    high: Number(o.stck_hgpr),
    low: Number(o.stck_lwpr),
    close: Number(o.stck_clpr),
    volume: Number(o.acml_vol),
  }));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
