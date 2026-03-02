import { z } from "zod";
import { type DbClient, watchlist } from "@symposium/db";

export const getWatchlistSchema = z.object({});

export async function getWatchlist(db: DbClient) {
  const rows = await db.select().from(watchlist);
  return rows.map((w) => ({
    id: w.id,
    ticker: w.ticker,
    name: w.name,
    source: w.source,
    addedAt: w.addedAt.toISOString(),
  }));
}
