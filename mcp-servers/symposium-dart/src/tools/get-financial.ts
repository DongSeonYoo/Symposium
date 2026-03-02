/**
 * DART 단일회사 전체 재무제표 조회 — /fnlttSinglAcntAll.json 엔드포인트.
 */

import type { DartClient } from "../dart-client.js";
import type { DartFinancial } from "@symposium/shared-types";

// reprt_code 매핑: Q1=11013, Q2=11012, Q3=11014, Q4=11011
const REPRT_CODE_MAP: Record<number, string> = {
  1: "11013",
  2: "11012",
  3: "11014",
  4: "11011",
};

// 계정명 → 필드 매핑 (CFS: 연결재무제표 우선, OFS: 별도재무제표 fallback)
const ACCOUNT_NM_MAP: Record<string, keyof Pick<
  DartFinancial,
  "revenue" | "operatingProfit" | "netIncome" | "totalAssets" | "totalLiabilities" | "totalEquity" | "eps"
>> = {
  "매출액": "revenue",
  "수익(매출액)": "revenue",
  "영업이익": "operatingProfit",
  "영업이익(손실)": "operatingProfit",
  "당기순이익": "netIncome",
  "당기순이익(손실)": "netIncome",
  "자산총계": "totalAssets",
  "부채총계": "totalLiabilities",
  "자본총계": "totalEquity",
  "기본주당이익(손실)": "eps",
  "기본주당순이익(손실)": "eps",
};

function parseAmount(val: string | undefined): number {
  if (!val) return 0;
  // DART 금액은 천원 단위 → 원 단위로 변환 (×1000)
  const cleaned = val.replace(/,/g, "");
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num * 1000;
}

export async function getFinancial(
  client: DartClient,
  corpCode: string,
  year: number,
  quarter: 1 | 2 | 3 | 4 = 4
): Promise<DartFinancial> {
  const reprtCode = REPRT_CODE_MAP[quarter] ?? "11011";

  const data = await client.get("/fnlttSinglAcntAll.json", {
    corp_code: corpCode,
    bsns_year: year,
    reprt_code: reprtCode,
    fs_div: "CFS", // 연결재무제표 우선
  });

  const status = data["status"] as string | undefined;

  let list: Record<string, string>[] = [];
  if (status === "000") {
    list = (data["list"] as Record<string, string>[] | undefined) ?? [];
  }

  // 별도재무제표로 fallback (연결재무제표 없는 경우)
  if (list.length === 0) {
    const dataOfs = await client.get("/fnlttSinglAcntAll.json", {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reprtCode,
      fs_div: "OFS",
    });
    if ((dataOfs["status"] as string) === "000") {
      list = (dataOfs["list"] as Record<string, string>[] | undefined) ?? [];
    }
  }

  // 계정과목별 금액 추출
  const extracted: Partial<Record<keyof typeof ACCOUNT_NM_MAP, number>> & {
    companyName?: string;
  } = {};

  for (const item of list) {
    if (!extracted.companyName && item["corp_name"]) {
      extracted.companyName = item["corp_name"];
    }
    const field = ACCOUNT_NM_MAP[item["account_nm"] ?? ""];
    if (field && !extracted[field]) {
      extracted[field] = parseAmount(item["thstrm_amount"]);
    }
  }

  const revenue = extracted["revenue"] ?? 0;
  const operatingProfit = extracted["operatingProfit"] ?? 0;
  const netIncome = extracted["netIncome"] ?? 0;
  const totalAssets = extracted["totalAssets"] ?? 0;
  const totalLiabilities = extracted["totalLiabilities"] ?? 0;
  const totalEquity = extracted["totalEquity"] ?? 0;
  const eps = extracted["eps"] ?? 0;

  const roe = totalEquity !== 0 ? (netIncome / totalEquity) * 100 : 0;
  const debtRatio = totalEquity !== 0 ? (totalLiabilities / totalEquity) * 100 : 0;

  return {
    ticker: corpCode,
    companyName: extracted.companyName ?? corpCode,
    year,
    quarter,
    revenue,
    operatingProfit,
    netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    eps,
    roe: Math.round(roe * 100) / 100,
    debtRatio: Math.round(debtRatio * 100) / 100,
  };
}
