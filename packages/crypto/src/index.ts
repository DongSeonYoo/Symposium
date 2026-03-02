import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface EncryptedData {
  encryptedValue: string; // base64
  iv: string;             // base64 (12 bytes)
  authTag: string;        // base64 (16 bytes)
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string, secret: string): EncryptedData {
  const key = deriveKey(secret);
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

export function decrypt(data: EncryptedData, secret: string): string {
  try {
    const key = deriveKey(secret);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(data.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(data.authTag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(data.encryptedValue, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    // 키 정보가 에러 스택에 남지 않도록 원본 에러를 버리고 새 에러 throw
    throw new Error("decryption failed");
  }
}

export function maskApiKey(plaintext: string): string {
  if (plaintext.length < 10) return "****";
  return `${plaintext.slice(0, 6)}...${plaintext.slice(-4)}`;
}
