import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ── 에러 분류 ────────────────────────────────────────────────
export class McpTimeoutError extends Error {
  constructor(server: string, tool: string, ms: number) {
    super(`MCP timeout: ${server}.${tool} (${ms}ms)`);
    this.name = "McpTimeoutError";
  }
}

export class McpPermanentError extends Error {
  constructor(server: string, tool: string, cause: unknown) {
    super(`MCP permanent error: ${server}.${tool} — ${String(cause)}`);
    this.name = "McpPermanentError";
  }
}

// ── 설정 ────────────────────────────────────────────────────
const SERVER_URLS: Record<string, string | undefined> = {
  kis: process.env.MCP_KIS_URL,
  dart: process.env.MCP_DART_URL,
  portfolio: process.env.MCP_PORTFOLIO_URL,
  news: process.env.MCP_NEWS_URL,
};

const TIMEOUT_MS = 15_000;   // 도구 호출 타임아웃
const MAX_RETRIES = 2;        // 일시적 오류 재시도 횟수
const RETRY_DELAY_MS = 1_000; // 재시도 간격

// ── 재시도 불가 에러 판별 ────────────────────────────────────
function isPermanent(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  // 인증 오류, 잘못된 입력, 비즈니스 규칙 위반 → 재시도 의미 없음
  return (
    msg.includes("confirmed") ||
    msg.includes("invalid") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("not found")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// ── McpClientManager ─────────────────────────────────────────
export class McpClientManager {
  private clients = new Map<string, Client>();

  /** 모든 MCP 서버에 연결 */
  async connect(): Promise<void> {
    const entries = Object.entries(SERVER_URLS).filter(([, url]) => url);

    await Promise.all(
      entries.map(async ([name, url]) => {
        const client = new Client({ name: `orchestrator-${name}`, version: "0.0.0" });
        const transport = new StreamableHTTPClientTransport(new URL(url!));
        await client.connect(transport);
        this.clients.set(name, client);
        console.error(`[mcp] connected: ${name} → ${url}`);
      })
    );
  }

  /** 모든 연결 해제 */
  async disconnect(): Promise<void> {
    await Promise.all(
      [...this.clients.values()].map((c) => c.close())
    );
    this.clients.clear();
  }

  /**
   * MCP tool 호출 — 표준화된 에러 처리:
   * - 타임아웃 → McpTimeoutError
   * - 영구 오류 → McpPermanentError (재시도 없음)
   * - 일시 오류 → MAX_RETRIES 재시도 후 McpPermanentError
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new McpPermanentError(
        serverName,
        toolName,
        `server not connected (url: ${SERVER_URLS[serverName] ?? "not configured"})`
      );
    }

    let lastErr: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await Promise.race([
          client.callTool({ name: toolName, arguments: args }),
          sleep(TIMEOUT_MS).then(() => {
            throw new McpTimeoutError(serverName, toolName, TIMEOUT_MS);
          }),
        ]);

        // MCP 결과 파싱: content[0].text가 JSON 문자열인 경우 파싱
        const content = (result as { content?: { type: string; text: string }[] }).content;
        if (content?.[0]?.type === "text") {
          try {
            return JSON.parse(content[0].text);
          } catch {
            return content[0].text;
          }
        }
        return result;
      } catch (err) {
        lastErr = err;

        // 타임아웃 또는 영구 오류 → 즉시 throw
        if (err instanceof McpTimeoutError || isPermanent(err)) {
          throw err instanceof McpTimeoutError
            ? err
            : new McpPermanentError(serverName, toolName, err);
        }

        // 마지막 시도였으면 throw
        if (attempt === MAX_RETRIES) break;

        console.error(`[mcp] retry ${attempt + 1}/${MAX_RETRIES}: ${serverName}.${toolName} — ${err}`);
        await sleep(RETRY_DELAY_MS);
      }
    }

    throw new McpPermanentError(serverName, toolName, lastErr);
  }
}
