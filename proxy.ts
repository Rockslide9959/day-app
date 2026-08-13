import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";

export const config = {
  matcher: [
    /*
     * Match everything except:
     * - /login, /signup (public auth pages)
     * - /api/auth/login, /api/auth/signup (public auth endpoints)
     * - /api/cron/tick (protected by its own shared secret, not a session)
     * - /api/calendar/feed.ics (protected by its own shared secret)
     * - static assets and PWA files
     */
    "/((?!login|signup|api/auth/login|api/auth/signup|api/cron/tick|api/calendar/feed.ics|manifest.json|sw.js|icons|_next/static|_next/image|favicon.ico).*)",
  ],
};

export function proxy(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (verifySessionToken(token)) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
