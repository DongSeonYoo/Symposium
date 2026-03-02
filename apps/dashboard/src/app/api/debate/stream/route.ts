import { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  analysisEvents,
  analysisCycles,
  eq,
  and,
  gt,
  asc,
} from "@symposium/db";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CycleIdSchema = z
  .string()
  .regex(UUID_RE, "cycleId must be a valid UUID");

// ── 세션 검증 ────────────────────────────────────────────────
function verifySession(req: NextRequest): boolean {
  return !!req.cookies.get("sym_session")?.value;
}

const POLL_MS = 500;
const TIMEOUT_MS = 15 * 60 * 1_000; // 15분

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(req: NextRequest): Promise<Response> {
  // 세션 검증
  if (!verifySession(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // cycleId 검증
  const cycleId = req.nextUrl.searchParams.get("cycleId");
  const parsed = CycleIdSchema.safeParse(cycleId);
  if (!parsed.success) {
    return new Response("cycleId must be a valid UUID", { status: 400 });
  }

  // Last-Event-ID vs ?after= → 더 큰 값 사용
  const afterHeader = Number(req.headers.get("last-event-id") ?? "0");
  const afterQuery = Number(req.nextUrl.searchParams.get("after") ?? "0");
  let lastSeq = Math.max(afterHeader, afterQuery);

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>, id?: number): void {
        let msg = "";
        if (id !== undefined) msg += `id: ${id}\n`;
        msg += `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(msg));
      }

      function sendPing(): void {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }

      try {
        const db = getDb();

        // ── replay: 연결 시 과거 이벤트 즉시 전송 ──────────────
        const past = await db
          .select()
          .from(analysisEvents)
          .where(
            and(
              eq(analysisEvents.cycleId, parsed.data),
              gt(analysisEvents.seq, lastSeq)
            )
          )
          .orderBy(asc(analysisEvents.seq));

        for (const e of past) {
          send(
            {
              seq: e.seq,
              type: e.eventType,
              cycleId: parsed.data,
              payload: e.payload,
              ts: e.createdAt,
            },
            e.seq
          );
          lastSeq = e.seq;
        }

        // ── 폴링 루프 ──────────────────────────────────────────
        let pingCount = 0;
        while (true) {
          if (Date.now() - startedAt > TIMEOUT_MS) {
            send({
              seq: lastSeq + 1,
              type: "stream:timeout",
              cycleId: parsed.data,
              payload: {},
              ts: new Date().toISOString(),
            });
            controller.close();
            return;
          }

          await sleep(POLL_MS);
          pingCount++;
          // 20초마다 keepalive ping (브라우저 연결 유지)
          if (pingCount % 40 === 0) sendPing();

          const newEvents = await db
            .select()
            .from(analysisEvents)
            .where(
              and(
                eq(analysisEvents.cycleId, parsed.data),
                gt(analysisEvents.seq, lastSeq)
              )
            )
            .orderBy(asc(analysisEvents.seq));

          for (const e of newEvents) {
            send(
              {
                seq: e.seq,
                type: e.eventType,
                cycleId: parsed.data,
                payload: e.payload,
                ts: e.createdAt,
              },
              e.seq
            );
            lastSeq = e.seq;
          }

          // 사이클 상태 확인
          const [cycle] = await db
            .select({ status: analysisCycles.status })
            .from(analysisCycles)
            .where(eq(analysisCycles.id, parsed.data));

          if (cycle?.status === "done" || cycle?.status === "error") {
            send({
              seq: lastSeq + 1,
              type: "stream:end",
              cycleId: parsed.data,
              payload: { status: cycle.status },
              ts: new Date().toISOString(),
            });
            controller.close();
            return;
          }
        }
      } catch (err) {
        console.error("[api/debate/stream] error:", err);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
