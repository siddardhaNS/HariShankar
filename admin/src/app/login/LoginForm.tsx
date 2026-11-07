"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Alert } from "@/components/Brand";

export function LoginForm({ next, expired }: { next?: string; expired: boolean }) {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-5">
      {state?.error ? (
        <Alert kind="error">{state.error}</Alert>
      ) : expired ? (
        <Alert kind="error">Your session ended. Please log in again.</Alert>
      ) : null}

      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <label htmlFor="mobile" className="mb-1.5 block text-sm font-medium text-ink-2">
          Mobile number
        </label>
        <div className="flex">
          <span className="flex items-center rounded-l-lg border border-r-0 border-[#c9ccdc] bg-canvas px-3 text-[15px] text-muted">
            +91
          </span>
          <input
            id="mobile"
            name="mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="username"
            maxLength={10}
            pattern="[6-9][0-9]{9}"
            required
            autoFocus
            className="field rounded-l-none"
            placeholder="98765 43210"
          />
        </div>
      </div>

      <div>
        <label htmlFor="pin" className="mb-1.5 block text-sm font-medium text-ink-2">
          PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={6}
          pattern="[0-9]{4,6}"
          required
          className="field font-mono tracking-[0.4em]"
          placeholder="••••••"
        />
      </div>

      <button type="submit" disabled={pending} className="btn-primary w-full py-3">
        {pending ? "Logging in…" : "Log in"}
      </button>

      <p className="text-center text-xs text-muted">Forgot your PIN? Ask the owner to reset it.</p>
    </form>
  );
}
