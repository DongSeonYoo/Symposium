# packages/shared-types

Symposium 공통 TypeScript 타입 정의.

## 포함 내용

- `TradingDecision` — LLM 판단 출력 스키마
- `PersonaVote` — 페르소나별 투표 결과
- `MacroContext` — 거시경제 공통 컨텍스트
- `PersonaWeight` — 가중치 자기교정 스키마
- `WatchlistItem` — 감시 종목
- KIS API 요청/응답 타입
- DART API 요청/응답 타입

모든 앱과 MCP 서버에서 이 패키지를 import해서 사용.
타입 정의는 `docs/DESIGN.md` 5번 섹션 기준으로 작성.
