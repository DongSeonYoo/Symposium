import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface UpdateDecisionInput {
  id: string;
  status: "confirmed" | "rejected";
  actor: "dashboard";  // dashboard는 항상 "dashboard" 고정
  reason?: string;
}

export interface UpdateDecisionResult {
  id: string;
  status: string;
}

/**
 * portfolio MCP의 portfolio_update_decision 호출.
 * 만료 검증은 MCP 서버 내부에서 수행 — 여기서 중복 검증 안 함.
 * 에러는 그대로 throw (호출자에서 400/500 매핑).
 */
export async function callUpdateDecision(
  input: UpdateDecisionInput
): Promise<UpdateDecisionResult> {
  const url = process.env.MCP_PORTFOLIO_URL;
  if (!url) throw new Error("MCP_PORTFOLIO_URL is not set");

  const client = new Client({ name: "dashboard", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));

  await client.connect(transport);
  try {
    const result = await client.callTool({
      name: "portfolio_update_decision",
      arguments: input as unknown as Record<string, unknown>,
    });
    // MCP tool 결과는 content 배열 형태
    const text = (result.content as Array<{ type: string; text: string }>)
      .find((c) => c.type === "text")?.text;
    if (!text) throw new Error("portfolio_update_decision returned empty result");
    return JSON.parse(text) as UpdateDecisionResult;
  } finally {
    await client.close();
  }
}
