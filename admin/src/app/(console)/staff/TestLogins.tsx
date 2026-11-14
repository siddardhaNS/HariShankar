"use client";

import { useActionState } from "react";
import { addTestLogin, removeTestLogin } from "@/app/actions/testLogins";
import { Alert } from "@/components/Brand";
import type { TestLogin } from "@/lib/types";

/** Testers log in to the customer app with a fixed code, as there's no SMS provider yet. */
export function TestLogins({ logins }: { logins: TestLogin[] }) {
  const [state, action, pending] = useActionState(addTestLogin, undefined);

  return (
    <section className="card mt-6 overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-bold">App test logins <span className="ml-1 text-muted">{logins.length}</span></h2>
        <p className="mt-1 text-sm text-muted">
          Until login codes are sent by SMS, only these numbers can log in to the customer app, each with its own
          fixed code. Send each tester their number and code. Remove them all before the app goes public.
        </p>
      </div>

      {logins.length > 0 && (
        <ul className="divide-y divide-line">
          {logins.map((t) => <TestLoginRow key={t.id} login={t} />)}
        </ul>
      )}

      <form action={action} className="flex flex-wrap items-end gap-3 border-t border-line bg-canvas/40 px-5 py-4">
        <div className="min-w-[160px] flex-1">
          <label htmlFor="tl-name" className="mb-1.5 block text-sm font-medium text-ink-2">Tester&apos;s name</label>
          <input id="tl-name" name="name" required minLength={2} maxLength={80} className="field" />
        </div>
        <div className="min-w-[160px] flex-1">
          <label htmlFor="tl-mobile" className="mb-1.5 block text-sm font-medium text-ink-2">Their mobile number</label>
          <input id="tl-mobile" name="mobile" type="tel" inputMode="numeric" maxLength={10}
            pattern="[6-9][0-9]{9}" required className="field" />
        </div>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Adding…" : "Add tester"}
        </button>
        {(state?.error || state?.ok) && (
          <div className="w-full">
            {state.error ? <Alert kind="error">{state.error}</Alert> : <Alert kind="ok">{state.ok}</Alert>}
          </div>
        )}
      </form>
    </section>
  );
}

function TestLoginRow({ login }: { login: TestLogin }) {
  const [state, action, pending] = useActionState(removeTestLogin, undefined);
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
      <div className="min-w-[140px] flex-1 font-bold">{login.name}</div>
      <div className="w-[120px] font-mono text-[13px]">{login.mobile}</div>
      <div className="w-[120px]">
        <span className="text-xs text-muted">Code </span>
        <span className="font-mono font-bold tracking-[0.2em]">{login.code}</span>
      </div>
      <form action={action}>
        <input type="hidden" name="id" value={login.id} />
        <button type="submit" disabled={pending} className="btn px-3 py-2 text-sm text-brand hover:bg-brand-soft">
          Remove
        </button>
      </form>
      {state?.error && <p className="w-full text-xs text-brand" role="status">{state.error}</p>}
    </li>
  );
}
