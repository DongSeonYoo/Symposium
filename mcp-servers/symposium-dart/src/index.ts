import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { decrypt } from "@symposium/crypto";
import { createDbClient, apiKeys, eq } from "@symposium/db";
import { DartClient } from "./dart-client.js";
import { searchCompany } from "./tools/search-company.js";
import { getDisclosures } from "./tools/get-disclosures.js";
import { getFinancial } from "./tools/get-financial.js";
import type { DartDisclosure, DartFinancial } from "@symposium/shared-types";

// ── 기동 시 DB에서 DART_API_KEY 로드 (process.env 우선) ────────
async function loadDartKeyFromDb(): Promise<void> {
  if (process.env.DART_API_KEY) return; // 환경변수 우선
  const secret = process.env.ENCRYPTION_SECRET;
  const dbUrl = process.env.DATABASE_URL;
  if (!secret || !dbUrl) return; // ENCRYPTION_SECRET/DB 없으면 mock으로 동작

  try {
    const db = createDbClient({ max: 1 });
    const row = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyName, "DART_API_KEY"),
    });
    if (row) {
      process.env.DART_API_KEY = decrypt(
        { encryptedValue: row.encryptedValue, iv: row.iv, authTag: row.authTag },
        secret
      );
      console.error("[symposium-dart] DART_API_KEY loaded from DB");
    }
  } catch {
    // 실패 시 경고 + mock mode degrade
    console.error("[symposium-dart] WARN: DB key load failed — mock mode will be used");
  }
}

await loadDartKeyFromDb();

// ── 클라이언트 선택 ───────────────────────────────────
const isMock = !process.env.DART_API_KEY;
let client: DartClient | undefined;

if (!isMock) {
  try {
    client = new DartClient();
  } catch {
    console.error("[symposium-dart] DART_API_KEY 없음 — MOCK MODE 전환");
  }
}

if (isMock || !client) {
  console.error("[symposium-dart] ⚠️  MOCK MODE — 실제 DART API 호출 없음");
}

// ── Mock 데이터 ──────────────────────────────────────
function mockDisclosures(corpCode: string): DartDisclosure[] {
  return [{
    ticker: corpCode,
    companyName: `${corpCode} 모의법인`,
    disclosureType: "사업보고서",
    title: "2024년 사업보고서",
    filedAt: new Date().toISOString(),
    url: "https://dart.fss.or.kr",
  }];
}

function mockFinancial(corpCode: string, year: number): DartFinancial {
  return {
    ticker: corpCode,
    companyName: `${corpCode} 모의법인`,
    year,
    quarter: 4,
    revenue: 300_000_000_000,
    operatingProfit: 30_000_000_000,
    netIncome: 20_000_000_000,
    totalAssets: 500_000_000_000,
    totalLiabilities: 200_000_000_000,
    totalEquity: 300_000_000_000,
    eps: 5000,
    roe: 6.67,
    debtRatio: 66.67,
  };
}

// ── tool 등록 함수 ────────────────────────────────────
function registerTools(s: McpServer): void {
  s.tool(
    "dart_search_company",
    "기업명 또는 종목코드로 DART corpCode 조회",
    { query: z.string().describe("기업명 또는 종목코드") },
    async ({ query }) => {
      if (isMock || !client) {
        const result = [{ corpCode: query, corpName: `${query} 모의법인`, ticker: query }];
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
      const result = await searchCompany(client, query);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  s.tool(
    "dart_get_disclosures",
    "종목 최근 공시 목록 조회",
    {
      corpCode: z.string().describe("DART corp_code (dart_search_company로 조회)"),
      days: z.number().int().min(1).max(365).default(30).describe("조회 기간 (일)"),
    },
    async ({ corpCode, days }) => {
      if (isMock || !client) {
        return { content: [{ type: "text", text: JSON.stringify(mockDisclosures(corpCode)) }] };
      }
      const result = await getDisclosures(client, corpCode, days);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  s.tool(
    "dart_get_financial",
    "단일회사 전체 재무제표 조회 (연결재무제표 우선)",
    {
      corpCode: z.string().describe("DART corp_code"),
      year: z.number().int().describe("사업연도 (예: 2024)"),
      quarter: z.union([
        z.literal(1), z.literal(2), z.literal(3), z.literal(4),
      ]).default(4).describe("분기 (1~4, 기본값: 4=연간)"),
    },
    async ({ corpCode, year, quarter }) => {
      if (isMock || !client) {
        return { content: [{ type: "text", text: JSON.stringify(mockFinancial(corpCode, year)) }] };
      }
      const result = await getFinancial(client, corpCode, year, quarter as 1 | 2 | 3 | 4);
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
        const s = new McpServer({ name: "symposium-dart", version: "0.1.0" });
        registerTools(s);
        transport.onclose = () => { sessions.delete(transport.sessionId!); };
        await s.connect(transport);
        await transport.handleRequest(req, res);
        if (transport.sessionId) sessions.set(transport.sessionId, transport);
      } else {
        res.writeHead(404).end(JSON.stringify({ error: "session not found" }));
      }
    } catch (err) {
      console.error("[symposium-dart] handleRequest error:", err);
      if (!res.headersSent) res.writeHead(500).end(String(err));
    }
  });

  httpServer.listen(port, () => {
    console.error(`[symposium-dart] HTTP MCP 서버 시작됨 :${port}/mcp`);
  });
} else {
  // stdio 모드 (Claude Desktop 등)
  const server = new McpServer({ name: "symposium-dart", version: "0.1.0" });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[symposium-dart] stdio MCP 서버 시작됨");
}
