import { createDbClient } from "@symposium/db";

// Dashboard는 읽기 전용 계정 DATABASE_READER_URL 사용.
// @symposium/db의 createDbClient가 DATABASE_URL을 읽으므로,
// 호출 전에 환경변수를 매핑해서 전달.
function getReaderUrl(): string {
  const url = process.env.DATABASE_READER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_READER_URL (or DATABASE_URL) is not set");
  return url;
}

// 싱글턴 — 모듈 로드 시 한 번만 생성 (Next.js dev hot-reload 대비 global 캐싱)
const globalForDb = globalThis as unknown as { _dashboardDb?: ReturnType<typeof createDbClient> };

export function getDb() {
  if (!globalForDb._dashboardDb) {
    // createDbClient가 내부적으로 process.env.DATABASE_URL을 읽으므로 임시로 덮어씀
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = getReaderUrl();
    globalForDb._dashboardDb = createDbClient({ max: 3 });
    process.env.DATABASE_URL = original;
  }
  return globalForDb._dashboardDb;
}
