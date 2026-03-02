import { describe, it, expect, vi, beforeEach } from "vitest";

// portfolio-mcp 모듈 모킹
vi.mock("@/lib/portfolio-mcp", () => ({
  callUpdateDecision: vi.fn(),
}));

import { POST } from "../app/api/decisions/[id]/confirm/route";
import { callUpdateDecision } from "@/lib/portfolio-mcp";
import { NextRequest } from "next/server";

const mockedCall = vi.mocked(callUpdateDecision);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/decisions/test-id/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PARAMS = Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/decisions/[id]/confirm", () => {
  it("actor는 항상 'dashboard'로 고정되어 MCP에 전달됨", async () => {
    mockedCall.mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440000", status: "confirmed" });

    const req = makeRequest({ action: "confirmed" });
    const res = await POST(req, { params: PARAMS });

    expect(res.status).toBe(200);
    expect(mockedCall).toHaveBeenCalledWith(
      expect.objectContaining({ actor: "dashboard" })
    );
  });

  it("action=confirmed → MCP status=confirmed 전달", async () => {
    mockedCall.mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440000", status: "confirmed" });

    const req = makeRequest({ action: "confirmed" });
    await POST(req, { params: PARAMS });

    expect(mockedCall).toHaveBeenCalledWith(
      expect.objectContaining({ status: "confirmed" })
    );
  });

  it("action=rejected → MCP status=rejected 전달", async () => {
    mockedCall.mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440000", status: "rejected" });

    const req = makeRequest({ action: "rejected" });
    await POST(req, { params: PARAMS });

    expect(mockedCall).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected" })
    );
  });

  it("잘못된 action 값 → 400 반환, MCP 미호출", async () => {
    const req = makeRequest({ action: "executed" }); // 유효하지 않은 값
    const res = await POST(req, { params: PARAMS });

    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(mockedCall).not.toHaveBeenCalled();
  });

  it("MCP가 'expired' 에러 throw → 400 반환", async () => {
    mockedCall.mockRejectedValueOnce(new Error("Cannot confirm: decision has already expired"));

    const req = makeRequest({ action: "confirmed" });
    const res = await POST(req, { params: PARAMS });

    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("expired");
  });

  it("MCP가 'Forbidden transition' 에러 throw → 400 반환", async () => {
    mockedCall.mockRejectedValueOnce(new Error("Forbidden transition: dashboard cannot move confirmed → confirmed"));

    const req = makeRequest({ action: "confirmed" });
    const res = await POST(req, { params: PARAMS });

    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("MCP가 'not found' 에러 throw → 400 반환", async () => {
    mockedCall.mockRejectedValueOnce(new Error("Decision not found: 550e8400-e29b-41d4-a716-446655440000"));

    const req = makeRequest({ action: "confirmed" });
    const res = await POST(req, { params: PARAMS });

    expect(res.status).toBe(400);
  });

  it("MCP 예상치 못한 에러 → 500 반환", async () => {
    mockedCall.mockRejectedValueOnce(new Error("DB connection failed"));

    const req = makeRequest({ action: "confirmed" });
    const res = await POST(req, { params: PARAMS });

    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("reason 필드 전달 시 MCP에 그대로 전달됨", async () => {
    mockedCall.mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440000", status: "rejected" });

    const req = makeRequest({ action: "rejected", reason: "리스크 과대" });
    await POST(req, { params: PARAMS });

    expect(mockedCall).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "리스크 과대" })
    );
  });
});
