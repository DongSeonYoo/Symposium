import {
  pgTable,
  uuid,
  varchar,
  integer,
  smallint,
  decimal,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── 매매 판단 ────────────────────────────────────────────────
export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticker: varchar("ticker", { length: 10 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    action: varchar("action", { length: 10 }).notNull(),
    quantity: integer("quantity").notNull().default(0),
    price: decimal("price", { precision: 18, scale: 2 }).notNull().default("0"),
    confidence: smallint("confidence").notNull(),
    stopLoss: decimal("stop_loss", { precision: 18, scale: 2 }),
    takeProfit: decimal("take_profit", { precision: 18, scale: 2 }),
    reasons: jsonb("reasons").notNull().default({}),
    risks: jsonb("risks").notNull().default([]),
    personaVotes: jsonb("persona_votes").notNull().default([]),
    debateSummary: text("debate_summary"),
    macroContext: jsonb("macro_context").notNull().default({}),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    orderResult: jsonb("order_result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("decisions_ticker_idx").on(t.ticker),
    index("decisions_status_idx").on(t.status),
    index("decisions_created_idx").on(t.createdAt),
  ]
);

// ── 판단 상태 전이 감사 로그 ──────────────────────────────────
export const decisionEvents = pgTable(
  "decision_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    decisionId: uuid("decision_id")
      .notNull()
      .references(() => decisions.id),
    actor: varchar("actor", { length: 50 }).notNull(),
    fromStatus: varchar("from_status", { length: 20 }),
    toStatus: varchar("to_status", { length: 20 }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("decision_events_decision_idx").on(t.decisionId),
    index("decision_events_created_idx").on(t.createdAt),
  ]
);

// ── 포트폴리오 보유 종목 ─────────────────────────────────────
export const holdings = pgTable("holdings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticker: varchar("ticker", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  quantity: integer("quantity").notNull().default(0),
  avgPrice: decimal("avg_price", { precision: 18, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── 감시 종목 ────────────────────────────────────────────────
export const watchlist = pgTable("watchlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticker: varchar("ticker", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  source: varchar("source", { length: 20 }).notNull().default("manual"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── 페르소나 가중치 (자기교정) ──────────────────────────────
export const personaWeights = pgTable(
  "persona_weights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    persona: varchar("persona", { length: 50 }).notNull(),
    sector: varchar("sector", { length: 50 }).notNull().default("global"),
    condition: varchar("condition", { length: 20 }).notNull().default("neutral"),
    weight: decimal("weight", { precision: 5, scale: 4 }).notNull().default("0.2000"),
    accuracy: decimal("accuracy", { precision: 5, scale: 4 }).notNull().default("0.0000"),
    sampleCount: integer("sample_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("persona_weights_unique_idx").on(t.persona, t.sector, t.condition),
    index("persona_weights_lookup_idx").on(t.persona, t.sector, t.condition),
  ]
);

// ── 시스템 상태 (위기모드 source of truth) ───────────────────
export const systemState = pgTable("system_state", {
  key: varchar("key", { length: 50 }).primaryKey(),
  value: jsonb("value").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── API 키 (AES-256-GCM 암호화 저장) ─────────────────────────
export const apiKeys = pgTable("api_keys", {
  keyName:        varchar("key_name", { length: 50 }).primaryKey(),
  encryptedValue: text("encrypted_value").notNull(),
  iv:             varchar("iv", { length: 32 }).notNull(),      // base64 12 bytes → max 16 chars, 여유 32
  authTag:        varchar("auth_tag", { length: 32 }).notNull(), // base64 16 bytes → max 24 chars, 여유 32
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── API 키 감사 로그 (값 저장 금지, 이벤트만 기록) ──────────────
export const apiKeyAuditLogs = pgTable(
  "api_key_audit_logs",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    actor:     varchar("actor", { length: 100 }).notNull(), // 사용자 id 또는 "system"
    action:    varchar("action", { length: 10 }).notNull(), // "set" | "delete"
    keyName:   varchar("key_name", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("api_key_audit_logs_actor_idx").on(t.actor),
    index("api_key_audit_logs_created_idx").on(t.createdAt),
  ]
);

// ── 분석 사이클 (이벤트 스트림 트래킹) ──────────────────────────
export const analysisCycles = pgTable("analysis_cycles", {
  id:          uuid("id").primaryKey().defaultRandom(),
  status:      varchar("status", { length: 20 }).notNull().default("running"),
  trigger:     varchar("trigger", { length: 20 }).notNull().default("manual"),
  requestedBy: varchar("requested_by", { length: 100 }),
  startedAt:   timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt:  timestamp("finished_at", { withTimezone: true }),
  error:       text("error"),
});

export const analysisEvents = pgTable(
  "analysis_events",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    cycleId:   uuid("cycle_id").notNull().references((): AnyPgColumn => analysisCycles.id),
    seq:       integer("seq").notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    payload:   jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("analysis_events_cycle_seq_uniq").on(t.cycleId, t.seq),
    index("analysis_events_cycle_seq_idx").on(t.cycleId, t.seq),
  ]
);
