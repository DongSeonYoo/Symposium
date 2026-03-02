# Symposium

> LLM 기반 주식 자동매매 시스템.
> 금융 거물 페르소나 5인이 토론하여 매매 판단 → 사용자 웹 대시보드에서 Confirm → KIS API 주문 실행.

## 절대 원칙 (반드시 숙지)

- **사용자 Confirm 없이 절대 주문 실행 금지** — `kis_place_order`는 반드시 `confirmed: true` 확인 후 호출
- **모의투자/실전 환경 혼동 금지** — 항상 `KIS_MODE` 환경변수 확인 (`paper` | `live`)
- **LLM 판단은 제안일 뿐** — 최종 결정권은 항상 사용자에게 있음
- **모든 판단과 주문은 DB에 영구 기록** — 삭제 금지

## 프로젝트 문서

| 문서 | 내용 |
|------|------|
| `docs/DESIGN.md` | 전체 설계 (아키텍처, 컴포넌트, 기술 선택) |
| `docs/personas.md` | 5개 페르소나 상세 프롬프트 및 토론 구조 |
| `docs/pipeline.md` | 분석 사이클 파이프라인 상세 플로우 |
| `docs/crisis-protocol.md` | 위기 대응 모드 (블랙스완 프로토콜) |
| `docs/cost.md` | LLM API 비용 분석 및 최적화 전략 |

## 기술 스택

- **언어**: TypeScript (Node.js)
- **LLM**: Claude API (Sonnet 4.6 기본, Opus 4.5 최종 합산)
- **증권사**: 한국투자증권 KIS API (REST + WebSocket)
- **DB**: PostgreSQL (Railway)
- **인프라**: Railway (클라우드)
- **프로토콜**: MCP (Model Context Protocol)

## 프로젝트 구조

```
symposium/
├── CLAUDE.md                      ← 지금 이 파일
├── docs/                          ← 설계 문서
├── .claude/commands/              ← CC 커스텀 커맨드
├── apps/
│   ├── orchestrator/              ← 메인 파이프라인 (node-cron)
│   └── dashboard/                 ← 웹 대시보드 (Next.js)
├── mcp-servers/
│   ├── symposium-kis/             ← KIS API MCP 서버
│   ├── symposium-dart/            ← 공시 MCP 서버
│   ├── symposium-portfolio/       ← 포트폴리오 DB MCP 서버
│   └── symposium-news/            ← 뉴스 MCP 서버
└── packages/
    └── shared-types/              ← 공통 TypeScript 타입
```

## 개발 시작 순서

1. `mcp-servers/symposium-kis/` — KIS API 연동부터 시작 (CLAUDE.md 참고)
2. `mcp-servers/symposium-portfolio/` — PostgreSQL 포트폴리오 DB
3. `apps/orchestrator/` — 파이프라인 + Claude API 연동
4. `apps/dashboard/` — Confirm UI
5. 나머지 MCP 서버들 추가

자세한 내용은 `docs/DESIGN.md` 참고.
