import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "hs_admin";
const PUBLIC = ["/login", "/logout"];

/**
 * Optimistic check only: no cookie -> login page. The real check (token
 * signature, expiry, revoked PIN, role) happens on the API for every call.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico|webp)$).*)"],
};
