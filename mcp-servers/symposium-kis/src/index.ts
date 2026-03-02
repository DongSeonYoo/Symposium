import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { KisClient, KisMockClient } from "./kis-client.js";
import { getPrice } from "./tools/get-price.js";
import { getOhlcv } from "./tools/get-ohlcv.js";
import { getBalance } from "./tools/get-balance.js";
import { getOrders } from "./tools/get-orders.js";
import { placeOrder } from "./tools/place-order.js";
import { cancelOrder } from "./tools/cancel-order.js";
import type { KisBalance, KisPriceData, KisOhlcv, OrderResult } from "@symposium/shared-types";

// ── 클라이언트 선택 ───────────────────────────────────
const isMock = process.env.KIS_MODE === "mock";
const client = isMock ? new KisMockClient() : new KisClient();

if (isMock) {
  console.error("[symposium-kis] ⚠️  MOCK MODE — 실제 API 호출 없음");
}

// ── Mock 더미 데이터 ─────────────────────────────────
function mockPrice(ticker: string): KisPriceData {
  const base = 50_000 + (ticker.charCodeAt(0) * 317) % 100_000;
  return {
    ticker,
    name: `${ticker} 모의종목`,
    currentPrice: base,
    changeRate: +(Math.random() * 4 - 2).toFixed(2),
    changePrice: Math.round((Math.random() * 4 - 2) * base / 100),
    volume: Math.round(Math.random() * 1_000_000),
    openPrice: Math.round(base * 0.99),
    highPrice: Math.round(base * 1.02),
    lowPrice:  Math.round(base * 0.98),
    marketCap: base * 10_000_000,
    per: +(10 + Math.random() * 20).toFixed(1),
    pbr: +(0.5 + Math.random() * 2).toFixed(2),
  };
}

function mockOhlcv(ticker: string, days: number): KisOhlcv[] {
  const base = 50_000 + (ticker.charCodeAt(0) * 317) % 100_000;
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const close = Math.round(base + (Math.random() - 0.5) * base * 0.1);
    return {
      date: date.toISOString().slice(0, 10).replace(/-/g, ""),
      open:  Math.round(close * 0.99),
      high:  Math.round(close * 1.01),
      low:   Math.round(close * 0.98),
      close,
      volume: Math.round(Math.random() * 500_000),
    };
  });
}

function mockBalance(): KisBalance {
  return {
    cash: 50_000_000,
    totalEvaluationAmount: 100_000_000,
    totalPnl: 3_000_000,
    totalPnlRate: 3.0,
    holdings: [
      {
        ticker: "005930",
        name: "삼성전자",
        quantity: 100,
        avgPrice: 70_000,
        currentPrice: 75_000,
        evaluationAmount: 7_500_000,
        pnl: 500_000,
        pnlRate: 7.14,
      },
    ],
  };
}

function mockOrderResult(ticker: string, side: string, quantity: number, price: number): OrderResult {
  return {
    orderId: `MOCK-${Date.now()}`,
    ticker,
    side: side as "BUY" | "SELL",
    quantity,
    price: price === 0 ? mockPrice(ticker).currentPrice : price,
    status: "filled",
    message: "[MOCK] 주문 체결 완료",
    executedAt: new Date().toISOString(),
  };
}

// ── tool 등록 함수 ────────────────────────────────────
function registerTools(s: McpServer): void {
  s.tool("kis_get_price", "종목 현재가, 등락률, 거래량, PER/PBR 조회",
    { ticker: z.string().describe("종목코드 (예: 005930)") },
    async ({ ticker }) => {
      const data = isMock ? mockPrice(ticker) : await getPrice(client as KisClient, ticker);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  s.tool("kis_get_ohlcv", "일봉 OHLCV 데이터 조회",
    {
      ticker: z.string().describe("종목코드"),
      days: z.number().int().min(1).max(365).default(30).describe("조회 일수"),
    },
    async ({ ticker, days }) => {
      const data = isMock ? mockOhlcv(ticker, days) : await getOhlcv(client as KisClient, ticker, days);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  s.tool("kis_get_balance", "계좌 잔고 및 보유 종목 조회", {},
    async () => {
      const data = isMock ? mockBalance() : await getBalance(client as KisClient);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  s.tool("kis_get_orders", "당일 주문 체결 내역 조회", {},
    async () => {
      const data = isMock ? [] : await getOrders(client as KisClient);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  s.tool("kis_place_order", "매수/매도 주문 실행. 반드시 사용자 Confirm 후에만 호출할 것.",
    {
      ticker: z.string().describe("종목코드"),
      side: z.enum(["BUY", "SELL"]).describe("매수/매도"),
      quantity: z.number().int().positive().describe("수량"),
      price: z.number().min(0).describe("지정가 (0이면 시장가)"),
      confirmed: z.literal(true).describe("사용자 승인 여부 — 반드시 true"),
    },
    async ({ ticker, side, quantity, price, confirmed }) => {
      const result = isMock
        ? mockOrderResult(ticker, side, quantity, price)
        : await placeOrder(client as KisClient, {
            ticker, side, quantity, price,
            orderType: price === 0 ? "01" : "00",
            confirmed,
          });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  s.tool("kis_cancel_order", "주문 취소",
    {
      orderId: z.string().describe("주문번호"),
      ticker: z.string().describe("종목코드"),
      quantity: z.number().int().positive().describe("취소 수량"),
    },
    async ({ orderId, ticker, quantity }) => {
      if (isMock) {
        return { content: [{ type: "text", text: JSON.stringify({ orderId, ticker, quantity, status: "cancelled", message: "[MOCK] 취소 완료" }) }] };
      }
      const result = await cancelOrder(client as KisClient, { orderId, ticker, quantity });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
        const s = new McpServer({ name: "symposium-kis", version: "0.1.0" });
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
      console.error("[symposium-kis] handleRequest error:", err);
      if (!res.headersSent) res.writeHead(500).end(String(err));
    }
  });

  httpServer.listen(port, () => {
    console.error(`[symposium-kis] HTTP MCP 서버 시작됨 :${port}/mcp`);
  });
} else {
  // stdio 모드 (Claude Desktop 등)
  const server = new McpServer({ name: "symposium-kis", version: "0.1.0" });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[symposium-kis] stdio MCP 서버 시작됨");
}
