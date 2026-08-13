import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwords";
import { createSessionToken, AUTH_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { validatePassword, validateUsername } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const usernameError = validateUsername(username);
  if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { username, passwordHash: hashPassword(password) },
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, createSessionToken(user.id), SESSION_COOKIE_OPTIONS);
  return res;
}
