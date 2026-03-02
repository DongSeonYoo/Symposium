import { decrypt } from "@symposium/crypto";
import { apiKeys, eq } from "@symposium/db";
import type { DbClient } from "@symposium/db";

interface LoadResult {
  loaded: string[];
  skipped: string[];
  failed: string[];
}

const REQUIRED_KEYS = ["ANTHROPIC_API_KEY"] as const;
const OPTIONAL_KEYS = ["DART_API_KEY", "NEWS_API_KEY", "FRED_API_KEY"] as const;
const ALL_KEYS = [...REQUIRED_KEYS, ...OPTIONAL_KEYS] as const;

type ManagedKey = (typeof ALL_KEYS)[number];

/**
 * DB에서 API 키를 복호화해 process.env에 주입.
 *
 * - ENCRYPTION_SECRET 미설정 시 스킵 (.env 방식 호환)
 * - process.env에 이미 있으면 스킵 (환경변수 우선)
 * - ANTHROPIC_API_KEY 로딩/복호화 실패 시 즉시 process.exit(1)
 * - DART/NEWS 실패 시 warn + mock degrade 허용
 */
export async function loadApiKeysFromDb(db: DbClient): Promise<LoadResult> {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    console.error("[load-keys] ENCRYPTION_SECRET 미설정 — DB 키 로딩 스킵 (.env 방식으로 동작)");
    return { loaded: [], skipped: [...ALL_KEYS], failed: [] };
  }

  const result: LoadResult = { loaded: [], skipped: [], failed: [] };

  for (const name of ALL_KEYS) {
    // 환경변수 우선
    if (process.env[name]) {
      result.skipped.push(name);
      continue;
    }

    try {
      const row = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.keyName, name),
      });

      if (!row) {
        handleMissing(name, result);
        continue;
      }

      const plainValue = decrypt(
        { encryptedValue: row.encryptedValue, iv: row.iv, authTag: row.authTag },
        secret
      );

      process.env[name] = plainValue;
      result.loaded.push(name);
      console.error(`[load-keys] ${name} loaded from DB`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      handleError(name, msg, result);
    }
  }

  return result;
}

function handleMissing(name: ManagedKey, result: LoadResult): void {
  if ((REQUIRED_KEYS as readonly string[]).includes(name)) {
    console.error(`[load-keys] FATAL: ${name} not found in DB or env`);
    process.exit(1);
  }
  console.error(`[load-keys] WARN: ${name} not set — mock mode will be used`);
  result.failed.push(name);
}

function handleError(name: ManagedKey, msg: string, result: LoadResult): void {
  if ((REQUIRED_KEYS as readonly string[]).includes(name)) {
    console.error(`[load-keys] FATAL: ${name} load failed — ${msg}`);
    process.exit(1);
  }
  console.error(`[load-keys] WARN: ${name} load failed (${msg}) — mock mode will be used`);
  result.failed.push(name);
}
