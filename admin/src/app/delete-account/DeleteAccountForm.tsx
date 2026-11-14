"use client";

import { useActionState } from "react";
import { confirmDelete, sendDeleteCode, type DeleteState } from "@/app/actions/accountDelete";
import { Alert } from "@/components/Brand";

export function DeleteAccountForm() {
  const [sent, sendAction, sending] = useActionState<DeleteState, FormData>(sendDeleteCode, undefined);
  const [done, deleteAction, deleting] = useActionState<DeleteState, FormData>(confirmDelete, undefined);

  if (done?.step === "done") {
    return <Alert kind="ok">Your account has been deleted. Thank you for watching with us.</Alert>;
  }

  const mobile = done?.mobile ?? sent?.mobile;
  if (sent?.step === "code" && mobile) {
    return (
      <form action={deleteAction} className="card space-y-4 p-5">
        {done?.error && <Alert kind="error">{done.error}</Alert>}
        <p className="text-sm">We sent a 6-digit code to <b>+91 {mobile}</b>. Enter it to delete the account.</p>
        <input type="hidden" name="mobile" value={mobile} />
        <div>
          <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-ink-2">Code</label>
          <input id="code" name="code" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required
            autoComplete="one-time-code" className="field font-mono tracking-[0.3em]" />
        </div>
        <button type="submit" disabled={deleting} className="btn-primary w-full">
          {deleting ? "Deleting…" : "Delete my account"}
        </button>
      </form>
    );
  }

  return (
    <form action={sendAction} className="card space-y-4 p-5">
      {sent?.error && <Alert kind="error">{sent.error}</Alert>}
      <div>
        <label htmlFor="mobile" className="mb-1.5 block text-sm font-medium text-ink-2">Mobile number you log in with</label>
        <input id="mobile" name="mobile" type="tel" inputMode="numeric" maxLength={10} pattern="[6-9][0-9]{9}" required
          className="field" />
      </div>
      <button type="submit" disabled={sending} className="btn-primary w-full">
        {sending ? "Sending…" : "Send me a code"}
      </button>
    </form>
  );
}
