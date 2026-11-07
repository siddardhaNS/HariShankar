"use client";

import { useActionState, useState } from "react";
import { createStaff, resetPin, updateStaff } from "@/app/actions/staff";
import { Alert } from "@/components/Brand";
import { ROLE_HINT, ROLE_LABEL, type FormState, type Staff } from "@/lib/types";

const ROLES = ["manager", "gate", "owner"] as const;

export function AddStaffForm() {
  const [state, action, pending] = useActionState(createStaff, undefined);

  return (
    <section className="card h-fit p-5">
      <h2 className="font-bold">Add a login</h2>
      <p className="mt-1 text-sm text-muted">Give them the starting PIN. They choose their own on first login.</p>
      <form action={action} className="mt-5 space-y-4">
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink-2">Name</label>
          <input id="name" name="name" required minLength={2} maxLength={80} className="field" />
        </div>
        <div>
          <label htmlFor="new-mobile" className="mb-1.5 block text-sm font-medium text-ink-2">Mobile number</label>
          <input id="new-mobile" name="mobile" type="tel" inputMode="numeric" maxLength={10}
            pattern="[6-9][0-9]{9}" required className="field" />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-2">Role</legend>
          <div className="space-y-2">
            {ROLES.map((r) => (
              <label key={r} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft/50">
                <input type="radio" name="role" value={r} defaultChecked={r === "gate"} className="mt-1 accent-brand" />
                <span>
                  <span className="block text-sm font-bold">{ROLE_LABEL[r]}</span>
                  <span className="block text-xs text-muted">{ROLE_HINT[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="start-pin" className="mb-1.5 block text-sm font-medium text-ink-2">Starting PIN</label>
          <input id="start-pin" name="pin" type="text" inputMode="numeric" maxLength={6} pattern="[0-9]{4,6}"
            required autoComplete="off" className="field font-mono tracking-[0.3em]" />
        </div>
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Adding…" : "Add login"}
        </button>
      </form>
    </section>
  );
}

export function StaffRowActions({ staff }: { staff: Staff }) {
  const [updState, updAction, updPending] = useActionState(updateStaff, undefined);
  const [showPin, setShowPin] = useState(false);
  const [pinState, pinAction, pinPending] = useActionState(async (prev: FormState, fd: FormData) => {
    const result = await resetPin(prev, fd);
    if (result?.ok) setShowPin(false);
    return result;
  }, undefined);

  const message = updState?.error ?? pinState?.error ?? pinState?.ok;
  const isError = Boolean(updState?.error ?? pinState?.error);

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-[290px] sm:justify-end">
      {staff.is_active && staff.role !== "super_admin" && (
        <form action={updAction}>
          <input type="hidden" name="id" value={staff.id} />
          <select
            name="role"
            defaultValue={staff.role}
            aria-label={`Role for ${staff.name}`}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            disabled={updPending}
            className="rounded-lg border border-[#c9ccdc] bg-white px-2.5 py-2 text-sm"
          >
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </form>
      )}

      {staff.is_active && (
        showPin ? (
          <form action={pinAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={staff.id} />
            <input name="pin" inputMode="numeric" maxLength={6} pattern="[0-9]{4,6}" required autoFocus
              autoComplete="off" placeholder="New PIN" aria-label={`New PIN for ${staff.name}`}
              className="w-28 rounded-lg border border-[#c9ccdc] px-2.5 py-2 font-mono text-sm" />
            <button type="submit" disabled={pinPending} className="btn-primary px-3 py-2 text-sm">Set</button>
            <button type="button" onClick={() => setShowPin(false)} className="px-1 text-sm text-muted">Cancel</button>
          </form>
        ) : (
          <button type="button" onClick={() => setShowPin(true)} className="btn-secondary px-3 py-2 text-sm">
            Reset PIN
          </button>
        )
      )}

      <form action={updAction}>
        <input type="hidden" name="id" value={staff.id} />
        <input type="hidden" name="is_active" value={staff.is_active ? "false" : "true"} />
        <button type="submit" disabled={updPending}
          className={`btn px-3 py-2 text-sm ${staff.is_active ? "text-brand hover:bg-brand-soft" : "btn-secondary"}`}>
          {staff.is_active ? "Disable" : "Enable"}
        </button>
      </form>

      {message && (
        <p className={`w-full text-xs ${isError ? "text-brand" : "text-ok"}`} role="status">{message}</p>
      )}
    </div>
  );
}
