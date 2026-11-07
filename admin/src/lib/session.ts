import "server-only";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "hs_admin";

export async function setSession(token: string, maxAgeSeconds: number) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function getToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
