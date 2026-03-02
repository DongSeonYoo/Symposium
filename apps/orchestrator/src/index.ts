import Anthropic from "@anthropic-ai/sdk";
import { createServer } from "node:http";
import { createDbClient, analysisCycles, eq, sql } from "@symposium/db";
import { loadApiKeysFromDb } from "./config/load-keys.js";
import { McpClientManager } from "./mcp/client-manager.js";
import { ConfirmPoller } from "./pipeline/confirm-poller.js";
import { executeOrder } from "./pipeline/execute-order.js";
import { collectMarketData, buildReasons } from "./pipeline/collect.js";
import { runRound1, runRound2, runRound3 } from "./pipeline/debate.js";
import { synthesize } from "./pipeline/synthesize.js";
import { CycleEmitter, createCycle } from "./pipeline/emitter.js";
import { detectAndUpdateCrisis } from "./crisis/detector.js";
import { startScheduler, stopScheduler } from "./scheduler.js";
import type { PersonaId } from "@symposium/shared-types";

// ── 환경변수 검증 ────────────────────────────────────────────
function validateEnv(): void {
  const required = ["ANTHROPIC_API_KEY", "DATABASE_URL", "KIS_MODE"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`필수 환경변수 누락: ${missing.join(", ")}`);
  }
}

// ── 페르소나 가중치 로드 — portfolio MCP 경유 ────────────────
// 가중치는 portfolio MCP의 persona_weights 테이블이 source of truth
async function loadWeights(
  mcp: McpClientManager
): Promise<Record<PersonaId, number>> {
  try {
    const weightsRaw = await mcp.callTool("portfolio", "portfolio_get_weights", {}) as Record<string, number>;
    return { buffett: 0.2, soros: 0.2, dalio: 0.2, lynch: 0.2, parkhyunju: 0.2, ...weightsRaw };
  } catch (err) {
    console.error("[orchestrator] portfolio_get_weights 실패, 기본값 사용:", err);
    return { buffett: 0.2, soros: 0.2, dalio: 0.2, lynch: 0.2, parkhyunju: 0.2 };
  }
}

// ── 정규 분석 사이클 ─────────────────────────────────────────
async function runAnalysisCycle(
  mcp: McpClientManager,
  anthropic: Anthropic,
  emitter?: CycleEmitter
): Promise<void> {
  console.error("[pipeline] analysis cycle start");

  // watchlist 조회
  const watchlistRaw = await mcp.callTool("portfolio", "portfolio_get_watchlist", {}) as { ticker: string; name: string }[];
  if (!Array.isArray(watchlistRaw) || watchlistRaw.length === 0) {
    console.error("[pipeline] watchlist empty, skipping");
    return;
  }

  await emitter?.emit("cycle:start", { tickers: watchlistRaw.map((w) => w.ticker) });

  const weights = await loadWeights(mcp);

  for (const item of watchlistRaw) {
    try {
      console.error(`[pipeline] analyzing ${item.ticker} (${item.name})`);
      await emitter?.emit("ticker:start", { ticker: item.ticker, name: item.name });

      // 데이터 수집 (Phase 2: KIS + DART + NEWS MCP 연동)
      const collected = await collectMarketData(item.ticker, item.name, mcp, emitter);

      const ctx = {
        ticker: item.ticker,
        name: item.name,
        marketData: collected.marketData as Record<string, unknown>,
        macroContext: collected.macroContext as Record<string, unknown>,
        fundamental: collected.fundamental as Record<string, unknown>,
        sentiment: collected.sentiment as Record<string, unknown> | null,
        weights,
      };

      // 3라운드 토론
      const round1 = await runRound1(anthropic, ctx, emitter);
      const round2 = await runRound2(anthropic, ctx, round1, emitter);
      const round3 = await runRound3(anthropic, ctx, round2, emitter);

      // 최종 합산
      const synthesis = await synthesize(anthropic, {
        ticker: item.ticker,
        name: item.name,
        round3,
        weights,
        emitter,
      });

      // 판단 저장
      const saved = await mcp.callTool("portfolio", "portfolio_save_decision", {
        ticker: item.ticker,
        name: item.name,
        action: synthesis.action,
        quantity: 0,
        price: 0,
        confidence: synthesis.confidence,
        reasons: buildReasons(collected),
        risks: [],
        personaVotes: synthesis.personaVotes,
        debateSummary: synthesis.debateSummary,
        macroContext: ctx.macroContext,
        expiresInMinutes: 30,
      }) as { id?: string };

      await emitter?.emit("decision:saved", {
        ticker: item.ticker,
        decisionId: saved?.id ?? null,
        action: synthesis.action,
      });

      console.error(`[pipeline] saved decision: ${synthesis.action}(${synthesis.confidence}) for ${item.ticker}`);
    } catch (err) {
      // 종목별 실패 격리 — 다음 종목 계속 처리
      console.error(`[pipeline] failed for ${item.ticker}:`, err);
      await emitter?.emit("ticker:error", { ticker: item.ticker, error: String(err) });
    }
  }

  await emitter?.emit("cycle:done", { tickerCount: watchlistRaw.length });
  console.error("[pipeline] analysis cycle done");
}

// ── 위기 감지 사이클 ─────────────────────────────────────────
async function runCrisisCheck(
  db: ReturnType<typeof createDbClient>
): Promise<void> {
  // Phase 1: stub macro 데이터로 감지
  const macro = {
    vix: Number(process.env._STUB_VIX ?? 18),
    dxyChange: 0,
    wtiChange: 0,
    kospiChange: 0,
    usdKrwChange: 0,
  };
  const state = await detectAndUpdateCrisis(db, macro);
  if (state.active) {
    console.error(`[crisis] ACTIVE — triggers: ${state.triggers.join(", ")}`);
  }
}

// ── 시작 시 좀비 사이클 정리 ─────────────────────────────────
// orchestrator 크래시로 status=running인 채 남겨진 사이클을 error로 전환
async function cleanupZombieCycles(
  db: ReturnType<typeof createDbClient>
): Promise<void> {
  const result = await db
    .update(analysisCycles)
    .set({
      status: "error",
      finishedAt: sql`NOW()`,
      error: "orchestrator restarted — cycle was interrupted",
    })
    .where(eq(analysisCycles.status, "running"));
  const count = Array.isArray(result) ? result.length : 0;
  if (count > 0) {
    console.error(`[orchestrator] zombie cycle(s) cleaned up on startup: ${count}`);
  }
}

// ── 진입점 ───────────────────────────────────────────────────
async function main(): Promise<void> {
  const db = createDbClient({ max: 10 });

  // 이전 실행에서 중단된 좀비 사이클 정리
  await cleanupZombieCycles(db);

  // DB에서 API 키 로드 → process.env 주입 (ANTHROPIC 실패 시 즉시 exit)
  await loadApiKeysFromDb(db);

  // DB 주입 후 필수 환경변수 검증
  validateEnv();
  const mcp = new McpClientManager();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // MCP 서버 연결 (서버가 준비될 때까지 재시도)
  const MAX_CONNECT_RETRIES = 10;
  const CONNECT_RETRY_DELAY_MS = 2_000;
  for (let i = 1; i <= MAX_CONNECT_RETRIES; i++) {
    try {
      await mcp.connect();
      break;
    } catch (err) {
      if (i === MAX_CONNECT_RETRIES) throw err;
      console.error(`[orchestrator] MCP 연결 실패 (${i}/${MAX_CONNECT_RETRIES}), ${CONNECT_RETRY_DELAY_MS}ms 후 재시도...`);
      await new Promise((r) => setTimeout(r, CONNECT_RETRY_DELAY_MS));
    }
  }

  // Confirm 폴링 시작
  const poller = new ConfirmPoller(
    db,
    (decisionId) => executeOrder(db, mcp, decisionId)
  );
  poller.start();

  // 스케줄러 등록
  const tasks = startScheduler({
    db,
    mcp,
    runAnalysisCycle: () => runAnalysisCycle(mcp, anthropic),
    runDiscoveryCycle: async () => {
      console.error("[pipeline] discovery cycle — Phase 2 예정");
    },
    runCrisisCheck: () => runCrisisCheck(db),
  });

  // ── 수동 트리거 HTTP 서버 ─────────────────────────────────
  // POST /run-now → 분석 사이클 즉시 실행 (cycleId 반환)
  const triggerPort = process.env.TRIGGER_PORT ? parseInt(process.env.TRIGGER_PORT) : 3010;
  const httpServer = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", process.env.NEXT_PUBLIC_APP_URL ?? "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }

    if (req.method === "POST" && req.url === "/run-now") {
      // 비동기로 running 사이클 확인 후 처리
      void (async () => {
        try {
          // running 상태 사이클이 있으면 기존 cycleId 반환
          const existing = await db
            .select({ id: analysisCycles.id })
            .from(analysisCycles)
            .where(eq(analysisCycles.status, "running"))
            .limit(1);

          if (existing[0]) {
            res.writeHead(202, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, cycleId: existing[0].id }));
            return;
          }

          // 새 사이클 생성
          const cycleId = await createCycle(db, "manual", "dashboard");
          const emitter = new CycleEmitter(db, cycleId);

          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, cycleId }));

          runAnalysisCycle(mcp, anthropic, emitter)
            .then(() => emitter.finish())
            .catch((err) => {
              console.error("[orchestrator] manual trigger error:", err);
              return emitter.finish(String(err));
            });
        } catch (err) {
          console.error("[orchestrator] /run-now error:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "내부 오류" }));
          }
        }
      })();
      return;
    }

    if (req.method === "GET" && req.url === "/status") {
      void (async () => {
        try {
          const running = await db
            .select({ id: analysisCycles.id })
            .from(analysisCycles)
            .where(eq(analysisCycles.status, "running"))
            .limit(1);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ running: running.length > 0, cycleId: running[0]?.id ?? null }));
        } catch {
          res.writeHead(500).end();
        }
      })();
      return;
    }

    res.writeHead(404).end();
  });
  httpServer.listen(triggerPort, () => {
    console.error(`[orchestrator] trigger server :${triggerPort} (POST /run-now)`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.error(`[orchestrator] ${signal} received — shutting down`);
    stopScheduler(tasks);
    poller.stop();
    await mcp.disconnect();
    httpServer.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  console.error("[orchestrator] started");
}

main().catch((err) => {
  console.error("[orchestrator] fatal:", err);
  process.exit(1);
});
