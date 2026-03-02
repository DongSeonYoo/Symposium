// 포트폴리오 / watchlist

export interface Holding {
  id: string;
  ticker: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice?: number;     // 실시간 조회 시 채워짐
  unrealizedPnl?: number;    // 평가손익
  unrealizedPnlPct?: number; // 평가손익률 (%)
  updatedAt: string;
}

export type WatchlistSource = "manual" | "llm_discovered";

export interface WatchlistItem {
  id: string;
  ticker: string;
  name: string;
  source: WatchlistSource;
  addedAt: string;
}
