/**
 * 거시경제 데이터 수집.
 * - FRED API: VIX, DXY, US10Y, WTI  (FRED_API_KEY 필요, 없으면 fallback)
 * - KIS MCP:  USD/KRW 환율, KOSPI 등락률 (kis_get_macro tool)
 */

import type { McpClientManager } from "../mcp/client-manager.js";

export interface MacroContext {
  vix: number;
  us10yYield: number;
  dxy: number;
  usdKrw: number;
  wtiCrude: number;
  kospiChange: number;
}

// ── FRED 기본값 (API 실패 시 fallback) ────────────────────────
const FALLBACK: MacroContext = {
  vix: 18,
  us10yYield: 4.2,
  dxy: 104.5,
  usdKrw: 1330,
  wtiCrude: 75,
  kospiChange: 0,
};

interface FredResponse {
  observations: { value: string; date: string }[];
}

async function fetchFredSeries(seriesId: string, apiKey: string): Promise<number | null> {
  try {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", seriesId);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", "5"); // 최근 5개 중 유효값 탐색

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;

    const data = (await res.json()) as FredResponse;
    // 결측값(".")이 아닌 가장 최근 값 반환
    const obs = data.observations?.find((o) => o.value !== ".");
    return obs ? Number(obs.value) : null;
  } catch {
    return null;
  }
}

/** FRED API로 거시 4개 지표 수집 */
async function fetchFredData(apiKey: string): Promise<{
  vix: number;
  us10yYield: number;
  dxy: number;
  wtiCrude: number;
}> {
  const [vix, us10y, dxy, wti] = await Promise.all([
    fetchFredSeries("VIXCLS", apiKey),
    fetchFredSeries("DGS10", apiKey),
    fetchFredSeries("DTWEXBGS", apiKey),
    fetchFredSeries("DCOILWTICO", apiKey),
  ]);

  return {
    vix:        vix        ?? FALLBACK.vix,
    us10yYield: us10y      ?? FALLBACK.us10yYield,
    dxy:        dxy        ?? FALLBACK.dxy,
    wtiCrude:   wti        ?? FALLBACK.wtiCrude,
  };
}

/** KIS MCP kis_get_macro tool로 USD/KRW + KOSPI 수집 */
async function fetchKisMacro(
  mcp: McpClientManager
): Promise<{ usdKrw: number; kospiChange: number }> {
  try {
    const raw = await mcp.callTool("kis", "kis_get_macro", {}) as {
      usdKrw?: number;
      kospiChange?: number;
    };
    return {
      usdKrw:      raw.usdKrw      ?? FALLBACK.usdKrw,
      kospiChange: raw.kospiChange ?? FALLBACK.kospiChange,
    };
  } catch {
    return { usdKrw: FALLBACK.usdKrw, kospiChange: FALLBACK.kospiChange };
  }
}

/**
 * 거시경제 지표 수집.
 * FRED_API_KEY 없으면 FRED 항목은 fallback 값 사용 (경고 출력).
 */
export async function fetchMacroContext(mcp: McpClientManager): Promise<MacroContext> {
  const fredKey = process.env.FRED_API_KEY;

  const [fredData, kisData] = await Promise.all([
    fredKey
      ? fetchFredData(fredKey)
      : (console.error("[macro] FRED_API_KEY 없음 — 거시 fallback 사용"),
         Promise.resolve({ vix: FALLBACK.vix, us10yYield: FALLBACK.us10yYield, dxy: FALLBACK.dxy, wtiCrude: FALLBACK.wtiCrude })),
    fetchKisMacro(mcp),
  ]);

  return {
    vix:        fredData.vix,
    us10yYield: fredData.us10yYield,
    dxy:        fredData.dxy,
    wtiCrude:   fredData.wtiCrude,
    usdKrw:     kisData.usdKrw,
    kospiChange: kisData.kospiChange,
  };
}
