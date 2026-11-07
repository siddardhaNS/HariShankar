"use server";

import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { homeFor } from "@/lib/nav";
import { clearSession, setSession } from "@/lib/session";
import type { FormState, LoginResponse } from "@/lib/types";

const MOBILE = /^[6-9]\d{9}$/;
const PIN = /^\d{4,6}$/;

/** Only allow same-site relative paths after login (no open redirects). */
function safeNext(next: FormDataEntryValue | null): string | null {
  if (typeof next !== "string") return null;
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const mobile = String(formData.get("mobile") ?? "").replace(/\D/g, "").slice(-10);
  const pin = String(formData.get("pin") ?? "");

  if (!MOBILE.test(mobile)) return { error: "Enter your 10-digit mobile number" };
  if (!PIN.test(pin)) return { error: "PIN is 4 to 6 digits" };

  let res: LoginResponse;
  try {
    res = await api<LoginResponse>("/api/admin/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ mobile, pin }),
    });
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Something went wrong" };
  }

  await setSession(res.access_token, res.expires_in);
  if (res.user.must_change_pin) redirect("/change-pin");
  redirect(safeNext(formData.get("next")) ?? homeFor(res.user.role));
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

export async function changePin(_: FormState, formData: FormData): Promise<FormState> {
  const current = String(formData.get("current_pin") ?? "");
  const next = String(formData.get("new_pin") ?? "");
  const confirm = String(formData.get("confirm_pin") ?? "");

  if (!PIN.test(current)) return { error: "Enter your current PIN" };
  if (!PIN.test(next)) return { error: "New PIN must be 4 to 6 digits" };
  if (next !== confirm) return { error: "The new PINs don't match" };

  let res: LoginResponse;
  try {
    res = await api<LoginResponse>("/api/admin/auth/change-pin", {
      method: "POST",
      body: JSON.stringify({ current_pin: current, new_pin: next }),
    });
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Something went wrong" };
  }
  // Changing the PIN revokes old tokens; store the fresh one
  await setSession(res.access_token, res.expires_in);
  redirect(homeFor(res.user.role));
}
