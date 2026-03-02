# Symposium

LLM 기반 주식 자동매매 시스템.

> 금융 거물 페르소나 5인의 원탁 토론 → 사용자 Confirm → KIS 주문 실행

## 개발 시작

```bash
# KIS API 키 먼저 발급
# https://apiportal.koreainvestment.com → 모의투자 앱키/시크릿

# 환경변수 설정
cp .env.example .env

# Phase 1: KIS MCP 서버부터 시작
cd mcp-servers/symposium-kis
```

## 문서

- 전체 설계: [docs/DESIGN.md](./docs/DESIGN.md)
- 페르소나: [docs/personas.md](./docs/personas.md)
- 파이프라인: [docs/pipeline.md](./docs/pipeline.md)
- 위기 프로토콜: [docs/crisis-protocol.md](./docs/crisis-protocol.md)
- 비용 분석: [docs/cost.md](./docs/cost.md)
