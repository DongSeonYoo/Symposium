/**
 * API 키 DB 시드 스크립트.
 * .env의 DART_API_KEY / NEWS_API_KEY / FRED_API_KEY / ANTHROPIC_API_KEY를
 * 암호화해서 api_keys 테이블에 upsert.
 *
 * 실행: node --env-file=.env --import=tsx/esm scripts/seed-api-keys.ts
 *   또는: cd Symposium && npx tsx --input-type=module < scripts/seed-api-keys.ts
 *   또는: pnpm run seed:api-keys  (package.json scripts 참고)
 */

import { createHash, createCipheriv, randomBytes } from "node:crypto";
import postgres from "postgres";

async function main() {
  // .env는 --env-file=.env 플래그로 로드 (node 20.6+)
  const DATABASE_URL = process.env.DATABASE_URL;
  const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;

  if (!DATABASE_URL) { console.error("DATABASE_URL 미설정"); process.exit(1); }
  if (!ENCRYPTION_SECRET) { console.error("ENCRYPTION_SECRET 미설정"); process.exit(1); }

  const KEYS_TO_SEED: Array<{ name: string; envKey: string }> = [
    { name: "ANTHROPIC_API_KEY", envKey: "ANTHROPIC_API_KEY" },
    { name: "DART_API_KEY",      envKey: "DART_API_KEY" },
    { name: "NEWS_API_KEY",      envKey: "NEWS_API_KEY" },
    { name: "FRED_API_KEY",      envKey: "FRED_API_KEY" },
  ];

  function encrypt(plaintext: string, secret: string) {
    const key = createHash("sha256").update(secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encryptedValue: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  }

  const sql = postgres(DATABASE_URL);

  try {
    for (const { name, envKey } of KEYS_TO_SEED) {
      const value = process.env[envKey];
      if (!value) {
        console.log(`[seed] SKIP  ${name} — 값 없음`);
        continue;
      }

      const enc = encrypt(value, ENCRYPTION_SECRET);

      await sql`
        INSERT INTO api_keys (key_name, encrypted_value, iv, auth_tag)
        VALUES (${name}, ${enc.encryptedValue}, ${enc.iv}, ${enc.authTag})
        ON CONFLICT (key_name) DO UPDATE SET
          encrypted_value = EXCLUDED.encrypted_value,
          iv              = EXCLUDED.iv,
          auth_tag        = EXCLUDED.auth_tag,
          updated_at      = NOW()
      `;

      console.log(`[seed] OK    ${name}`);
    }

    console.log("\n✅ seed 완료");
  } finally {
    await sql.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
