import { z } from "zod";
import { type DbClient, holdings } from "@symposium/db";

export const getHoldingsSchema = z.object({});

export async function getHoldings(db: DbClient) {
  const rows = await db.select().from(holdings);
  return rows.map((h) => ({
    id: h.id,
    ticker: h.ticker,
    name: h.name,
    quantity: h.quantity,
    avgPrice: Number(h.avgPrice),
    updatedAt: h.updatedAt.toISOString(),
  }));
}
