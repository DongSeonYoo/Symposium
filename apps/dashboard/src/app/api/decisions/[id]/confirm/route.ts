import { NextRequest, NextResponse } from "next/server";
import { callUpdateDecision } from "@/lib/portfolio-mcp";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum(["confirmed", "rejected"]),
  reason: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 입력 검증
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청 형식입니다." },
      { status: 400 }
    );
  }

  // 만료 검증은 portfolio MCP가 단일 처리 — 여기서 중복 검증 안 함.
  // MCP가 throw하는 에러 메시지로 400/500 판별.
  try {
    const result = await callUpdateDecision({
      id,
      status: body.action,
      actor: "dashboard",   // actor는 항상 "dashboard" 고정
      reason: body.reason,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = String(err);

    // MCP 서버에서 throw된 에러 종류에 따라 HTTP 상태 코드 분류
    if (
      message.includes("expired") ||
      message.includes("Forbidden transition") ||
      message.includes("not found")
    ) {
      return NextResponse.json(
        { ok: false, error: message },
        { status: 400 }
      );
    }

    console.error("[confirm-route] unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
