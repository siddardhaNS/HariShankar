"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import type { FormState } from "@/lib/types";

function fail(e: unknown): FormState {
  return { error: e instanceof ApiError ? e.message : "Something went wrong" };
}

export async function addTestLogin(_: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const mobile = String(formData.get("mobile") ?? "").replace(/\D/g, "").slice(-10);
  if (name.length < 2) return { error: "Enter the tester's name" };
  if (!/^[6-9]\d{9}$/.test(mobile)) return { error: "Enter a 10-digit mobile number" };

  try {
    await api("/api/admin/test-logins", { method: "POST", body: JSON.stringify({ name, mobile }) });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/staff");
  return { ok: `${name} can now log in to the app. Send them the number and code shown in the list.` };
}

export async function removeTestLogin(_: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  try {
    await api(`/api/admin/test-logins/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/staff");
  return { ok: "Removed" };
}
