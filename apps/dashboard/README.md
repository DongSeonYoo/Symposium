# @symposium/dashboard

Symposium 웹 대시보드 — LLM 매매 판단 Confirm UI.

## 화면 구성

| 경로 | 내용 |
|------|------|
| `/` | 판단 목록 (10초 자동 갱신) + 보유 종목 요약 |
| `/decisions/[id]` | 토론 상세 (페르소나 투표, 근거, 리스크, 거시경제) |
| `/decisions/[id]/confirm` | 승인 / 거부 + 만료 카운트다운 |

## 환경변수

`.env.local` 파일 생성:

```bash
# 읽기 전용 DB 계정 (infra/schema.sql의 symposium_reader)
DATABASE_READER_URL=postgresql://symposium_reader:PASSWORD@HOST:PORT/DB

# portfolio MCP HTTP 엔드포인트 (경로까지 포함)
# dev: symposium-portfolio를 HTTP 모드로 실행 필요
# prod: Railway private service URL
MCP_PORTFOLIO_URL=http://localhost:3003/mcp
```

> `DATABASE_READER_URL`이 없으면 `DATABASE_URL`로 폴백합니다.

## 실행 방법

```bash
# 개발 서버
pnpm -C apps/dashboard dev

# 프로덕션 빌드
pnpm -C apps/dashboard build

# 테스트
pnpm -C apps/dashboard test
```

## portfolio MCP dev 실행 방법

dashboard의 Confirm API는 portfolio MCP를 HTTP 모드로 호출합니다.
개발 환경에서는 portfolio MCP를 별도 HTTP 서버로 실행해야 합니다:

```bash
# symposium-portfolio를 HTTP 모드로 실행 (포트 3003)
# (현재는 stdio 전용이므로 Phase 2에서 HTTP transport 추가 예정)
MCP_PORT=3003 pnpm -C mcp-servers/symposium-portfolio start
```

## 기술 스택

- **Next.js 15** (App Router) — 서버 컴포넌트로 초기 데이터 prefetch
- **TanStack Query** — 판단 목록 10초 폴링 + Confirm 후 즉시 캐시 무효화
- **Tailwind CSS v4** — 반응형 UI
- **@symposium/db** — Drizzle ORM (읽기 전용)
- **portfolio MCP** — 상태 전이 쓰기 경유 (`actor: "dashboard"` 고정)

## DB 접근 원칙

- **읽기**: 서버 컴포넌트/API에서 `@symposium/db` 직접 Drizzle 쿼리
- **쓰기**: 직접 DB 접근 금지 → `portfolio_update_decision` MCP tool 경유
  - actor는 항상 `"dashboard"` 고정
  - 만료 검증은 MCP 서버에서 단일 처리 (dashboard에서 중복 검증 안 함)
