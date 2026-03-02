import type { KisClient } from "../kis-client.js";
import type { KisPriceData } from "@symposium/shared-types";

// TR ID: 모의 FHKST01010100 / 실전 FHKST01010100 (동일)
const TR_ID = "FHKST01010100";

export async function getPrice(client: KisClient, ticker: string): Promise<KisPriceData> {
  const res = await client.get<{ output: Record<string, string> }>(
    "/uapi/domestic-stock/v1/quotations/inquire-price",
    { fid_cond_mrkt_div_code: "J", fid_input_iscd: ticker },
    TR_ID
  );

  const o = res.output;
  return {
    ticker,
    name: o.hts_kor_isnm ?? "",
    currentPrice: Number(o.stck_prpr),
    changeRate: Number(o.prdy_ctrt),
    changePrice: Number(o.prdy_vrss),
    volume: Number(o.acml_vol),
    openPrice: Number(o.stck_oprc),
    highPrice: Number(o.stck_hgpr),
    lowPrice: Number(o.stck_lwpr),
    marketCap: Number(o.hts_avls),
    per: Number(o.per),
    pbr: Number(o.pbr),
  };
}
