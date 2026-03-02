import { createDbClient } from "@symposium/db";

// api_keys 쓰기에는 DATABASE_URL (읽기 전용 계정 DATABASE_READER_URL 사용 불가)
const globalForWriterDb = globalThis as unknown as {
  _writerDb?: ReturnType<typeof createDbClient>;
};

export function getWriterDb() {
  if (!globalForWriterDb._writerDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForWriterDb._writerDb = createDbClient({ max: 2 });
  }
  return globalForWriterDb._writerDb;
}
