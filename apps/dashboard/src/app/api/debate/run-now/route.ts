import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── 보안 검증 (api-keys route 동일 패턴) ─────────────────────
function verifyRequest(req: NextRequest): NextResponse | null {
  const session = req.cookies.get("sym_session");
  if (!session?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    const rawOrigin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
    try {
      const requestOrigin = new URL(rawOrigin).origin;
      const allowedOrigin = new URL(appUrl).origin;
      if (requestOrigin !== allowedOrigin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return null;
}

// POST /api/debate/run-now → orchestrator /run-now 위임 → { ok, cycleId }
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = verifyRequest(req);
  if (denied) return denied;

  const triggerUrl =
    process.env.ORCHESTRATOR_TRIGGER_URL ?? "http://localhost:3010";

  try {
    const res = await fetch(`${triggerUrl}/run-now`, { method: "POST" });
    const data = await res.json() as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[api/debate/run-now] orchestrator 연결 실패:", err);
    return NextResponse.json(
      { error: "orchestrator 연결 실패" },
      { status: 503 }
    );
  }
}
