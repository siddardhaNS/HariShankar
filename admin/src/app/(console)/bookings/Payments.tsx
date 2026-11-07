"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { markRefundSent, reviewPayment, savePaymentSettings } from "@/app/actions/ops";
import { Alert } from "@/components/Brand";
import { dateTime, rupees } from "@/lib/format";
import type { AdminBooking, TheatrePayments } from "@/lib/types";

/** Direct UPI payments waiting for staff to check the theatre's UPI account. */
export function PaymentsToCheck({ items, isOwner }: { items: AdminBooking[]; isOwner: boolean }) {
  const toCheck = items.filter((b) => b.status === "payment_review");
  const toSend = items.filter((b) => b.refund_pending);
  if (!toCheck.length && !toSend.length) return null;

  return (
    <div className="mb-6 space-y-6">
      {toCheck.length > 0 && (
        <section className="card overflow-hidden border-[#f5b301]">
          <div className="border-b border-line bg-[#fff4c2] px-5 py-3">
            <h2 className="font-bold text-[#7a5b00]">Payments to check <span className="ml-1">{toCheck.length}</span></h2>
            <p className="text-xs text-[#7a5b00]">
              Find each UPI reference in the theatre&apos;s UPI app or bank statement. Seats are held until you decide.
            </p>
          </div>
          <ul className="divide-y divide-line">
            {toCheck.map((b) => <CheckRow key={b.id} b={b} />)}
          </ul>
        </section>
      )}
      {toSend.length > 0 && (
        <Link href="/refunds?state=to_send" className="card flex items-center justify-between gap-3 border-brand bg-brand-soft px-5 py-3 hover:opacity-90">
          <span className="font-bold text-[#8a1424]">
            {toSend.length} refund{toSend.length === 1 ? "" : "s"} to send · {rupees(toSend.reduce((a, b) => a + b.refund_paise, 0))}
          </span>
          <span className="text-sm font-bold text-[#8a1424]">{isOwner ? "Send them in Refunds →" : "See Refunds →"}</span>
        </Link>
      )}
    </div>
  );
}

export function Who({ b }: { b: AdminBooking }) {
  return (
    <div className="min-w-[200px] flex-1">
      <div className="font-medium">{b.customer_name || "—"} <span className="font-mono text-xs text-muted">{b.mobile}</span></div>
      <div className="text-xs text-muted">
        <span className="font-mono">{b.code}</span> · {b.movie_title} · {dateTime(b.starts_at)} · {b.seats.join(", ")}
      </div>
    </div>
  );
}

function CheckRow({ b }: { b: AdminBooking }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirmNo, setConfirmNo] = useState(false);
  const act = (received: boolean) =>
    start(async () => {
      const res = await reviewPayment(b.id, received);
      if (!res.ok) setErr(res.error);
    });
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
      <Who b={b} />
      <div className="w-36">
        <div className="text-lg font-bold">{rupees(b.total_paise)}</div>
        <div className="font-mono text-xs text-muted" title="UPI reference">{b.upi_ref}</div>
      </div>
      <div className="flex items-center gap-2">
        {confirmNo ? (
          <>
            <span className="text-xs text-brand">Release the seats?</span>
            <button type="button" disabled={pending} onClick={() => act(false)} className="btn-secondary px-3 py-1.5 text-sm">Yes, not received</button>
            <button type="button" onClick={() => setConfirmNo(false)} className="px-2 text-sm text-muted">Back</button>
          </>
        ) : (
          <>
            <button type="button" disabled={pending} onClick={() => act(true)} className="btn px-3 py-1.5 text-sm bg-ok text-white hover:opacity-90">
              {pending ? "Saving…" : "Received"}
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirmNo(true)} className="btn-secondary px-3 py-1.5 text-sm">Not received</button>
          </>
        )}
      </div>
      {err && <p className="w-full text-xs text-brand">{err}</p>}
    </li>
  );
}

export function RefundRow({ b, canMark }: { b: AdminBooking; canMark: boolean }) {
  const [ref, setRef] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
      <Who b={b} />
      <div className="w-36">
        <div className="text-lg font-bold">{rupees(b.refund_paise)}</div>
        <div className="text-xs text-muted">{b.failure_reason === "show_cancelled" ? "Show cancelled" : b.failure_reason === "seat_clash" ? "Seat clash" : "Refund"}</div>
      </div>
      {canMark ? (
        <div className="flex items-center gap-2">
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Your UPI ref" maxLength={60}
            aria-label="UPI reference of the refund you sent" className="w-36 rounded-lg border border-[#c9ccdc] px-2 py-1.5 text-sm" />
          <button type="button" disabled={pending || ref.trim().length < 4}
            onClick={() => start(async () => { const res = await markRefundSent(b.id, ref.trim()); if (!res.ok) setErr(res.error); })}
            className="btn-primary px-3 py-1.5 text-sm">Mark sent</button>
        </div>
      ) : (
        <span className="text-xs text-muted">Owner sends this</span>
      )}
      {err && <p className="w-full text-xs text-brand">{err}</p>}
    </li>
  );
}

/** Owner: the UPI ID customers pay to while no payment gateway is connected. */
export function UpiSettings({ current }: { current: TheatrePayments | null }) {
  const [editing, setEditing] = useState(!current);
  const [upiId, setUpiId] = useState(current?.upi_id ?? "");
  const [name, setName] = useState(current?.upi_name ?? "Hari Shankar Picture Palace");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  if (!editing && current) {
    return (
      <section className="card mb-6 flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
        <span className="text-muted">Customers pay by UPI to</span>
        <span className="font-mono font-bold">{current.upi_id}</span>
        <span className="text-muted">({current.upi_name})</span>
        <button type="button" onClick={() => setEditing(true)} className="ml-auto text-sm font-bold text-brand">Change</button>
      </section>
    );
  }
  return (
    <section className="card mb-6 p-5">
      <h2 className="font-bold">{current ? "Change the theatre's UPI ID" : "Add the theatre's UPI ID to take payments"}</h2>
      <p className="mt-1 text-sm text-muted">
        Until a payment gateway is connected, the app sends customers to their UPI app to pay this UPI ID. Double-check it: money sent to a wrong ID can&apos;t be pulled back.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await savePaymentSettings({ upi_id: upiId.trim(), upi_name: name.trim() });
            if (!res.ok) return setMsg({ kind: "error", text: res.error });
            setMsg({ kind: "ok", text: "Saved" });
            setEditing(false);
          });
        }}
      >
        <label className="flex flex-col text-sm font-medium text-ink-2">
          UPI ID
          <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="theatre@okaxis" required
            pattern="[a-zA-Z0-9._\-]{2,256}@[a-zA-Z]{2,64}" className="field mt-1.5 w-64 font-mono" />
        </label>
        <label className="flex flex-col text-sm font-medium text-ink-2">
          Name shown in UPI apps
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} className="field mt-1.5 w-72" />
        </label>
        <button type="submit" disabled={pending} className="btn-primary">{pending ? "Saving…" : "Save"}</button>
        {current && <button type="button" onClick={() => setEditing(false)} className="text-sm text-muted">Cancel</button>}
      </form>
      {msg && <div className="mt-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
    </section>
  );
}
