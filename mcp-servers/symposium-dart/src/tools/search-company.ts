/**
 * DART 기업 검색 — /company.json 엔드포인트.
 * 기업명 또는 종목코드로 corpCode 조회.
 */

import type { DartClient } from "../dart-client.js";

export interface CompanyResult {
  corpCode: string;
  corpName: string;
  ticker: string;
}

export async function searchCompany(
  client: DartClient,
  query: string
): Promise<CompanyResult[]> {
  // DART company.json은 corp_name 또는 stock_code로 검색 가능
  const data = await client.get("/company.json", {
    corp_name: query,
  });

  const status = data["status"] as string | undefined;
  if (status && status !== "000") {
    // 검색 결과 없음
    return [];
  }

  // 단일 회사 결과 반환
  const corpCode = data["corp_code"] as string | undefined;
  const corpName = data["corp_name"] as string | undefined;
  const stockCode = data["stock_code"] as string | undefined;

  if (!corpCode || !corpName) {
    return [];
  }

  return [
    {
      corpCode,
      corpName,
      ticker: stockCode ?? query,
    },
  ];
}
