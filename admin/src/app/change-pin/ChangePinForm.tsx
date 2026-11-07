"use client";

import { useActionState } from "react";
import { changePin } from "@/app/actions/auth";
import { Alert } from "@/components/Brand";

const pinProps = {
  type: "password",
  inputMode: "numeric",
  maxLength: 6,
  pattern: "[0-9]{4,6}",
  required: true,
  className: "field font-mono tracking-[0.4em]",
} as const;

export function ChangePinForm() {
  const [state, action, pending] = useActionState(changePin, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <div>
        <label htmlFor="current_pin" className="mb-1.5 block text-sm font-medium text-ink-2">Current PIN</label>
        <input id="current_pin" name="current_pin" autoComplete="current-password" {...pinProps} />
      </div>
      <div>
        <label htmlFor="new_pin" className="mb-1.5 block text-sm font-medium text-ink-2">New PIN</label>
        <input id="new_pin" name="new_pin" autoComplete="new-password" {...pinProps} />
        <p className="mt-1 text-xs text-muted">4 to 6 digits. Not 1234 or the same digit repeated.</p>
      </div>
      <div>
        <label htmlFor="confirm_pin" className="mb-1.5 block text-sm font-medium text-ink-2">New PIN again</label>
        <input id="confirm_pin" name="confirm_pin" autoComplete="new-password" {...pinProps} />
      </div>
      <button type="submit" disabled={pending} className="btn-primary w-full py-3">
        {pending ? "Saving…" : "Save PIN"}
      </button>
    </form>
  );
}
