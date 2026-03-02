// DART API 타입

export interface DartDisclosure {
  ticker: string;
  companyName: string;
  disclosureType: string;   // 공시 유형
  title: string;
  filedAt: string;          // ISO8601
  url: string;
}

export interface DartFinancial {
  ticker: string;
  companyName: string;
  year: number;
  quarter: number;          // 1~4
  revenue: number;          // 매출액
  operatingProfit: number;  // 영업이익
  netIncome: number;        // 당기순이익
  totalAssets: number;      // 총자산
  totalLiabilities: number; // 총부채
  totalEquity: number;      // 자본총계
  eps: number;              // 주당순이익
  roe: number;              // 자기자본이익률 (%)
  debtRatio: number;        // 부채비율 (%)
}
