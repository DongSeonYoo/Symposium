import { getDb } from "@/lib/db";
import { decisions, eq, desc } from "@symposium/db";

export const dynamic = "force-dynamic";

// SSE: pending 판단만 10초마다 폴링해서 클라이언트에 push
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      function send(data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      }

      async function poll() {
        try {
          const db = getDb();
          const rows = await db
            .select({
              id: decisions.id,
              ticker: decisions.ticker,
              name: decisions.name,
              action: decisions.action,
              status: decisions.status,
              expiresAt: decisions.expiresAt,
              createdAt: decisions.createdAt,
            })
            .from(decisions)
            .where(eq(decisions.status, "pending"))
            .orderBy(desc(decisions.createdAt))
            .limit(20);

          send({ type: "decisions", data: rows });
        } catch (err) {
          send({ type: "error", message: String(err) });
        }
      }

      // 연결 직후 즉시 전송
      await poll();

      // 이후 10초마다 폴링
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        await poll();
      }, 10_000);

      // keep-alive ping (30초마다)
      const ping = setInterval(() => {
        if (closed) { clearInterval(ping); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
          clearInterval(ping);
        }
      }, 30_000);
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
