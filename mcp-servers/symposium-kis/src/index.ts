import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { KisClient } from "./kis-client.js";
import { getPrice } from "./tools/get-price.js";
import { getOhlcv } from "./tools/get-ohlcv.js";
import { getBalance } from "./tools/get-balance.js";
import { getOrders } from "./tools/get-orders.js";
import { placeOrder } from "./tools/place-order.js";
import { cancelOrder } from "./tools/cancel-order.js";

const client = new KisClient();

const server = new McpServer({
  name: "symposium-kis",
  version: "0.1.0",
});

// ── kis_get_price ────────────────────────────────────
server.tool(
  "kis_get_price",
  "종목 현재가, 등락률, 거래량, PER/PBR 조회",
  { ticker: z.string().describe("종목코드 (예: 005930)") },
  async ({ ticker }) => {
    const data = await getPrice(client, ticker);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── kis_get_ohlcv ────────────────────────────────────
server.tool(
  "kis_get_ohlcv",
  "일봉 OHLCV 데이터 조회",
  {
    ticker: z.string().describe("종목코드"),
    days: z.number().int().min(1).max(365).default(30).describe("조회 일수"),
  },
  async ({ ticker, days }) => {
    const data = await getOhlcv(client, ticker, days);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── kis_get_balance ──────────────────────────────────
server.tool(
  "kis_get_balance",
  "계좌 잔고 및 보유 종목 조회",
  {},
  async () => {
    const data = await getBalance(client);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── kis_get_orders ───────────────────────────────────
server.tool(
  "kis_get_orders",
  "당일 주문 체결 내역 조회",
  {},
  async () => {
    const data = await getOrders(client);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── kis_place_order ──────────────────────────────────
server.tool(
  "kis_place_order",
  "매수/매도 주문 실행. 반드시 사용자 Confirm 후에만 호출할 것.",
  {
    ticker: z.string().describe("종목코드"),
    side: z.enum(["BUY", "SELL"]).describe("매수/매도"),
    quantity: z.number().int().positive().describe("수량"),
    price: z.number().min(0).describe("지정가 (0이면 시장가)"),
    confirmed: z.literal(true).describe("사용자 승인 여부 — 반드시 true"),
  },
  async ({ ticker, side, quantity, price, confirmed }) => {
    const result = await placeOrder(client, {
      ticker,
      side,
      quantity,
      price,
      orderType: price === 0 ? "01" : "00",
      confirmed,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── kis_cancel_order ─────────────────────────────────
server.tool(
  "kis_cancel_order",
  "주문 취소",
  {
    orderId: z.string().describe("주문번호"),
    ticker: z.string().describe("종목코드"),
    quantity: z.number().int().positive().describe("취소 수량"),
  },
  async ({ orderId, ticker, quantity }) => {
    const result = await cancelOrder(client, { orderId, ticker, quantity });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── 서버 시작 ────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[symposium-kis] MCP 서버 시작됨");
