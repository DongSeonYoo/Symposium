import { z } from "zod";
import { type DbClient, watchlist, eq } from "@symposium/db";

export const updateWatchlistSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    ticker: z.string().max(10),
    name: z.string().max(100),
    source: z.enum(["manual", "llm_discovered"]).default("manual"),
  }),
  z.object({
    op: z.literal("remove"),
    ticker: z.string().max(10),
  }),
]);

export type UpdateWatchlistInput = z.infer<typeof updateWatchlistSchema>;

export async function updateWatchlist(db: DbClient, input: UpdateWatchlistInput) {
  if (input.op === "add") {
    const [row] = await db
      .insert(watchlist)
      .values({ ticker: input.ticker, name: input.name, source: input.source })
      .onConflictDoUpdate({
        target: watchlist.ticker,
        set: { name: input.name, source: input.source },
      })
      .returning();
    return { op: "add", ticker: row.ticker, id: row.id };
  } else {
    const [row] = await db
      .delete(watchlist)
      .where(eq(watchlist.ticker, input.ticker))
      .returning({ ticker: watchlist.ticker });
    if (!row) throw new Error(`Ticker not in watchlist: ${input.ticker}`);
    return { op: "remove", ticker: row.ticker };
  }
}
