// 페르소나 가중치 자기교정

export type MarketCondition =
  | "bull"    // 상승장
  | "bear"    // 하락장
  | "crisis"  // 위기
  | "neutral";

export type Sector =
  | "semiconductor"  // 반도체
  | "finance"        // 금융
  | "bio"            // 바이오
  | "energy"         // 에너지/정유
  | "consumer"       // 소비재
  | "defense"        // 방산
  | "auto"           // 자동차
  | "tech"           // 기술/IT
  | "global";        // 기본값 (업종 미분류)

export interface PersonaWeight {
  persona: string;
  sector: Sector;
  condition: MarketCondition;
  weight: number;        // 0.0 ~ 1.0
  accuracy: number;      // 누적 적중률
  sampleCount: number;   // 판단 샘플 수 (30 미만이면 기본값 0.2 유지)
  updatedAt: string;
}
