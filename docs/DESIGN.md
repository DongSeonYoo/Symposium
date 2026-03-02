# Symposium — 전체 설계 문서

## 1. 프로젝트 개요

LLM(Claude)이 시장 데이터, 공시, 뉴스를 분석하여 매수/매도 시그널을 생성하고,
사용자가 웹 대시보드에서 최종 승인하면 자동으로 주문을 실행하는 반자동 주식 매매 시스템.

### 핵심 차별화

기존 자동매매 시스템과 달리, 저명한 금융 거물 페르소나 5인이 동일 데이터를 보고
독립 판단 → 교차 비판 → 재반론 → 가중 합산하는 **원탁 토론 구조**.

## 2. 확정된 기술 선택

| 항목 | 선택 | 비고 |
|------|------|------|
| 증권사 API | 한국투자증권 KIS | REST + WebSocket, 모의투자 환경 제공 |
| Confirm 인터페이스 | 웹 대시보드 | 판단 근거 조회 + 승인/거부 통합 |
| 판단 근거 저장 | PostgreSQL | 대시보드에서 직접 열람 |
| 감시 종목 전략 | 혼합 | 고정 watchlist + LLM 발굴 보조 |
| 실행 환경 | Railway | 클라우드 배포 |
| 개발 언어 | TypeScript | Node.js 환경 |

## 3. 시스템 아키텍처

### 전체 플로우

```
[ 스케줄러 (node-cron) ]
         │
         ▼
[ 데이터 수집 ]  ←── symposium-kis + symposium-dart + symposium-news
         │
         ▼
[ 페르소나 토론 ]  ←── Claude API × 5 페르소나 × 3 라운드 (병렬)
         │
         ▼
[ 판단 저장 ]  ←── symposium-portfolio → PostgreSQL
         │
         ▼
[ 웹 대시보드 알림 ]  ←── 사용자 Confirm 대기 (30분 타이머)
         │
    승인 / 거부
         │ 승인
         ▼
[ 주문 실행 ]  ←── symposium-kis (confirmed: true 확인 필수)
         │
         ▼
[ 결과 기록 ]  ←── symposium-portfolio → PostgreSQL
```

### 컴포넌트

| 컴포넌트 | 역할 | 기술 |
|---------|------|------|
| Orchestrator | 전체 파이프라인 조율, 스케줄링 | TypeScript, node-cron |
| symposium-kis | 시세조회, 잔고, 주문 실행 | TypeScript MCP SDK |
| symposium-dart | 공시 조회, 재무제표 | TypeScript MCP SDK |
| symposium-portfolio | 포트폴리오 DB CRUD | TypeScript MCP SDK + PostgreSQL |
| symposium-news | 뉴스 수집 및 감성 분석 | TypeScript MCP SDK |
| Dashboard | Confirm UI, 판단 근거 열람 | Next.js |
| Claude API | 페르소나 토론, 매매 판단 | claude-sonnet-4-6 / claude-opus-4-5 |

## 4. MCP 서버 Tool 목록

### symposium-kis

| Tool | 설명 | destructive |
|------|------|-------------|
| `kis_get_price` | 현재가, 호가, 거래량 조회 | No |
| `kis_get_ohlcv` | 일봉/분봉 OHLCV 데이터 | No |
| `kis_get_balance` | 계좌 잔고, 보유 종목 조회 | No |
| `kis_get_orders` | 주문 내역 조회 | No |
| `kis_place_order` | 매수/매도 주문 실행 (**Confirm 후 호출**) | **Yes** |
| `kis_cancel_order` | 주문 취소 | Yes |

### symposium-dart

| Tool | 설명 | destructive |
|------|------|-------------|
| `dart_get_disclosures` | 날짜별 최신 공시 목록 | No |
| `dart_get_financial` | 재무제표 (손익, 대차, 현금흐름) | No |
| `dart_search_company` | 회사명/종목코드로 검색 | No |

### symposium-portfolio

| Tool | 설명 | destructive |
|------|------|-------------|
| `portfolio_get_holdings` | 현재 보유 종목 및 평가손익 | No |
| `portfolio_save_decision` | LLM 판단 근거 저장 | No |
| `portfolio_get_history` | 과거 매매 내역 조회 | No |
| `portfolio_get_pnl` | 기간별 수익률 조회 | No |
| `portfolio_get_watchlist` | 감시 종목 목록 | No |
| `portfolio_update_watchlist` | watchlist 추가/제거 | No |

### symposium-news

| Tool | 설명 | destructive |
|------|------|-------------|
| `news_search` | 종목명/키워드로 뉴스 검색 | No |
| `news_get_sentiment` | 뉴스 감성 분석 (긍정/부정/중립) | No |

## 5. LLM 판단 출력 스키마

```typescript
interface TradingDecision {
  ticker: string;           // 종목코드 (e.g. '005930')
  name: string;             // 종목명
  action: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;         // 수량
  price: number;            // 목표가 (지정가) 또는 0 (시장가)
  confidence: number;       // 0~100 확신도
  stopLoss: number;         // 손절가
  takeProfitPrice: number;  // 목표 수익가
  reasons: {
    technical: string[];    // 기술적 근거
    fundamental: string[];  // 공시/재무 근거
    sentiment: string[];    // 뉴스 감성 근거
    macro: string[];        // 거시경제 근거
  };
  risks: string[];          // 리스크 요인
  personaVotes: PersonaVote[];  // 페르소나별 투표 결과
  debateSummary: string;    // 토론 요약
  expiresAt: string;        // 판단 유효시간 ISO8601 (기본 30분)
}

interface PersonaVote {
  persona: 'buffett' | 'soros' | 'dalio' | 'lynch' | 'parkhyunju';
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  keyArgument: string;      // 핵심 논거 1줄 요약
  weight: number;           // 현재 적용 가중치 (자기교정으로 동적 변화)
}
```

## 6. 웹 대시보드

### 주요 화면

| 화면 | 주요 기능 |
|------|----------|
| 홈 / 현황 | 오늘 판단 목록, 포트폴리오 요약, 수익률 |
| 판단 상세 | 페르소나 토론 전체 열람, 기술 지표 차트 |
| Confirm 패널 | 승인/거부, 수량·가격 수정, 만료 타이머 |
| 히스토리 | 과거 판단 + 실제 결과 비교, 정확도 통계 |
| Watchlist | 감시 종목 관리, LLM 발굴 후보 확인 |
| 설정 | 분석 주기, 최대 투자금액, 리스크 한도 |

### Confirm 플로우

1. 판단 생성 → 대시보드 뱃지 + 브라우저 푸시 알림
2. 판단마다 **30분 만료 타이머** (위기 모드 시 타이머 없음)
3. 수량/가격 수정 후 승인 가능
4. 승인 즉시 `kis_place_order` 호출 → 체결 결과 실시간 반영

## 7. 인프라 (Railway)

### 서비스 구성

| 서비스 | Railway 구성 | 비고 |
|--------|-------------|------|
| Orchestrator | Worker (always-on) | 스케줄러, MCP 클라이언트 |
| Dashboard | Web Service | Next.js, 외부 접근 가능 |
| MCP Servers | Private Service × 4 | Orchestrator에서만 접근 |
| PostgreSQL | Railway PostgreSQL | 판단 히스토리, 포트폴리오 |

### 필수 환경변수

```bash
KIS_APP_KEY=
KIS_APP_SECRET=
KIS_ACCOUNT_NO=
KIS_MODE=paper         # paper | live  ← 절대 실수 금지
DART_API_KEY=
ANTHROPIC_API_KEY=
DATABASE_URL=
NEWS_API_KEY=
```

## 8. 개발 로드맵

| Phase | 기간 | 주요 작업 |
|-------|------|----------|
| Phase 1 | 1~2주 | KIS API 키 발급, `symposium-kis` 구현, 조회 툴 검증 |
| Phase 2 | 2~3주 | `symposium-portfolio` (PostgreSQL), Orchestrator 뼈대, Claude API 연동 |
| Phase 3 | 3~4주 | 웹 대시보드 기본 UI, Confirm → 주문 실행, 모의투자 E2E 테스트 |
| Phase 4 | 4~6주 | `symposium-dart`, `symposium-news` 추가, 감성 분석 고도화 |
| Phase 5 | 6주+ | 실전 전환, 히스토리/수익률 통계, LLM 발굴 기능 |

## 9. 리스크 관리

| 리스크 | 대응 |
|--------|------|
| 단일 종목 과집중 | 1종목 최대 포트폴리오 20% 이하 |
| 일일 손실 한도 | -3% 도달 시 당일 신규 주문 중단 |
| LLM 판단 오류 | 사용자 Confirm 필수, 자동 실행 없음 |
| API 장애 | 주문 실패 시 대시보드 알림, 재시도 없음 |
| 판단 만료 | 30분 내 Confirm 없으면 자동 거부 |
| 모의/실전 혼동 | `KIS_MODE` env 항상 확인, 주문 전 재검증 |
