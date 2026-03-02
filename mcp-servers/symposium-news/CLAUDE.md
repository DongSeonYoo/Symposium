# symposium-news

뉴스 수집 및 감성 분석 MCP 서버.

## 역할

종목 관련 뉴스 수집 및 Claude를 활용한 감성 분석 제공.

## 데이터 소스 (우선순위)

1. **네이버 뉴스 RSS**: 무료, 한국 주식 관련 뉴스 풍부
2. **Serper API**: 구글 검색 결과 기반 ($10/월 수준)
3. **DART 공시**: 중요 공시는 dart MCP 서버와 연계

## 구현할 Tools

| Tool | 설명 |
|------|------|
| `news_search` | 종목명/키워드로 최근 뉴스 검색 (최대 20건) |
| `news_get_sentiment` | 뉴스 리스트를 Claude로 감성 분석 → 긍정/부정/중립 + 핵심 요약 |

## 환경변수

```bash
NEWS_API_KEY=    # Serper API key (선택)
```
