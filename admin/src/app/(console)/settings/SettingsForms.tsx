"use client";

import { useActionState, useRef, useState } from "react";
import { setMaintenance, setMaintenancePassword } from "@/app/actions/settings";
import { Alert } from "@/components/Brand";

const LABEL = "mb-1.5 block text-sm font-medium text-ink-2";

export function MaintenanceForm({ on, message, lockedUntil }: { on: boolean; message: string; lockedUntil: string | null }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof setMaintenance>[0], fd: FormData) => {
    const result = await setMaintenance(prev, fd);
    // Ask for the password again next time
    const pw = formRef.current?.elements.namedItem("password");
    if (result?.ok && pw instanceof HTMLInputElement) pw.value = "";
    return result;
  }, undefined);
  const [text, setText] = useState(message);
  const locked = Boolean(lockedUntil); // the server only sends it while the lock lasts

  return (
    <form ref={formRef} action={action} className="mt-5 space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      {locked && !state?.error && (
        <Alert kind="error">
          Too many wrong passwords. Locked until{" "}
          {new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(lockedUntil!))}.
        </Alert>
      )}

      <div>
        <label htmlFor="mmessage" className={LABEL}>Message customers see</label>
        <textarea
          id="mmessage"
          name="message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          rows={3}
          className="field min-h-[90px] py-2.5"
        />
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>Left empty, the app says the app is down for maintenance.</span>
          <span>{text.length}/300</span>
        </div>
      </div>

      {/* What it looks like in the app */}
      <div className="rounded-xl bg-[#141631] px-5 py-6 text-center text-white">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F6C453]">Back soon</div>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#E4E6EF]">
          {text.trim() || "The app is down for maintenance. Please check back soon."}
        </p>
      </div>

      <div>
        <label htmlFor="mpassword" className={LABEL}>Maintenance password</label>
        <input id="mpassword" name="password" type="password" required autoComplete="off" className="field" />
      </div>

      <div className="flex flex-wrap gap-3">
        {on ? (
          <>
            <button type="submit" name="do" value="off" disabled={pending} className="btn-primary">
              {pending ? "Saving…" : "Turn maintenance off"}
            </button>
            <button type="submit" name="do" value="message" disabled={pending} className="btn-secondary">
              Update message only
            </button>
          </>
        ) : (
          <button type="submit" name="do" value="on" disabled={pending} className="btn-primary">
            {pending ? "Saving…" : "Turn maintenance on"}
          </button>
        )}
      </div>
    </form>
  );
}

export function PasswordForm({ passwordSet }: { passwordSet: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof setMaintenancePassword>[0], fd: FormData) => {
    const result = await setMaintenancePassword(prev, fd);
    if (result?.ok) formRef.current?.reset();
    return result;
  }, undefined);

  return (
    <form ref={formRef} action={action} className="mt-5 space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      {passwordSet && (
        <div>
          <label htmlFor="pcurrent" className={LABEL}>Current password</label>
          <input id="pcurrent" name="current" type="password" required autoComplete="off" className="field" />
        </div>
      )}
      <div>
        <label htmlFor="pnew" className={LABEL}>{passwordSet ? "New password" : "Password"}</label>
        <input id="pnew" name="new" type="password" required minLength={8} maxLength={100} autoComplete="new-password" className="field" />
      </div>
      <div>
        <label htmlFor="pconfirm" className={LABEL}>Type it again</label>
        <input id="pconfirm" name="confirm" type="password" required minLength={8} maxLength={100} autoComplete="new-password" className="field" />
      </div>
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Saving…" : passwordSet ? "Change password" : "Set password"}
      </button>
    </form>
  );
}
