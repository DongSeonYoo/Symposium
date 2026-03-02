import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { z } from "zod";
import { createDbClient } from "@symposium/db";
import { getHoldings } from "./tools/get-holdings.js";
import { saveDecisionSchema, saveDecision } from "./tools/save-decision.js";
import { getDecisionsSchema, getDecisions } from "./tools/get-decisions.js";
import { updateDecisionSchema, updateDecision } from "./tools/update-decision.js";
import { getWatchlist } from "./tools/get-watchlist.js";
import { updateWatchlistSchema, updateWatchlist } from "./tools/update-watchlist.js";

const db = createDbClient({ max: 5 });

const server = new McpServer({
  name: "symposium-portfolio",
  version: "0.0.0",
});

// ── 보유 종목 조회 ────────────────────────────────────────────
server.tool(
  "portfolio_get_holdings",
  "현재 보유 종목 전체 조회",
  {},
  async () => {
    const result = await getHoldings(db);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

// ── 판단 저장 ────────────────────────────────────────────────
server.tool(
  "portfolio_save_decision",
  "LLM 토론 결과(매매 판단)를 DB에 저장하고 pending 상태로 생성",
  saveDecisionSchema.shape,
  async (input) => {
    const parsed = saveDecisionSchema.parse(input);
    const result = await saveDecision(db, parsed);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

// ── 판단 히스토리 조회 ────────────────────────────────────────
server.tool(
  "portfolio_get_decisions",
  "매매 판단 히스토리 조회 (status/ticker 필터 지원)",
  getDecisionsSchema.shape,
  async (input) => {
    const parsed = getDecisionsSchema.parse(input);
    const result = await getDecisions(db, parsed);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

// ── 판단 상태 업데이트 ────────────────────────────────────────
server.tool(
  "portfolio_update_decision",
  "판단 상태 전이 (pending→confirmed/rejected/expired, confirmed→executed). 규칙 위반 시 에러 반환.",
  updateDecisionSchema.shape,
  async (input) => {
    const parsed = updateDecisionSchema.parse(input);
    const result = await updateDecision(db, parsed);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

// ── 감시 종목 조회 ────────────────────────────────────────────
server.tool(
  "portfolio_get_watchlist",
  "현재 감시 종목 전체 조회",
  {},
  async () => {
    const result = await getWatchlist(db);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

// ── 감시 종목 추가/삭제 ───────────────────────────────────────
// ZodDiscriminatedUnion은 .shape 미지원 → 필드 직접 선언
server.tool(
  "portfolio_update_watchlist",
  '감시 종목 추가(op: "add") 또는 삭제(op: "remove")',
  {
    op: z.enum(["add", "remove"]).describe('"add" | "remove"'),
    ticker: z.string().max(10).describe("종목코드"),
    name: z.string().max(100).optional().describe('op="add" 시 필수'),
    source: z.enum(["manual", "llm_discovered"]).optional().describe('op="add" 시 출처'),
  },
  async (input: { op: string; ticker: string; name?: string; source?: string }) => {
    const parsed = updateWatchlistSchema.parse(input);
    const result = await updateWatchlist(db, parsed);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

// ── 서버 시작 ────────────────────────────────────────────────
const port = process.env.PORT ? parseInt(process.env.PORT) : undefined;

if (port) {
  // HTTP 모드 (orchestrator 연동, Railway 배포)
  // stateless: transport 하나를 서버 생명주기 동안 재사용
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    if (req.url === "/mcp") {
      await transport.handleRequest(req, res);
    } else {
      res.writeHead(404).end();
    }
  });
  httpServer.listen(port, () => {
    console.error(`[symposium-portfolio] HTTP MCP server listening on :${port}/mcp`);
  });
} else {
  // stdio 모드 (Claude Desktop 등)
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[symposium-portfolio] stdio MCP server started");
}
