import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM encryption for integration credentials.
 * Stored format: v1.<iv>.<authTag>.<ciphertext> (all base64).
 */
function getKey(): Buffer {
  const raw = env.encryptionKey;
  if (!raw) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY ontbreekt. Stel deze in om integratiegegevens veilig op te slaan.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY moet een base64-gecodeerde sleutel van 32 bytes zijn.");
  }
  return key;
}

export function encryptionAvailable(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptJson(value: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptJson(payload: string): Record<string, string> {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("Onbekend formaat voor versleutelde integratiegegevens.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as Record<string, string>;
}
