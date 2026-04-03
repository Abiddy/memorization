import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PREFIX = "scrypt1";
const KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

function parseStored(stored: string): { salt: Buffer; hash: Buffer } | null {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  try {
    const salt = Buffer.from(parts[1]!, "base64");
    const hash = Buffer.from(parts[2]!, "base64");
    if (salt.length < 8 || hash.length !== KEYLEN) return null;
    return { salt, hash };
  } catch {
    return null;
  }
}

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, KEYLEN, SCRYPT_OPTS);
  return `${PREFIX}:${salt.toString("base64")}:${derived.toString("base64")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parsed = parseStored(stored);
  if (!parsed) return false;
  const { salt, hash } = parsed;
  let derived: Buffer;
  try {
    derived = scryptSync(plain, salt, KEYLEN, SCRYPT_OPTS);
  } catch {
    return false;
  }
  if (derived.length !== hash.length) return false;
  return timingSafeEqual(derived, hash);
}
