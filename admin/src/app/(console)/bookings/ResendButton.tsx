"use client";

import { useState, useTransition } from "react";
import { resendTicket } from "@/app/actions/ops";

/** Queue the booking's WhatsApp message again (customer lost it or changed phones). */
export function ResendButton({ bookingId }: { bookingId: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending || note?.ok}
        onClick={() =>
          start(async () => {
            const res = await resendTicket(bookingId);
            setNote(res.ok ? { ok: true, text: "Sent to WhatsApp" } : { ok: false, text: res.error });
          })
        }
        className="btn px-3 py-1.5 text-sm text-ink-2 hover:bg-canvas disabled:opacity-60"
      >
        {pending ? "Sending…" : note?.ok ? "Sent ✓" : "Resend ticket"}
      </button>
      {note && !note.ok && <span className="max-w-48 text-right text-xs text-brand">{note.text}</span>}
    </div>
  );
}
