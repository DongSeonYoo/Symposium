import { z } from "zod";
import { type DbClient, decisions, decisionEvents } from "@symposium/db";

export const saveDecisionSchema = z.object({
  ticker: z.string().max(10),
  name: z.string().max(100),
  action: z.enum(["BUY", "SELL", "HOLD"]),
  quantity: z.number().int().min(0),
  price: z.number().min(0),
  confidence: z.number().int().min(0).max(100),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
  reasons: z.object({
    technical: z.string(),
    fundamental: z.string(),
    sentiment: z.string(),
    macro: z.string(),
  }),
  risks: z.array(z.string()),
  personaVotes: z.array(
    z.object({
      persona: z.string(),
      action: z.enum(["BUY", "SELL", "HOLD"]),
      confidence: z.number(),
      keyArgument: z.string(),
      weight: z.number(),
    })
  ),
  debateSummary: z.string().optional(),
  macroContext: z.record(z.unknown()).default({}),
  expiresInMinutes: z.number().int().min(1).max(60).default(30),
});

export type SaveDecisionInput = z.infer<typeof saveDecisionSchema>;

export async function saveDecision(db: DbClient, input: SaveDecisionInput) {
  const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60 * 1000);

  const [row] = await db
    .insert(decisions)
    .values({
      ticker: input.ticker,
      name: input.name,
      action: input.action,
      quantity: input.quantity,
      price: String(input.price),
      confidence: input.confidence,
      stopLoss: input.stopLoss != null ? String(input.stopLoss) : null,
      takeProfit: input.takeProfit != null ? String(input.takeProfit) : null,
      reasons: input.reasons,
      risks: input.risks,
      personaVotes: input.personaVotes,
      debateSummary: input.debateSummary ?? null,
      macroContext: input.macroContext,
      status: "pending",
      expiresAt,
    })
    .returning();

  // 감사 로그: 최초 생성
  await db.insert(decisionEvents).values({
    decisionId: row.id,
    actor: "orchestrator",
    fromStatus: null,
    toStatus: "pending",
    reason: "신규 판단 생성",
  });

  return { id: row.id, status: row.status, expiresAt: row.expiresAt.toISOString() };
}
