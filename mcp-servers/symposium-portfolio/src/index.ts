import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createDbClient } from "@symposium/db";
import { getHoldings } from "./tools/get-holdings.js";
import { saveDecisionSchema, saveDecision } from "./tools/save-decision.js";
import { getDecisionsSchema, getDecisions } from "./tools/get-decisions.js";
import { updateDecisionSchema, updateDecision } from "./tools/update-decision.js";
import { getWatchlist } from "./tools/get-watchlist.js";
import { updateWatchlistSchema, updateWatchlist } from "./tools/update-watchlist.js";
import { getWeights } from "./tools/get-weights.js";

const db = createDbClient({ max: 5 });

// ── tool 등록 함수 (server 인스턴스에 주입) ───────────────────
function registerTools(s: McpServer): void {
  s.tool("portfolio_get_holdings", "현재 보유 종목 전체 조회", {}, async () => {
    const result = await getHoldings(db);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  s.tool("portfolio_save_decision", "LLM 토론 결과(매매 판단)를 DB에 저장하고 pending 상태로 생성", saveDecisionSchema.shape, async (input) => {
    const parsed = saveDecisionSchema.parse(input);
    const result = await saveDecision(db, parsed);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  s.tool("portfolio_get_decisions", "매매 판단 히스토리 조회 (status/ticker 필터 지원)", getDecisionsSchema.shape, async (input) => {
    const parsed = getDecisionsSchema.parse(input);
    const result = await getDecisions(db, parsed);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  s.tool("portfolio_update_decision", "판단 상태 전이 (pending→confirmed/rejected/expired, confirmed→executed). 규칙 위반 시 에러 반환.", updateDecisionSchema.shape, async (input) => {
    const parsed = updateDecisionSchema.parse(input);
    const result = await updateDecision(db, parsed);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  s.tool("portfolio_get_watchlist", "현재 감시 종목 전체 조회", {}, async () => {
    const result = await getWatchlist(db);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  s.tool("portfolio_get_weights", "페르소나 가중치 조회 (기본값: 각 0.2)", {}, async () => {
    const result = await getWeights(db);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  // ZodDiscriminatedUnion은 .shape 미지원 → 필드 직접 선언
  s.tool("portfolio_update_watchlist", '감시 종목 추가(op: "add") 또는 삭제(op: "remove")', {
    op: z.enum(["add", "remove"]).describe('"add" | "remove"'),
    ticker: z.string().max(10).describe("종목코드"),
    name: z.string().max(100).optional().describe('op="add" 시 필수'),
    source: z.enum(["manual", "llm_discovered"]).optional().describe('op="add" 시 출처'),
  }, async (input: { op: string; ticker: string; name?: string; source?: string }) => {
    const parsed = updateWatchlistSchema.parse(input);
    const result = await updateWatchlist(db, parsed);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });
}

// ── 서버 시작 ────────────────────────────────────────────────
const port = process.env.PORT ? parseInt(process.env.PORT) : undefined;

if (port) {
  // HTTP 모드 — stateful: 세션별 McpServer + transport 관리
  // SDK 제약: McpServer 인스턴스당 transport 하나만 connect 가능
  // → 클라이언트 연결마다 새 인스턴스 생성, mcp-session-id로 라우팅
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    if (req.url !== "/mcp") { res.writeHead(404).end(); return; }
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        // 기존 세션 요청
        await sessions.get(sessionId)!.handleRequest(req, res);
      } else if (!sessionId) {
        // 새 연결 — initialize 요청
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
        const s = new McpServer({ name: "symposium-portfolio", version: "0.0.0" });
        registerTools(s);
        transport.onclose = () => { sessions.delete(transport.sessionId!); };
        await s.connect(transport);
        await transport.handleRequest(req, res);
        // handleRequest 완료 후 sessionId가 확정됨
        if (transport.sessionId) sessions.set(transport.sessionId, transport);
      } else {
        res.writeHead(404).end(JSON.stringify({ error: "session not found" }));
      }
    } catch (err) {
      console.error("[symposium-portfolio] handleRequest error:", err);
      if (!res.headersSent) res.writeHead(500).end(String(err));
    }
  });

  httpServer.listen(port, () => {
    console.error(`[symposium-portfolio] HTTP MCP server listening on :${port}/mcp`);
  });
} else {
  // stdio 모드 (Claude Desktop 등)
  const server = new McpServer({ name: "symposium-portfolio", version: "0.0.0" });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[symposium-portfolio] stdio MCP server started");
}
