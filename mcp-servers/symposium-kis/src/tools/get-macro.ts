import type { KisClient } from "../kis-client.js";

export interface KisMacroData {
  usdKrw: number;     // USD/KRW 환율
  kospiPrice: number; // KOSPI 지수
  kospiChange: number; // KOSPI 전일대비 등락률 (%)
}

// TR ID: 외화환율조회 (실전/모의 공통)
const FX_TR_ID = "FHKUP03500100";
// TR ID: 국내업종/지수 현재가 (실전/모의 공통)
const INDEX_TR_ID = "FHPUP03500100";

export async function getMacro(client: KisClient): Promise<KisMacroData> {
  const [fxRes, indexRes] = await Promise.all([
    client.get<{ output: Record<string, string> }>(
      "/uapi/domestic-stock/v1/quotations/inquire-daily-exchrate",
      { fid_cond_mrkt_div_code: "X", fid_input_iscd: "USD" },
      FX_TR_ID
    ).catch(() => null),
    client.get<{ output: Record<string, string> }>(
      "/uapi/domestic-stock/v1/quotations/inquire-index-price",
      { fid_cond_mrkt_div_code: "U", fid_input_iscd: "0001" }, // 0001 = KOSPI
      INDEX_TR_ID
    ).catch(() => null),
  ]);

  const usdKrw = fxRes?.output?.ovrs_nmix_prpr
    ? Number(fxRes.output.ovrs_nmix_prpr)
    : 1330;

  const kospiPrice = indexRes?.output?.bstp_nmix_prpr
    ? Number(indexRes.output.bstp_nmix_prpr)
    : 2500;

  const kospiChange = indexRes?.output?.bstp_nmix_prdy_ctrt
    ? Number(indexRes.output.bstp_nmix_prdy_ctrt)
    : 0;

  return { usdKrw, kospiPrice, kospiChange };
}
