# symposium-kis

한국투자증권 KIS API MCP 서버.

## 역할

시세 조회, 계좌 잔고, 주문 실행을 MCP tool로 제공.
Orchestrator가 이 서버를 통해 KIS API와 통신.

## 주의사항

- `kis_place_order`는 **`confirmed: true` 플래그 없이 절대 호출 금지**
- `KIS_MODE=paper`(모의) 또는 `live`(실전) 환경변수 항상 확인
- 주문 실행 전 `/project:place-order` 커맨드 체크리스트 준수

## KIS API 참고

- 개발자 포털: https://apiportal.koreainvestment.com
- 모의투자와 실전투자 API endpoint가 다름 (환경변수로 분기)
- OAuth 토큰 발급 후 사용 (만료 시 자동 갱신 구현 필요)

## 구현할 Tools

| Tool | endpoint | method |
|------|----------|--------|
| `kis_get_price` | `/uapi/domestic-stock/v1/quotations/inquire-price` | GET |
| `kis_get_ohlcv` | `/uapi/domestic-stock/v1/quotations/inquire-daily-price` | GET |
| `kis_get_balance` | `/uapi/domestic-stock/v1/trading/inquire-balance` | GET |
| `kis_get_orders` | `/uapi/domestic-stock/v1/trading/inquire-daily-ccld` | GET |
| `kis_place_order` | `/uapi/domestic-stock/v1/trading/order-cash` | POST |
| `kis_cancel_order` | `/uapi/domestic-stock/v1/trading/order-rvsecncl` | POST |

## 환경변수

```bash
KIS_APP_KEY=
KIS_APP_SECRET=
KIS_ACCOUNT_NO=
KIS_MODE=paper   # paper | live
```
