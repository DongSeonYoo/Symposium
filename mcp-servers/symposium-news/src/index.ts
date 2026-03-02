import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NewsClient } from "./news-client.js";
import { searchNews } from "./tools/search-news.js";
import { getSentiment } from "./tools/get-sentiment.js";
import type { NewsSentiment } from "@symposium/shared-types";

// ── 클라이언트 선택 ───────────────────────────────────
const isMock = !process.env.NEWS_API_KEY;
let client: NewsClient | undefined;

if (!isMock) {
  try {
    client = new NewsClient();
  } catch {
    console.error("[symposium-news] NEWS_API_KEY 없음 — MOCK MODE 전환");
  }
}

if (isMock || !client) {
  console.error("[symposium-news] ⚠️  MOCK MODE — 실제 Serper API 호출 없음");
}

// ── Mock 데이터 ──────────────────────────────────────
function mockSentiment(ticker: string, name: string): NewsSentiment {
  return {
    ticker,
    score: 0.2,
    label: "positive",
    articleCount: 5,
    summary: `${name}(${ticker}) — 최근 뉴스 감성: 중립적 긍정 (mock)`,
    items: [{
      title: `${name} 실적 발표 예정`,
      source: "한국경제",
      publishedAt: new Date().toISOString(),
      url: "https://example.com",
      snippet: "분기 실적 발표가 예정되어 있습니다.",
    }],
  };
}

// ── tool 등록 함수 ────────────────────────────────────
function registerTools(s: McpServer): void {
  s.tool(
    "news_search",
    "키워드로 뉴스 기사 검색",
    {
      query: z.string().describe("검색 쿼리"),
      count: z.number().int().min(1).max(20).default(10).describe("최대 기사 수 (기본 10)"),
    },
    async ({ query, count }) => {
      if (isMock || !client) {
        const mockItems = [{
          title: `${query} 관련 뉴스`,
          source: "한국경제",
          publishedAt: new Date().toISOString(),
          url: "https://example.com",
          snippet: `${query}에 관한 최신 뉴스입니다. (mock)`,
        }];
        return { content: [{ type: "text", text: JSON.stringify(mockItems) }] };
      }
      const result = await searchNews(client, query, count);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  s.tool(
    "news_get_sentiment",
    "종목 뉴스 감성 분석 (키워드 기반 스코어링)",
    {
      ticker: z.string().describe("종목코드 (예: 005930)"),
      name: z.string().describe("종목명 (예: 삼성전자)"),
      count: z.number().int().min(1).max(20).default(10).describe("분석할 최대 기사 수"),
    },
    async ({ ticker, name, count }) => {
      if (isMock || !client) {
        return { content: [{ type: "text", text: JSON.stringify(mockSentiment(ticker, name)) }] };
      }
      const result = await getSentiment(client, ticker, name, count);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );
}

// ── 서버 시작 ────────────────────────────────────────
const port = process.env.PORT ? parseInt(process.env.PORT) : undefined;

if (port) {
  // HTTP 모드 — stateful: 세션별 McpServer + transport 관리
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    if (req.url !== "/mcp") { res.writeHead(404).end(); return; }
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        await sessions.get(sessionId)!.handleRequest(req, res);
      } else if (!sessionId) {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
        const s = new McpServer({ name: "symposium-news", version: "0.1.0" });
        registerTools(s);
        transport.onclose = () => { sessions.delete(transport.sessionId!); };
        await s.connect(transport);
        await transport.handleRequest(req, res);
        if (transport.sessionId) sessions.set(transport.sessionId, transport);
      } else {
        res.writeHead(404).end(JSON.stringify({ error: "session not found" }));
      }
    } catch (err) {
      console.error("[symposium-news] handleRequest error:", err);
      if (!res.headersSent) res.writeHead(500).end(String(err));
    }
  });

  httpServer.listen(port, () => {
    console.error(`[symposium-news] HTTP MCP 서버 시작됨 :${port}/mcp`);
  });
} else {
  // stdio 모드 (Claude Desktop 등)
  const server = new McpServer({ name: "symposium-news", version: "0.1.0" });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[symposium-news] stdio MCP 서버 시작됨");
}
