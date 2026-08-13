import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

export const AUTH_COOKIE = "day_session";
// ~400 days — the longest Max-Age modern browsers honor. "Stay logged in
// until you log out" in practice; there's no separate expiry/refresh, so
// logging out (clearing the cookie) is the only way a session ends.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 400;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

function sign(value: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return createHmac("sha256", secret).update(value).digest("hex");
}

// A session token is just "<userId>.<hmac(userId)>" — tamper-evident
// (nobody can forge a different userId without knowing AUTH_SECRET) but
// stateless, so verifying it never needs a database round trip. That
// keeps proxy.ts fast and avoids needing Prisma in every request's
// gate-check.
export function createSessionToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  if (!process.env.AUTH_SECRET) return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const userId = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!userId || !signature) return null;

  let expected: string;
  try {
    expected = sign(userId);
  } catch {
    return null;
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

// Route handlers / server components only (uses next/headers). proxy.ts
// reads the cookie itself via NextRequest and calls verifySessionToken
// directly — see proxy.ts.
export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  return verifySessionToken(store.get(AUTH_COOKIE)?.value);
}
