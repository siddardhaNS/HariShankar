"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import type { FormState } from "@/lib/types";

function fail(e: unknown): FormState {
  return { error: e instanceof ApiError ? e.message : "Something went wrong" };
}

/** Turn maintenance on or off, or just change the message. Always needs the maintenance password. */
export async function setMaintenance(_: FormState, formData: FormData): Promise<FormState> {
  // Which button: "on", "off", or "message" (keep it on, change the words)
  const what = String(formData.get("do") ?? "");
  if (!["on", "off", "message"].includes(what)) return { error: "Something went wrong" };
  const on = what !== "off";
  const message = String(formData.get("message") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter the maintenance password" };
  if (message.length > 300) return { error: "Keep the message under 300 characters" };

  try {
    await api("/api/admin/maintenance", { method: "POST", body: JSON.stringify({ on, message, password }) });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings");
  return {
    ok: what === "message"
      ? "Message updated. The app shows the new message."
      : on ? "Maintenance is ON. Customers see the message in the app." : "Maintenance is OFF. The app is open again.",
  };
}

/** Owner sets the maintenance password, or changes it with the current one. */
export async function setMaintenancePassword(_: FormState, formData: FormData): Promise<FormState> {
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("new") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < 8) return { error: "Use at least 8 characters" };
  if (next !== confirm) return { error: "The two new passwords don't match" };

  try {
    await api("/api/admin/maintenance/password", { method: "PUT", body: JSON.stringify({ current, new: next }) });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings");
  return { ok: "Maintenance password saved" };
}
