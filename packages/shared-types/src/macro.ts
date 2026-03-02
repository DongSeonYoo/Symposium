// 거시경제 컨텍스트 — 모든 페르소나에게 공통 주입

export interface NewsItem {
  title: string;
  source: string;
  publishedAt: string; // ISO8601
  url: string;
  snippet: string;
}

export interface NewsSentiment {
  ticker: string;
  score: number;        // -1.0 ~ 1.0 (negative ~ positive)
  label: "positive" | "neutral" | "negative";
  articleCount: number;
  summary: string;      // 감성 요약 한 줄
  items: NewsItem[];    // 분석에 사용된 기사 목록
}

export interface MacroContext {
  vix: number;                  // 공포탐욕지수
  us10yYield: number;           // 미국채 10년물 금리 (%)
  dxy: number;                  // 달러인덱스
  usdKrw: number;               // 원달러 환율
  wtiCrude: number;             // WTI 유가 (USD)
  gold: number;                 // 금 가격 (USD/oz)
  kospiChange: number;          // KOSPI 전일 대비 등락률 (%)
  recentFedStatement: string;   // 최근 Fed 발언 요약
  recentBokStatement: string;   // 최근 한국은행 발언 요약
  collectedAt: string;          // 수집 시각 ISO8601
}

// 위기 모드 트리거 체크 결과
export interface CrisisCheckResult {
  isCrisis: boolean;
  triggers: {
    vixSpike: boolean;     // VIX > 40 또는 단기 +30%
    oilSpike: boolean;     // WTI 단기 +10%
    dxyShock: boolean;     // DXY 단기 ±3%
    newsAlert: boolean;    // 전쟁/위기 키워드
    circuitBreaker: boolean; // KOSPI 서킷브레이커
  };
  reason: string;
}
