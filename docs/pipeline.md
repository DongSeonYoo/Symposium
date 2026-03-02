# Symposium — 분석 파이프라인

## 정규 분석 사이클

**실행 시각**: 매 거래일 08:50 (장 시작 10분 전)

```
1. 데이터 수집 (병렬)
   ├── kis_get_price(watchlist)       → 시세
   ├── kis_get_balance()              → 잔고/보유종목
   ├── dart_get_disclosures(today)    → 당일 공시
   ├── news_search(watchlist)         → 관련 뉴스
   └── 거시경제 지표 수집             → MacroContext

2. 컨텍스트 구성
   ├── 수집 데이터 정제
   ├── portfolio_get_history()        → 과거 판단 히스토리 (자기교정 컨텍스트)
   └── portfolio_get_watchlist()      → 감시 종목 목록

3. 페르소나 토론 (docs/personas.md 참고)
   ├── Round 1: 독립 판단 × 5 (병렬)
   ├── Round 2: 교차 비판 × 5 (병렬)
   ├── Round 3: 재반론 × 5 (병렬)
   └── 최종 합산 × 1 (Opus 4.5)

4. 판단 저장
   └── portfolio_save_decision(decision)

5. 대시보드 알림
   └── 브라우저 푸시 알림 발송

6. 사용자 Confirm 대기 (최대 30분)
   ├── 승인 → 7번으로
   └── 거부/만료 → 종료, DB에 거부 기록

7. 주문 실행
   ├── KIS_MODE 확인 (paper | live)
   ├── kis_get_balance() 재확인
   ├── 리스크 한도 체크
   └── kis_place_order(order, confirmed: true)

8. 결과 기록
   └── portfolio_save_decision(result)
```

## LLM 발굴 사이클 (보조)

**실행 시각**: 매 거래일 07:30 (정규 사이클 전)

```
1. dart_get_disclosures(today)         → 긍정적 공시 종목 스캔
2. news_get_sentiment(all)             → 감성 점수 급등 종목
3. kis_get_ohlcv(candidates)           → 거래량 급증 + 기술적 패턴
4. Claude API → 관심 종목 후보 3~5개 추출
5. portfolio_update_watchlist(pending) → 대시보드 '발굴 후보' 표시
6. 사용자 승인 시 watchlist에 정식 추가
```

## 위기 모드 사이클

위기 모드 진입 시 정규 사이클 대신 실행. 자세한 내용은 `docs/crisis-protocol.md` 참고.

**실행 주기**: 30분마다  
**신규 매수**: 전면 보류  
**토론 주제**: 위기 대응 전략으로 자동 변경
