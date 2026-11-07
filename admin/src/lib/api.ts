import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getToken } from "./session";
import type { Me } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Turn FastAPI error bodies (string or validation list) into one readable line. */
function readError(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    return String(detail[0].msg).replace(/^Value error, /, "");
  }
  return status >= 500 ? "Server problem. Please try again" : "Request failed";
}

/** Call the backend. With auth (default), a 401 ends the session. */
export async function api<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth = true, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Content-Type", "application/json");
  if (auth) {
    const token = await getToken();
    if (!token) redirect("/logout");
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...rest, headers, cache: "no-store" });
  } catch {
    throw new ApiError(503, "Can't reach the server. Check the connection and try again");
  }

  if (res.status === 401 && auth) redirect("/logout");
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, readError(body, res.status));
  return body as T;
}

/** Current staff user, de-duplicated within one request. */
export const getMe = cache(() => api<Me>("/api/admin/auth/me"));
