import { encrypt, decrypt, maskApiKey } from "@symposium/crypto";
import { apiKeys, apiKeyAuditLogs, eq, sql } from "@symposium/db";
import { getDb } from "./db.js";
import { getWriterDb } from "./writer-db.js";

// ── 허용 키 목록 (화이트리스트) ──────────────────────────────
export const ALLOWED_KEY_NAMES = [
  "ANTHROPIC_API_KEY",
  "DART_API_KEY",
  "NEWS_API_KEY",
  "FRED_API_KEY",
] as const;

export type ApiKeyName = (typeof ALLOWED_KEY_NAMES)[number];

export const API_KEY_DEFINITIONS: Array<{
  name: ApiKeyName;
  required: boolean;
  label: string;
  hint: string;
}> = [
  {
    name: "ANTHROPIC_API_KEY",
    required: true,
    label: "Anthropic API Key",
    hint: "sk-ant-...",
  },
  {
    name: "DART_API_KEY",
    required: false,
    label: "DART Open API Key",
    hint: "금감원 OpenDART에서 발급",
  },
  {
    name: "NEWS_API_KEY",
    required: false,
    label: "News API Key (Serper)",
    hint: "serper.dev에서 발급",
  },
  {
    name: "FRED_API_KEY",
    required: false,
    label: "FRED API Key",
    hint: "fred.stlouisfed.org에서 발급 (VIX, US10Y, DXY, WTI)",
  },
];

function getSecret(): string {
  const s = process.env.ENCRYPTION_SECRET;
  if (!s) throw new Error("ENCRYPTION_SECRET is not set");
  return s;
}

/** 평문 반환 (서버 사이드 전용 — 클라이언트에 절대 노출 금지) */
export async function getApiKey(name: ApiKeyName): Promise<string | null> {
  // 환경변수 우선
  const envVal = process.env[name];
  if (envVal) return envVal;

  const secret = getSecret();
  const db = getDb();
  const row = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyName, name),
  });
  if (!row) return null;

  return decrypt(
    { encryptedValue: row.encryptedValue, iv: row.iv, authTag: row.authTag },
    secret
  );
}

/** DB UPSERT (암호화) + 감사 로그 */
export async function setApiKey(
  name: ApiKeyName,
  value: string,
  actor: string
): Promise<void> {
  const secret = getSecret();
  const encrypted = encrypt(value, secret);
  const writerDb = getWriterDb();

  await writerDb
    .insert(apiKeys)
    .values({
      keyName: name,
      encryptedValue: encrypted.encryptedValue,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    })
    .onConflictDoUpdate({
      target: apiKeys.keyName,
      set: {
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        updatedAt: sql`NOW()`,
      },
    });

  await writerDb.insert(apiKeyAuditLogs).values({
    actor,
    action: "set",
    keyName: name,
  });
}

/** DB DELETE + 감사 로그 */
export async function deleteApiKey(
  name: ApiKeyName,
  actor: string
): Promise<void> {
  const writerDb = getWriterDb();
  await writerDb.delete(apiKeys).where(eq(apiKeys.keyName, name));
  await writerDb.insert(apiKeyAuditLogs).values({
    actor,
    action: "delete",
    keyName: name,
  });
}

export interface ApiKeyStatus {
  name: ApiKeyName;
  label: string;
  required: boolean;
  hint: string;
  isSet: boolean;
  maskedValue: string | null;
  updatedAt: Date | null;
  source: "env" | "db" | "unset";
}

/** 마스킹된 목록 (UI 전용 — 평문 절대 반환 금지) */
export async function listApiKeys(): Promise<ApiKeyStatus[]> {
  const db = getDb();
  const rows = await db.query.apiKeys.findMany();
  const dbMap = new Map(rows.map((r) => [r.keyName, r]));

  return API_KEY_DEFINITIONS.map((def) => {
    const envVal = process.env[def.name];
    if (envVal) {
      return {
        name: def.name,
        label: def.label,
        required: def.required,
        hint: def.hint,
        isSet: true,
        maskedValue: maskApiKey(envVal),
        updatedAt: null,
        source: "env" as const,
      };
    }

    const row = dbMap.get(def.name);
    if (row) {
      // DB row에서는 복호화 하지 않고 masked placeholder만 제공
      return {
        name: def.name,
        label: def.label,
        required: def.required,
        hint: def.hint,
        isSet: true,
        maskedValue: "••••••...••••",
        updatedAt: row.updatedAt,
        source: "db" as const,
      };
    }

    return {
      name: def.name,
      label: def.label,
      required: def.required,
      hint: def.hint,
      isSet: false,
      maskedValue: null,
      updatedAt: null,
      source: "unset" as const,
    };
  });
}

/** 경고 배너용 — 미설정된 필수 키 목록 반환 */
export async function getMissingRequiredKeys(): Promise<ApiKeyName[]> {
  const statuses = await listApiKeys();
  return statuses
    .filter((s) => s.required && !s.isSet)
    .map((s) => s.name);
}
