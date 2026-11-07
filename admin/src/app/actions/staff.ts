"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import type { FormState, Role } from "@/lib/types";

const ROLES: Role[] = ["owner", "manager", "gate"];

function fail(e: unknown): FormState {
  return { error: e instanceof ApiError ? e.message : "Something went wrong" };
}

export async function createStaff(_: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const mobile = String(formData.get("mobile") ?? "").replace(/\D/g, "").slice(-10);
  const role = String(formData.get("role") ?? "") as Role;
  const pin = String(formData.get("pin") ?? "");

  if (name.length < 2) return { error: "Enter the staff member's name" };
  if (!/^[6-9]\d{9}$/.test(mobile)) return { error: "Enter a 10-digit mobile number" };
  if (!ROLES.includes(role)) return { error: "Pick a role" };
  if (!/^\d{4,6}$/.test(pin)) return { error: "Starting PIN must be 4 to 6 digits" };

  try {
    await api("/api/admin/staff", { method: "POST", body: JSON.stringify({ name, mobile, role, pin }) });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/staff");
  return { ok: `${name} can now log in. They'll set their own PIN on first login.` };
}

export async function updateStaff(_: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const patch: Record<string, unknown> = {};
  const role = formData.get("role");
  const active = formData.get("is_active");
  if (typeof role === "string" && ROLES.includes(role as Role)) patch.role = role;
  if (active === "true" || active === "false") patch.is_active = active === "true";

  try {
    await api(`/api/admin/staff/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/staff");
  return { ok: "Saved" };
}

export async function resetPin(_: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const pin = String(formData.get("pin") ?? "");
  if (!/^\d{4,6}$/.test(pin)) return { error: "PIN must be 4 to 6 digits" };

  try {
    await api(`/api/admin/staff/${encodeURIComponent(id)}/reset-pin`, {
      method: "POST",
      body: JSON.stringify({ pin }),
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/staff");
  return { ok: "PIN reset. They'll be asked to change it when they log in." };
}
