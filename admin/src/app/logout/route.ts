import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Reached when the API rejects the session (expired, PIN changed, disabled).
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login?expired=1", request.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
