/**
 * Server-only AES-256-GCM encryption for game account passwords.
 * NEVER import from client components. Key comes from GAME_CREDS_KEY
 * (32-byte base64) server env var.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const b64 = process.env.GAME_CREDS_KEY;
  if (!b64) throw new Error("GAME_CREDS_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("GAME_CREDS_KEY must be 32 bytes (base64)");
  return key;
}

/** Encrypts plaintext → "iv:ciphertext:tag" (all base64). */
export function encryptPassword(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${enc.toString("base64")}:${tag.toString("base64")}`;
}

/** Decrypts "iv:ciphertext:tag" → plaintext. */
export function decryptPassword(payload: string): string {
  const key = getKey();
  const [ivB64, encB64, tagB64] = payload.split(":");
  if (!ivB64 || !encB64 || !tagB64) throw new Error("Bad encrypted payload");
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/** Generates a random game password (12 chars, URL-safe). */
export function generateGamePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
