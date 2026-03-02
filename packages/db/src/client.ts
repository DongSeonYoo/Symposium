import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

/**
 * DB 클라이언트 생성.
 * DATABASE_URL 환경변수 필수.
 * max 옵션은 호출처에서 조정 가능 (MCP 서버: 5, orchestrator: 10 등).
 */
export function createDbClient(options?: { max?: number }) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const queryClient = postgres(url, { max: options?.max ?? 5 });
  return drizzle(queryClient, { schema });
}

export type DbClient = ReturnType<typeof createDbClient>;
