import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// scrypt is a memory-hard KDF suitable for password hashing (OWASP-
// recommended alternative to bcrypt/argon2) and is built into Node, so
// no extra dependency is needed for something this security-sensitive.
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const storedHash = Buffer.from(hash, "hex");
  const candidateHash = scryptSync(password, salt, KEY_LENGTH);
  if (storedHash.length !== candidateHash.length) return false;
  return timingSafeEqual(storedHash, candidateHash);
}
