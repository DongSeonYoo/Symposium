/**
 * DART 공시 목록 조회 — /list.json 엔드포인트.
 */

import type { DartClient } from "../dart-client.js";
import type { DartDisclosure } from "@symposium/shared-types";

// 공시 유형 코드 매핑
const DISCLOSURE_TYPE_MAP: Record<string, string> = {
  bgm: "사업보고서",
  rpt: "반기보고서",
  oir: "기타경영사항",
  fla: "최대주주변경",
  exc: "거래소공시",
};

function mapDisclosureType(pblntfTy: string): string {
  return DISCLOSURE_TYPE_MAP[pblntfTy] ?? "공시";
}

export async function getDisclosures(
  client: DartClient,
  corpCode: string,
  days = 30
): Promise<DartDisclosure[]> {
  // 기간 계산 (days일 전 ~ 오늘)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);

  const fmt = (d: Date) =>
    d.toISOString().slice(0, 10).replace(/-/g, "");

  const data = await client.get("/list.json", {
    corp_code: corpCode,
    bgn_de: fmt(startDate),
    end_de: fmt(endDate),
    page_count: 20,
  });

  const status = data["status"] as string | undefined;
  if (status && status !== "000") {
    return [];
  }

  const list = data["list"] as Record<string, string>[] | undefined;
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((item) => ({
    ticker: item["stock_code"] ?? corpCode,
    companyName: item["corp_name"] ?? "",
    disclosureType: mapDisclosureType(item["pblntf_ty"] ?? ""),
    title: item["report_nm"] ?? "",
    filedAt: item["rcept_dt"]
      ? `${item["rcept_dt"].slice(0, 4)}-${item["rcept_dt"].slice(4, 6)}-${item["rcept_dt"].slice(6, 8)}T00:00:00.000Z`
      : new Date().toISOString(),
    url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item["rcept_no"] ?? ""}`,
  }));
}
