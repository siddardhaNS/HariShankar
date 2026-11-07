"use client";

import { useState, useTransition } from "react";
import { refundBooking } from "@/app/actions/ops";

export function RefundButton({ bookingId, amount }: { bookingId: string; amount: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn px-3 py-1.5 text-sm text-brand hover:bg-brand-soft">
        Refund
      </button>
    );
  }
  return (
    <div className="ml-auto w-64 rounded-xl bg-brand-soft p-3 text-left">
      <p className="text-xs font-bold text-[#8a1424]">Refund {amount} in full? The seats go back on sale. This can&apos;t be undone.</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" maxLength={200}
        aria-label="Reason for refund" className="field mt-2 py-1.5 text-sm" />
      {err && <p className="mt-1 text-xs text-brand">{err}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-xs text-muted">Back</button>
        <button
          type="button"
          disabled={pending || reason.trim().length < 3}
          onClick={() =>
            start(async () => {
              const res = await refundBooking(bookingId, reason.trim());
              if (!res.ok) setErr(res.error);
              else setOpen(false);
            })
          }
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {pending ? "Refunding…" : "Refund"}
        </button>
      </div>
    </div>
  );
}
