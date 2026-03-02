/**
 * 시장 데이터 수집 파이프라인.
 * KIS(시세) + DART(재무) + NEWS(감성) MCP 호출.
 * 각 소스 실패 시 해당 소스만 degrade — 전체 중단 없음.
 */

import type { McpClientManager } from "../mcp/client-manager.js";
import type { DartFinancial, DartDisclosure, NewsSentiment } from "@symposium/shared-types";
import { fetchMacroContext } from "./macro-fetcher.js";

export interface CollectedData {
  ticker: string;
  name: string;
  marketData: {
    currentPrice: number;
    changeRate: number;
    volume: number;
    per: number;
    pbr: number;
    // 추가 필드
    openPrice?: number;
    highPrice?: number;
    lowPrice?: number;
  };
  macroContext: {
    vix: number;
    us10yYield: number;
    dxy: number;
    usdKrw: number;
    wtiCrude: number;
    kospiChange: number;
  };
  // 새로 추가
  fundamental: {
    financial: DartFinancial | null;
    disclosures: DartDisclosure[];
  };
  sentiment: NewsSentiment | null;
  // 수집 품질 메타
  sources: {
    kis: "ok" | "degraded";
    dart: "ok" | "degraded";
    news: "ok" | "degraded";
  };
}

export async function collectMarketData(
  ticker: string,
  name: string,
  mcp: McpClientManager
): Promise<CollectedData> {
  // ── 1. KIS 시세 ────────────────────────────────────────────
  let marketData: CollectedData["marketData"] = {
    currentPrice: 70_000,
    changeRate: 0,
    volume: 0,
    per: 0,
    pbr: 0,
  };
  let kisSource: "ok" | "degraded" = "ok";

  try {
    const priceRaw = await mcp.callTool("kis", "kis_get_price", { ticker }) as Record<string, unknown>;
    marketData = {
      currentPrice: Number(priceRaw["currentPrice"] ?? 70_000),
      changeRate: Number(priceRaw["changeRate"] ?? 0),
      volume: Number(priceRaw["volume"] ?? 0),
      per: Number(priceRaw["per"] ?? 0),
      pbr: Number(priceRaw["pbr"] ?? 0),
      openPrice: priceRaw["openPrice"] !== undefined ? Number(priceRaw["openPrice"]) : undefined,
      highPrice: priceRaw["highPrice"] !== undefined ? Number(priceRaw["highPrice"]) : undefined,
      lowPrice: priceRaw["lowPrice"] !== undefined ? Number(priceRaw["lowPrice"]) : undefined,
    };
  } catch (err) {
    console.error(`[collect] ⚠️ KIS degraded for ${ticker}: ${err}`);
    kisSource = "degraded";
  }

  // ── 2. DART 재무 ────────────────────────────────────────────
  // Phase 3에서 FRED API 연결 예정 — 현재 거시경제 데이터는 하드코딩 유지
  let financial: DartFinancial | null = null;
  let disclosures: DartDisclosure[] = [];
  let dartSource: "ok" | "degraded" = "ok";

  try {
    // 먼저 corpCode 조회
    const companyRaw = await mcp.callTool("dart", "dart_search_company", { query: ticker }) as { corpCode: string; corpName: string; ticker: string }[];
    const corpCode = Array.isArray(companyRaw) && companyRaw.length > 0
      ? companyRaw[0]!.corpCode
      : ticker;

    const currentYear = new Date().getFullYear();

    // 재무제표 조회 (전년도 연간)
    const financialRaw = await mcp.callTool("dart", "dart_get_financial", {
      corpCode,
      year: currentYear - 1,
      quarter: 4,
    }) as DartFinancial;
    financial = financialRaw;

    // 공시 목록 조회
    const disclosuresRaw = await mcp.callTool("dart", "dart_get_disclosures", {
      corpCode,
      days: 30,
    }) as DartDisclosure[];
    disclosures = Array.isArray(disclosuresRaw) ? disclosuresRaw : [];
  } catch (err) {
    console.error(`[collect] ⚠️ DART degraded for ${ticker}: ${err}`);
    dartSource = "degraded";
    financial = null;
    disclosures = [];
  }

  // ── 3. 뉴스 감성 ─────────────────────────────────────────
  let sentiment: NewsSentiment | null = null;
  let newsSource: "ok" | "degraded" = "ok";

  try {
    const sentimentRaw = await mcp.callTool("news", "news_get_sentiment", {
      ticker,
      name,
    }) as NewsSentiment;
    sentiment = sentimentRaw;
  } catch (err) {
    console.error(`[collect] ⚠️ NEWS degraded for ${ticker}: ${err}`);
    newsSource = "degraded";
  }

  // ── 4. 거시경제 — FRED API (VIX/US10Y/DXY/WTI) + KIS MCP (USD/KRW, KOSPI) ──
  const macroContext = await fetchMacroContext(mcp);

  return {
    ticker,
    name,
    marketData,
    macroContext,
    fundamental: {
      financial,
      disclosures,
    },
    sentiment,
    sources: {
      kis: kisSource,
      dart: dartSource,
      news: newsSource,
    },
  };
}

/**
 * CollectedData → reasons 4개 필드 문자열 변환.
 * portfolio_save_decision의 reasons 파라미터에 직접 사용.
 */
export function buildReasons(collected: CollectedData): {
  technical: string;
  fundamental: string;
  sentiment: string;
  macro: string;
} {
  // technical: KIS 시세 기반
  const m = collected.marketData;
  const kisTag = collected.sources.kis === "degraded" ? " [degraded]" : "";
  const technical = collected.sources.kis === "degraded"
    ? "KIS 시세 수집 실패 — 기술적 데이터 없음"
    : `현재가 ${m.currentPrice.toLocaleString()}원, 등락률 ${m.changeRate > 0 ? "+" : ""}${m.changeRate}%, 거래량 ${m.volume.toLocaleString()}주, PER ${m.per}, PBR ${m.pbr}${kisTag}`;

  // fundamental: DART 재무제표 + 공시
  let fundamental: string;
  if (collected.sources.dart === "degraded") {
    fundamental = "DART 재무 수집 실패 — 펀더멘털 데이터 없음";
  } else {
    const f = collected.fundamental.financial;
    const disclosureCount = collected.fundamental.disclosures.length;
    if (!f) {
      fundamental = `재무제표 없음. 최근 30일 공시 ${disclosureCount}건`;
    } else {
      const fmt = (n: number) => (n / 1_000_000_000).toFixed(0) + "억";
      fundamental = `매출 ${fmt(f.revenue)}, 영업이익 ${fmt(f.operatingProfit)}, 순이익 ${fmt(f.netIncome)}, ROE ${f.roe.toFixed(1)}%, 부채비율 ${f.debtRatio.toFixed(0)}%, EPS ${f.eps.toLocaleString()}원. 최근 30일 공시 ${disclosureCount}건`;
    }
  }

  // sentiment: 뉴스 감성
  let sentiment: string;
  if (collected.sources.news === "degraded" || !collected.sentiment) {
    sentiment = "뉴스 감성 수집 실패 — 센티멘트 데이터 없음";
  } else {
    const s = collected.sentiment;
    const scoreStr = s.score > 0 ? `+${s.score.toFixed(2)}` : s.score.toFixed(2);
    sentiment = `감성 ${s.label}(${scoreStr}), 분석 기사 ${s.articleCount}건. ${s.summary}`;
  }

  // macro: 거시경제 (FRED API + KIS MCP)
  const mac = collected.macroContext;
  const macro = `VIX ${mac.vix}, 미국10Y ${mac.us10yYield}%, DXY ${mac.dxy}, USD/KRW ${mac.usdKrw}, WTI ${mac.wtiCrude}$, KOSPI ${mac.kospiChange > 0 ? "+" : ""}${mac.kospiChange}%`;

  return { technical, fundamental, sentiment, macro };
}
