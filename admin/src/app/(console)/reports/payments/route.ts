import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "@/lib/session";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

/** Payments as an Excel file, one line per booking with its UPI reference, for the page's dates. */
export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.redirect(new URL("/login", request.url));
  const q = new URLSearchParams();
  for (const k of ["start", "end"]) {
    const v = request.nextUrl.searchParams.get(k);
    if (v) q.set(k, v);
  }
  const res = await fetch(`${API_URL}/api/admin/reports/payments.xlsx?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res) return new NextResponse("Can't reach the server. Try again.", { status: 503 });
  if (res.status === 401) return NextResponse.redirect(new URL("/logout", request.url));
  if (!res.ok) return new NextResponse("Couldn't make the Excel file.", { status: res.status });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": res.headers.get("content-disposition") ?? 'attachment; filename="payments.xlsx"',
    },
  });
}
