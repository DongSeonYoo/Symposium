# apps/dashboard

Symposium 웹 대시보드.

## 역할

- 판단 목록 및 토론 상세 열람
- Confirm 패널 (승인/거부, 수량·가격 수정)
- 포트폴리오 현황 및 수익률 조회
- Watchlist 관리
- 위기 모드 UI

## 기술 스택

- Next.js (App Router)
- Tailwind CSS
- 실시간 알림: Web Push API or SSE

## 주요 화면

| 화면 | 경로 |
|------|------|
| 홈 / 현황 | `/` |
| 판단 상세 | `/decisions/[id]` |
| Confirm 패널 | `/decisions/[id]/confirm` |
| 히스토리 | `/history` |
| Watchlist | `/watchlist` |
| 설정 | `/settings` |

## Confirm 플로우

1. Orchestrator가 판단 생성 → DB 저장 → 대시보드에 SSE 이벤트 발송
2. 대시보드: 뱃지 표시 + 브라우저 푸시 알림
3. 사용자: 토론 내용 열람 → 승인/거부 (수량·가격 수정 가능)
4. 승인: `/api/confirm` 엔드포인트 → Orchestrator에 주문 실행 트리거
5. 만료: 30분 경과 시 자동 거부 (위기 모드 시 타이머 없음)

## 환경변수

```bash
DATABASE_URL=
NEXT_PUBLIC_APP_URL=
```
