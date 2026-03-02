/**
 * Phase 1 stub: 실제 MCP 서버 연동 없이 고정 데이터 반환.
 * Phase 2에서 실제 KIS/DART/NEWS MCP 클라이언트로 교체 예정.
 */

export interface CollectedData {
  ticker: string;
  name: string;
  marketData: {
    currentPrice: number;
    changeRate: number;
    volume: number;
    per: number;
    pbr: number;
  };
  macroContext: {
    vix: number;
    us10yYield: number;
    dxy: number;
    usdKrw: number;
    wtiCrude: number;
    kospiChange: number;
  };
}

export async function collectMarketData(
  ticker: string,
  name: string
): Promise<CollectedData> {
  // Phase 1 stub: 고정값 반환
  return {
    ticker,
    name,
    marketData: {
      currentPrice: 70_000,
      changeRate: 0.5,
      volume: 12_000_000,
      per: 15.2,
      pbr: 1.3,
    },
    macroContext: {
      vix: 18,
      us10yYield: 4.2,
      dxy: 104.5,
      usdKrw: 1330,
      wtiCrude: 75,
      kospiChange: 0.3,
    },
  };
}
