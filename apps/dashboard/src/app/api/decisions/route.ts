import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decisions, desc } from "@symposium/db";

export const dynamic = "force-dynamic";

// GET /api/decisions — 최근 판단 목록 (TanStack Query 폴링용)
export async function GET(_req: NextRequest) {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: decisions.id,
        ticker: decisions.ticker,
        name: decisions.name,
        action: decisions.action,
        quantity: decisions.quantity,
        price: decisions.price,
        confidence: decisions.confidence,
        status: decisions.status,
        expiresAt: decisions.expiresAt,
        createdAt: decisions.createdAt,
      })
      .from(decisions)
      .orderBy(desc(decisions.createdAt))
      .limit(30);

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/decisions] error:", err);
    return NextResponse.json({ error: "DB 조회 실패" }, { status: 500 });
  }
}
