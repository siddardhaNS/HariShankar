"use server";

import { api, ApiError } from "@/lib/api";
import type { FormState } from "@/lib/types";

/** The website's Delete account page: the customer proves the number is theirs with a login code. */

export type DeleteState = (FormState & { step?: "code" | "done"; mobile?: string }) | undefined;

function clean(mobile: FormDataEntryValue | null) {
  return String(mobile ?? "").replace(/\D/g, "").slice(-10);
}

function message(e: unknown) {
  return e instanceof ApiError ? e.message : "Something went wrong. Try again";
}

export async function sendDeleteCode(_: DeleteState, formData: FormData): Promise<DeleteState> {
  const mobile = clean(formData.get("mobile"));
  if (!/^[6-9]\d{9}$/.test(mobile)) return { error: "Enter your 10-digit mobile number" };
  try {
    await api("/api/app/auth/otp", { method: "POST", auth: false, body: JSON.stringify({ mobile }) });
  } catch (e) {
    return { error: message(e) };
  }
  return { step: "code", mobile };
}

export async function confirmDelete(_: DeleteState, formData: FormData): Promise<DeleteState> {
  const mobile = clean(formData.get("mobile"));
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) return { step: "code", mobile, error: "Enter the 6-digit code" };
  try {
    const auth = await api<{ token: string }>("/api/app/auth/verify", {
      method: "POST", auth: false, body: JSON.stringify({ mobile, code }),
    });
    await api("/api/app/me", { method: "DELETE", auth: false, headers: { Authorization: `Bearer ${auth.token}` } });
  } catch (e) {
    return { step: "code", mobile, error: message(e) };
  }
  return { step: "done" };
}
