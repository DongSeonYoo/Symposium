import Anthropic from "@anthropic-ai/sdk";
import { createDbClient } from "@symposium/db";
import { McpClientManager } from "./mcp/client-manager.js";
import { ConfirmPoller } from "./pipeline/confirm-poller.js";
import { executeOrder } from "./pipeline/execute-order.js";
import { collectMarketData } from "./pipeline/collect.js";
import { runRound1, runRound2, runRound3 } from "./pipeline/debate.js";
import { synthesize } from "./pipeline/synthesize.js";
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
  anthropic: Anthropic
): Promise<void> {
  console.error("[pipeline] analysis cycle start");

  // watchlist 조회
  const watchlistRaw = await mcp.callTool("portfolio", "portfolio_get_watchlist", {}) as { ticker: string; name: string }[];
  if (!Array.isArray(watchlistRaw) || watchlistRaw.length === 0) {
    console.error("[pipeline] watchlist empty, skipping");
    return;
  }

  const weights = await loadWeights(mcp);

  for (const item of watchlistRaw) {
    try {
      console.error(`[pipeline] analyzing ${item.ticker} (${item.name})`);

      // 데이터 수집 (Phase 2: KIS + DART + NEWS MCP 연동)
      const collected = await collectMarketData(item.ticker, item.name, mcp);

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
      const round1 = await runRound1(anthropic, ctx);
      const round2 = await runRound2(anthropic, ctx, round1);
      const round3 = await runRound3(anthropic, ctx, round2);

      // 최종 합산
      const synthesis = await synthesize(anthropic, {
        ticker: item.ticker,
        name: item.name,
        round3,
        weights,
      });

      // 판단 저장
      await mcp.callTool("portfolio", "portfolio_save_decision", {
        ticker: item.ticker,
        name: item.name,
        action: synthesis.action,
        quantity: 0,        // Phase 1: 수량은 사용자가 confirm 시 수정
        price: 0,
        confidence: synthesis.confidence,
        reasons: { technical: "", fundamental: "", sentiment: "", macro: "" },
        risks: [],
        personaVotes: synthesis.personaVotes,
        debateSummary: synthesis.debateSummary,
        macroContext: ctx.macroContext,
        expiresInMinutes: 30,
      });

      console.error(`[pipeline] saved decision: ${synthesis.action}(${synthesis.confidence}) for ${item.ticker}`);
    } catch (err) {
      // 종목별 실패 격리 — 다음 종목 계속 처리
      console.error(`[pipeline] failed for ${item.ticker}:`, err);
    }
  }

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

// ── 진입점 ───────────────────────────────────────────────────
async function main(): Promise<void> {
  validateEnv();

  const db = createDbClient({ max: 10 });
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

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.error(`[orchestrator] ${signal} received — shutting down`);
    stopScheduler(tasks);
    poller.stop();
    await mcp.disconnect();
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
