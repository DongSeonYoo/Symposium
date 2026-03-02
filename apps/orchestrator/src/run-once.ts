// 분석 사이클 1회 수동 실행 — E2E 테스트용
// pnpm --filter orchestrator exec tsx --env-file=../../.env src/run-once.ts

import Anthropic from "@anthropic-ai/sdk";
import { createDbClient } from "@symposium/db";
import { McpClientManager } from "./mcp/client-manager.js";
import { collectMarketData } from "./pipeline/collect.js";
import { runRound1, runRound2, runRound3 } from "./pipeline/debate.js";
import { synthesize } from "./pipeline/synthesize.js";
import type { PersonaId } from "@symposium/shared-types";

const db = createDbClient({ max: 5 });
const mcp = new McpClientManager();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

console.error("[run-once] MCP 연결 중...");
await mcp.connect();
console.error("[run-once] 연결 완료");

// 페르소나 가중치 — portfolio MCP에서 로드 (portfolio_get_weights)
const weightsRaw = await mcp.callTool("portfolio", "portfolio_get_weights", {}) as Record<string, number>;
const weights: Record<PersonaId, number> = { buffett: 0.2, soros: 0.2, dalio: 0.2, lynch: 0.2, parkhyunju: 0.2, ...weightsRaw };

const watchlistRaw = await mcp.callTool("portfolio", "portfolio_get_watchlist", {}) as { ticker: string; name: string }[];
console.error(`[run-once] watchlist: ${watchlistRaw.map(w => w.ticker).join(", ")}`);

if (!watchlistRaw.length) {
  console.error("[run-once] watchlist 비어있음, 종료");
  process.exit(0);
}

// 첫 번째 종목만 테스트
const item = watchlistRaw[0]!;
console.error(`[run-once] 분석 시작: ${item.ticker} ${item.name}`);

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

console.error("[run-once] Round 1...");
const round1 = await runRound1(anthropic, ctx);
console.error("[run-once] Round 2...");
const round2 = await runRound2(anthropic, ctx, round1);
console.error("[run-once] Round 3...");
const round3 = await runRound3(anthropic, ctx, round2);
console.error("[run-once] 합산...");
const synthesis = await synthesize(anthropic, { ticker: item.ticker, name: item.name, round3, weights });

console.error(`[run-once] 결과: ${synthesis.action} confidence=${synthesis.confidence}`);

const saved = await mcp.callTool("portfolio", "portfolio_save_decision", {
  ticker: item.ticker,
  name: item.name,
  action: synthesis.action,
  quantity: 0,
  price: 0,
  confidence: synthesis.confidence,
  reasons: { technical: "", fundamental: "", sentiment: "", macro: "" },
  risks: [],
  personaVotes: synthesis.personaVotes,
  debateSummary: synthesis.debateSummary,
  macroContext: ctx.macroContext,
  expiresInMinutes: 30,
}) as { id: string };

console.error(`[run-once] decision 저장 완료 — id: ${(saved as unknown as { id?: string }).id ?? JSON.stringify(saved)}`);

await mcp.disconnect();
db.$client.end();
