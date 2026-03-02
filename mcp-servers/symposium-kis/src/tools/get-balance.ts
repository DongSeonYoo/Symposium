import type { KisClient } from "../kis-client.js";
import type { KisBalance, KisHolding } from "@symposium/shared-types";

// 잔고 조회: 모의 VTTC8434R / 실전 TTTC8434R
function trId(mode: "paper" | "live"): string {
  return mode === "paper" ? "VTTC8434R" : "TTTC8434R";
}

export async function getBalance(client: KisClient): Promise<KisBalance> {
  const [acctNo, acctSuffix] = client.account.split("-");

  const res = await client.get<{
    output1: Record<string, string>[];
    output2: Record<string, string>[];
  }>(
    "/uapi/domestic-stock/v1/trading/inquire-balance",
    {
      CANO: acctNo ?? "",
      ACNT_PRDT_CD: acctSuffix ?? "01",
      AFHR_FLPR_YN: "N",
      OFL_YN: "",
      INQR_DVSN: "02",
      UNPR_DVSN: "01",
      FUND_STTL_ICLD_YN: "N",
      FNCG_AMT_AUTO_RDPT_YN: "N",
      PRCS_DVSN: "01",
      CTX_AREA_FK100: "",
      CTX_AREA_NK100: "",
    },
    trId(client.mode)
  );

  const summary = res.output2?.[0] ?? {};
  const holdings: KisHolding[] = (res.output1 ?? []).map((o) => ({
    ticker: o.pdno ?? "",
    name: o.prdt_name ?? "",
    quantity: Number(o.hldg_qty),
    avgPrice: Number(o.pchs_avg_pric),
    currentPrice: Number(o.prpr),
    evaluationAmount: Number(o.evlu_amt),
    pnl: Number(o.evlu_pfls_amt),
    pnlRate: Number(o.evlu_pfls_rt),
  }));

  return {
    cash: Number(summary.dnca_tot_amt ?? 0),
    totalEvaluationAmount: Number(summary.tot_evlu_amt ?? 0),
    totalPnl: Number(summary.evlu_pfls_smtl_amt ?? 0),
    totalPnlRate: Number(summary.asst_icdc_erng_rt ?? 0),
    holdings,
  };
}
