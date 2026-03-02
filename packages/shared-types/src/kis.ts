// KIS API 요청/응답 타입

export type OrderType = "00" | "01"; // 00: 지정가, 01: 시장가
export type OrderSide = "BUY" | "SELL";

// kis_get_price 응답
export interface KisPriceData {
  ticker: string;
  name: string;
  currentPrice: number;
  changeRate: number;       // 등락률 (%)
  changePrice: number;      // 등락가
  volume: number;           // 거래량
  openPrice: number;
  highPrice: number;        // 당일 고가
  lowPrice: number;         // 당일 저가
  marketCap: number;        // 시가총액
  per: number;
  pbr: number;
}

// kis_get_ohlcv 응답 (단일 봉)
export interface KisOhlcv {
  date: string;             // YYYYMMDD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// kis_get_balance 응답
export interface KisBalance {
  cash: number;             // 예수금
  totalEvaluationAmount: number; // 총 평가금액
  totalPnl: number;         // 총 평가손익
  totalPnlRate: number;     // 총 수익률 (%)
  holdings: KisHolding[];
}

export interface KisHolding {
  ticker: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  evaluationAmount: number;
  pnl: number;
  pnlRate: number;
}

// kis_place_order 요청
export interface KisOrderRequest {
  ticker: string;
  side: OrderSide;
  quantity: number;
  price: number;            // 0이면 시장가
  orderType: OrderType;
  confirmed: true;          // 반드시 true — 안전장치
}

// kis_place_order 응답
export interface OrderResult {
  orderId: string;
  ticker: string;
  side: OrderSide;
  quantity: number;
  price: number;
  status: "accepted" | "filled" | "failed";
  message: string;
  executedAt: string;
}
