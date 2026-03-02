// 핵심 매매 판단 타입

import type { OrderResult } from "./kis.js";

export type Action = "BUY" | "SELL" | "HOLD";

export type DecisionStatus =
  | "pending"    // Confirm 대기 중
  | "confirmed"  // 사용자 승인
  | "rejected"   // 사용자 거부
  | "expired"    // 30분 만료
  | "executed";  // 주문 실행 완료

export type PersonaId =
  | "buffett"
  | "soros"
  | "dalio"
  | "lynch"
  | "parkhyunju";

export interface PersonaVote {
  persona: PersonaId;
  action: Action;
  confidence: number;       // 0~100
  keyArgument: string;      // 핵심 논거 1줄
  weight: number;           // 현재 적용 가중치 (자기교정 반영)
}

export interface TradingDecision {
  ticker: string;           // 종목코드 (e.g. '005930')
  name: string;             // 종목명
  action: Action;
  quantity: number;
  price: number;            // 지정가. 0이면 시장가
  confidence: number;       // 0~100
  stopLoss: number;         // 손절가
  takeProfitPrice: number;  // 목표 수익가
  reasons: {
    technical: string[];
    fundamental: string[];
    sentiment: string[];
    macro: string[];
  };
  risks: string[];
  personaVotes: PersonaVote[];
  debateSummary: string;
  expiresAt: string;        // ISO8601, 기본 30분 후
}

// DB 저장 시 사용 (id, status 포함)
export interface DecisionRecord extends TradingDecision {
  id: string;
  status: DecisionStatus;
  createdAt: string;
  executedAt?: string;
  executionResult?: OrderResult;
}
