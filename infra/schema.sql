-- ============================================================
-- Symposium — DB 스키마 초기화
-- 실행: psql $DATABASE_PUBLIC_URL -f infra/schema.sql
-- ============================================================

-- ── 확장 ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 매매 판단 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker          VARCHAR(10)  NOT NULL,
  name            VARCHAR(100) NOT NULL,
  action          VARCHAR(10)  NOT NULL CHECK (action IN ('BUY', 'SELL', 'HOLD')),
  quantity        INTEGER      NOT NULL DEFAULT 0,
  price           DECIMAL(18,2) NOT NULL DEFAULT 0,
  confidence      SMALLINT     NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  stop_loss       DECIMAL(18,2),
  take_profit     DECIMAL(18,2),
  reasons         JSONB        NOT NULL DEFAULT '{}',   -- { technical, fundamental, sentiment, macro }
  risks           JSONB        NOT NULL DEFAULT '[]',
  persona_votes   JSONB        NOT NULL DEFAULT '[]',   -- PersonaVote[]
  debate_summary  TEXT,
  macro_context   JSONB        NOT NULL DEFAULT '{}',   -- MacroContext 스냅샷
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','rejected','expired','executed')),
  expires_at      TIMESTAMPTZ  NOT NULL,
  confirmed_at    TIMESTAMPTZ,
  executed_at     TIMESTAMPTZ,
  order_result    JSONB,                                -- OrderResult (체결 결과)
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS decisions_ticker_idx  ON decisions (ticker);
CREATE INDEX IF NOT EXISTS decisions_status_idx  ON decisions (status);
CREATE INDEX IF NOT EXISTS decisions_created_idx ON decisions (created_at DESC);

-- ── 포트폴리오 보유 종목 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS holdings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker      VARCHAR(10)   NOT NULL UNIQUE,
  name        VARCHAR(100)  NOT NULL,
  quantity    INTEGER       NOT NULL DEFAULT 0,
  avg_price   DECIMAL(18,2) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 감시 종목 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker    VARCHAR(10)  NOT NULL UNIQUE,
  name      VARCHAR(100) NOT NULL,
  source    VARCHAR(20)  NOT NULL DEFAULT 'manual'
              CHECK (source IN ('manual', 'llm_discovered')),
  added_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 페르소나 가중치 (자기교정) ──────────────────────────────
CREATE TABLE IF NOT EXISTS persona_weights (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  persona      VARCHAR(50)    NOT NULL,
  sector       VARCHAR(50)    NOT NULL DEFAULT 'global',
  condition    VARCHAR(20)    NOT NULL DEFAULT 'neutral'
                 CHECK (condition IN ('bull','bear','crisis','neutral')),
  weight       DECIMAL(5,4)   NOT NULL DEFAULT 0.2000,
  accuracy     DECIMAL(5,4)   NOT NULL DEFAULT 0.0000,
  sample_count INTEGER        NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (persona, sector, condition)
);

CREATE INDEX IF NOT EXISTS persona_weights_lookup_idx
  ON persona_weights (persona, sector, condition);

-- ── 페르소나 초기 가중치 삽입 ────────────────────────────────
-- 5인 × global × neutral = 25행 (샘플 30개 미만 시 기본값 0.2 유지)
INSERT INTO persona_weights (persona, sector, condition) VALUES
  ('buffett',    'global', 'neutral'),
  ('buffett',    'global', 'bull'),
  ('buffett',    'global', 'bear'),
  ('buffett',    'global', 'crisis'),
  ('soros',      'global', 'neutral'),
  ('soros',      'global', 'bull'),
  ('soros',      'global', 'bear'),
  ('soros',      'global', 'crisis'),
  ('dalio',      'global', 'neutral'),
  ('dalio',      'global', 'bull'),
  ('dalio',      'global', 'bear'),
  ('dalio',      'global', 'crisis'),
  ('lynch',      'global', 'neutral'),
  ('lynch',      'global', 'bull'),
  ('lynch',      'global', 'bear'),
  ('lynch',      'global', 'crisis'),
  ('parkhyunju', 'global', 'neutral'),
  ('parkhyunju', 'global', 'bull'),
  ('parkhyunju', 'global', 'bear'),
  ('parkhyunju', 'global', 'crisis')
ON CONFLICT (persona, sector, condition) DO NOTHING;

-- ── 위기 모드 시 달리오/소로스 가중치 상향 반영 ─────────────
UPDATE persona_weights SET weight = 0.2500 WHERE persona IN ('dalio','soros') AND condition = 'crisis';
UPDATE persona_weights SET weight = 0.1667 WHERE persona IN ('buffett','lynch','parkhyunju') AND condition = 'crisis';

-- ── 시스템 상태 (위기모드 source of truth) ───────────────────
CREATE TABLE IF NOT EXISTS system_state (
  key         VARCHAR(50)  PRIMARY KEY,
  value       JSONB        NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 위기모드 초기값 삽입
INSERT INTO system_state (key, value) VALUES
  ('crisis_mode', '{"active": false, "triggers": [], "activatedAt": null, "cooldownUntil": null}')
ON CONFLICT (key) DO NOTHING;

-- ── 판단 상태 전이 감사 로그 ──────────────────────────────────
CREATE TABLE IF NOT EXISTS decision_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id   UUID         NOT NULL REFERENCES decisions(id),
  actor         VARCHAR(50)  NOT NULL,  -- 'orchestrator' | 'dashboard' | 'system'
  from_status   VARCHAR(20),            -- NULL = 최초 생성
  to_status     VARCHAR(20)  NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS decision_events_decision_idx ON decision_events (decision_id);
CREATE INDEX IF NOT EXISTS decision_events_created_idx  ON decision_events (created_at DESC);

-- ── 읽기 전용 계정 (Dashboard 전용) ──────────────────────────
-- 주의: Railway 환경에서는 별도 실행 필요 (슈퍼유저 권한)
-- psql $DATABASE_URL -c "CREATE ROLE symposium_reader LOGIN PASSWORD 'CHANGE_ME';"
-- psql $DATABASE_URL -c "GRANT CONNECT ON DATABASE railway TO symposium_reader;"
-- psql $DATABASE_URL -c "GRANT USAGE ON SCHEMA public TO symposium_reader;"
-- psql $DATABASE_URL -c "GRANT SELECT ON ALL TABLES IN SCHEMA public TO symposium_reader;"
-- psql $DATABASE_URL -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO symposium_reader;"
