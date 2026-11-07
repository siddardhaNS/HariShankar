"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cancelShow, updatePrices } from "@/app/actions/ops";
import { isPast, rupees } from "@/lib/format";
import type { Show } from "@/lib/types";

export function ShowActions({ show }: { show: Show }) {
  const [mode, setMode] = useState<"idle" | "prices" | "cancel">("idle");
  const [reason, setReason] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(show.prices.map((p) => [p.seat_class_id, String(p.price_paise / 100)])),
  );
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const past = isPast(show.starts_at);

  if (show.status === "cancelled") {
    return (
      <div className="ml-auto flex gap-2">
        <Link href={`/shows/seats?show=${show.id}`} className="btn-secondary px-3 py-1.5 text-sm">Seats</Link>
        <Link href={`/bookings?show=${show.id}`} className="btn-secondary px-3 py-1.5 text-sm">Bookings</Link>
      </div>
    );
  }

  const doCancel = () =>
    start(async () => {
      const res = await cancelShow(show.id, reason.trim());
      setMsg(res.ok
        ? { error: false, text: `Cancelled. ${res.data.bookings_refunded} booking(s) refunded, ${rupees(res.data.amount_refunded_paise)} in total.` }
        : { error: true, text: res.error });
      if (res.ok) setMode("idle");
    });

  const doPrices = () => {
    const paise: Record<string, number> = {};
    for (const [k, v] of Object.entries(prices)) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return setMsg({ error: true, text: "Prices must be numbers" });
      paise[k] = Math.round(n * 100);
    }
    start(async () => {
      const res = await updatePrices(show.id, paise);
      setMsg(res.ok ? { error: false, text: "Prices saved. Tickets already sold keep their price." } : { error: true, text: res.error });
      if (res.ok) setMode("idle");
    });
  };

  return (
    <div className="ml-auto flex w-full flex-col items-end gap-2 sm:w-auto">
      {mode === "idle" && (
        <div className="flex flex-wrap justify-end gap-2">
          <Link href={`/shows/seats?show=${show.id}`} className="btn-secondary px-3 py-1.5 text-sm">Seats</Link>
          <Link href={`/bookings?show=${show.id}`} className="btn-secondary px-3 py-1.5 text-sm">Bookings</Link>
          {!past && (
            <>
              <button type="button" onClick={() => { setMsg(null); setMode("prices"); }} className="btn-secondary px-3 py-1.5 text-sm">Prices</button>
              <button type="button" onClick={() => { setMsg(null); setMode("cancel"); }} className="btn px-3 py-1.5 text-sm text-brand hover:bg-brand-soft">Cancel show</button>
            </>
          )}
        </div>
      )}

      {mode === "prices" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {show.prices.map((p) => (
            <label key={p.seat_class_id} className="flex items-center gap-1 text-xs text-muted">
              {p.class_name} ₹
              <input type="number" min={0} value={prices[p.seat_class_id]} aria-label={`${p.class_name} price`}
                onChange={(e) => setPrices((x) => ({ ...x, [p.seat_class_id]: e.target.value }))}
                className="w-20 rounded-lg border border-[#c9ccdc] px-2 py-1 text-sm text-ink" />
            </label>
          ))}
          <button type="button" onClick={doPrices} disabled={pending} className="btn-primary px-3 py-1.5 text-sm">Save</button>
          <button type="button" onClick={() => setMode("idle")} className="px-2 text-sm text-muted">Back</button>
        </div>
      )}

      {mode === "cancel" && (
        <div className="w-full max-w-md rounded-xl bg-brand-soft p-3 text-sm">
          <p className="font-bold text-[#8a1424]">Cancel this show?</p>
          <p className="mt-1 text-xs text-[#8a1424]">
            All {show.seats_sold} sold seat(s) are refunded in full ({rupees(show.collection_paise)}). This can&apos;t be undone.
          </p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. power cut" maxLength={200}
            aria-label="Reason for cancelling" className="field mt-2 py-1.5" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setMode("idle")} className="px-2 text-sm text-muted">Keep show</button>
            <button type="button" onClick={doCancel} disabled={pending || reason.trim().length < 3} className="btn-primary px-3 py-1.5 text-sm">
              {pending ? "Cancelling…" : "Cancel and refund"}
            </button>
          </div>
        </div>
      )}

      {msg && <p className={`text-xs ${msg.error ? "text-brand" : "text-ok"}`} role="status">{msg.text}</p>}
    </div>
  );
}
