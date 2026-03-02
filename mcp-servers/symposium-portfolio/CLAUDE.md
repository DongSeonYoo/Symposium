# symposium-portfolio

포트폴리오 DB MCP 서버.

## 역할

매매 판단 근거, 포트폴리오 상태, watchlist를 PostgreSQL에 저장/조회.
LLM 자기교정을 위한 과거 판단 히스토리 제공.

## DB 스키마 (주요 테이블)

```sql
-- 매매 판단 저장
CREATE TABLE decisions (
  id UUID PRIMARY KEY,
  ticker VARCHAR(10),
  name VARCHAR(100),
  action VARCHAR(10),          -- BUY | SELL | HOLD
  quantity INT,
  price DECIMAL,
  confidence INT,
  stop_loss DECIMAL,
  take_profit DECIMAL,
  reasons JSONB,               -- { technical, fundamental, sentiment, macro }
  risks JSONB,
  persona_votes JSONB,         -- 페르소나별 투표 결과
  debate_summary TEXT,
  status VARCHAR(20),          -- pending | confirmed | rejected | expired | executed
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 포트폴리오 현황
CREATE TABLE holdings (
  id UUID PRIMARY KEY,
  ticker VARCHAR(10),
  name VARCHAR(100),
  quantity INT,
  avg_price DECIMAL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 감시 종목
CREATE TABLE watchlist (
  id UUID PRIMARY KEY,
  ticker VARCHAR(10),
  name VARCHAR(100),
  source VARCHAR(20),          -- manual | llm_discovered
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- 페르소나 가중치 (자기교정)
CREATE TABLE persona_weights (
  id UUID PRIMARY KEY,
  persona VARCHAR(50),
  sector VARCHAR(50),
  condition VARCHAR(50),
  weight DECIMAL DEFAULT 0.2,
  accuracy DECIMAL DEFAULT 0.0,
  sample_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 환경변수

```bash
DATABASE_URL=postgresql://...
```
