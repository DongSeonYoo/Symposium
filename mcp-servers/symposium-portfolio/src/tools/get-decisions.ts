import { z } from "zod";
import { type DbClient, decisions, eq, and, desc } from "@symposium/db";

export const getDecisionsSchema = z.object({
  status: z
    .enum(["pending", "confirmed", "rejected", "expired", "executed"])
    .optional(),
  ticker: z.string().max(10).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type GetDecisionsInput = z.infer<typeof getDecisionsSchema>;

export async function getDecisions(db: DbClient, input: GetDecisionsInput) {
  const conditions = [];
  if (input.status) conditions.push(eq(decisions.status, input.status));
  if (input.ticker) conditions.push(eq(decisions.ticker, input.ticker));

  const rows = await db
    .select()
    .from(decisions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(decisions.createdAt))
    .limit(input.limit);

  return rows.map((d) => ({
    id: d.id,
    ticker: d.ticker,
    name: d.name,
    action: d.action,
    quantity: d.quantity,
    price: Number(d.price),
    confidence: d.confidence,
    stopLoss: d.stopLoss != null ? Number(d.stopLoss) : null,
    takeProfit: d.takeProfit != null ? Number(d.takeProfit) : null,
    reasons: d.reasons,
    risks: d.risks,
    personaVotes: d.personaVotes,
    debateSummary: d.debateSummary,
    macroContext: d.macroContext,
    status: d.status,
    expiresAt: d.expiresAt.toISOString(),
    confirmedAt: d.confirmedAt?.toISOString() ?? null,
    executedAt: d.executedAt?.toISOString() ?? null,
    orderResult: d.orderResult,
    createdAt: d.createdAt.toISOString(),
  }));
}
