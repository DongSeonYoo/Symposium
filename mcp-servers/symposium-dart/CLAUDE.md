# symposium-dart

금감원 DART Open API MCP 서버.

## 역할

기업 공시, 재무제표 데이터를 MCP tool로 제공.
LLM이 기본적 분석(fundamental analysis)에 활용.

## API 참고

- DART Open API: https://opendart.fss.or.kr
- 무료 API 키 발급 필요
- 일일 요청 한도: 10,000건

## 구현할 Tools

| Tool | API | 설명 |
|------|-----|------|
| `dart_get_disclosures` | `/api/list.json` | 날짜별 공시 목록 |
| `dart_get_financial` | `/api/fnlttSinglAcntAll.json` | 단일 재무제표 |
| `dart_search_company` | `/api/company.json` | 회사 검색 |

## 환경변수

```bash
DART_API_KEY=
```
