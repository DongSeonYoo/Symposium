# apps/orchestrator

Symposium 메인 파이프라인.

## 역할

- node-cron으로 분석 사이클 스케줄링
- 4개 MCP 서버 클라이언트로서 데이터 수집/저장
- Claude API 호출하여 페르소나 토론 실행
- 위기 모드 감지 및 전환
- 대시보드로 Confirm 결과 수신 후 주문 실행

## 핵심 플로우

`docs/pipeline.md` 참고.

## 주요 모듈 구조 (예정)

```
orchestrator/src/
├── index.ts              ← 진입점, 스케줄러 등록
├── pipeline/
│   ├── collect.ts        ← 데이터 수집 (MCP 호출)
│   ├── debate.ts         ← 페르소나 토론 (Claude API)
│   ├── confirm.ts        ← Confirm 대기 및 주문 실행
│   └── crisis.ts         ← 위기 모드 감지/전환
├── personas/
│   ├── buffett.ts        ← 버핏 시스템 프롬프트
│   ├── soros.ts
│   ├── dalio.ts
│   ├── lynch.ts
│   └── parkhyunju.ts
└── mcp/
    └── client.ts         ← MCP 서버 클라이언트 초기화
```

## 환경변수

```bash
ANTHROPIC_API_KEY=
KIS_MODE=paper
DATABASE_URL=
# 각 MCP 서버 endpoint (Railway Private Service URL)
MCP_KIS_URL=
MCP_DART_URL=
MCP_PORTFOLIO_URL=
MCP_NEWS_URL=
```
