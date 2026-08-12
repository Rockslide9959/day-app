import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, passcodeMatches } from "@/lib/auth";

export const config = {
  matcher: [
    /*
     * Match everything except:
     * - /login (the passcode entry page)
     * - /api/auth/login (passcode submit endpoint)
     * - /api/cron/tick (protected by its own shared secret, not the cookie)
     * - static assets and PWA files
     */
    "/((?!login|api/auth/login|api/cron/tick|manifest.json|sw.js|icons|_next/static|_next/image|favicon.ico).*)",
  ],
};

export function proxy(req: NextRequest) {
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (passcodeMatches(cookie)) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
