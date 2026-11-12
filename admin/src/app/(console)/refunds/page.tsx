import type { Metadata } from "next";
import Link from "next/link";
import { RefundRow } from "@/app/(console)/bookings/Payments";
import { RangePicker, Tiles } from "@/components/Figures";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { api, getMe } from "@/lib/api";
import { dateTime, dayLong, rupees } from "@/lib/format";
import type { AdminBooking, Refunds } from "@/lib/types";

export const metadata: Metadata = { title: "Refunds" };

const REASON: Record<string, string> = {
  show_cancelled: "Show cancelled",
  manual_refund: "Refunded by theatre",
  seat_clash: "Seat taken first",
  show_ended: "Show over",
  booking_failed: "Booking failed",
  expired: "Paid late",
};
const STATES: { key: Refunds["state"]; label: string }[] = [
  { key: "all", label: "All" },
  { key: "to_send", label: "To send" },
  { key: "done", label: "Done" },
];

function how(b: AdminBooking) {
  if (b.refund_pending) return { text: "To send by UPI", cls: "text-brand font-bold" };
  if (b.gateway === "upi") return { text: `Sent by UPI${b.refund_sent_at ? `, ${dateTime(b.refund_sent_at)}` : ""}`, cls: "" };
  return { text: "Refunded automatically", cls: "" };
}

export default async function RefundsPage({ searchParams }: PageProps<"/refunds">) {
  const me = await getMe();
  if (me.user.role === "gate") return <Forbidden />;
  const isOwner = me.user.role === "owner" || me.user.role === "super_admin";
  const sp = await searchParams;
  const state = STATES.some((s) => s.key === sp.state) ? (sp.state as Refunds["state"]) : "all";
  const params = new URLSearchParams({ state });
  for (const k of ["start", "end", "reason", "q"] as const) {
    const v = sp[k];
    if (typeof v === "string" && v) params.set(k, v.slice(0, 80));
  }
  const r = await api<Refunds>(`/api/admin/refunds?${params}`);
  const toSend = r.refunds.filter((b) => b.refund_pending);
  const history = state === "to_send" ? [] : r.refunds.filter((b) => !b.refund_pending || state === "all");

  // Keep the other filters when switching one
  const link = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    if (p.get("state") === "all") p.delete("state");
    return `/refunds?${p}`;
  };

  return (
    <>
      <PageHeader title="Refunds" subtitle="Money the theatre owes customers, and every refund with its reason" />

      <Tiles
        tiles={[
          { label: "To send", value: rupees(r.to_send_paise), hint: r.to_send_count ? `${r.to_send_count} customer${r.to_send_count === 1 ? "" : "s"} waiting, by UPI` : "Nothing owed" },
          { label: "Refunds listed", value: String(r.listed_count), hint: state === "to_send" ? "Waiting to be sent" : "In these dates" },
          { label: "Amount listed", value: rupees(r.listed_paise), hint: "Full refunds, booking fee included" },
          {
            label: "Main reason",
            value: r.by_reason.length ? (REASON[[...r.by_reason].sort((a, b) => b.count - a.count)[0].reason] ?? "Other") : "–",
            hint: r.by_reason.map((x) => `${REASON[x.reason] ?? x.reason}: ${x.count}`).join(" · ") || "No refunds",
          },
        ]}
      />

      {r.to_send_count > 0 && state !== "done" && (
        <section className="card mt-6 overflow-hidden border-brand">
          <div className="border-b border-line bg-brand-soft px-5 py-3">
            <h2 className="font-bold text-[#8a1424]">To send <span className="ml-1">{r.to_send_count}</span></h2>
            <p className="text-xs text-[#8a1424]">
              These customers paid by UPI directly, so the theatre sends the money back by hand: pay their mobile number
              (or the UPI ID they paid from) in the theatre&apos;s UPI app, then enter that payment&apos;s reference here. They get a WhatsApp message.
            </p>
          </div>
          {toSend.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">None match the search. <Link href="/refunds?state=to_send" className="font-bold text-brand">Show all to send</Link></p>
          ) : (
            <ul className="divide-y divide-line">
              {toSend.map((b) => <RefundRow key={b.id} b={b} canMark={isOwner} />)}
            </ul>
          )}
        </section>
      )}

      {state !== "to_send" && (
        <section className="card mt-6 overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-bold">History</h2>
            <p className="mt-0.5 text-xs text-muted">By the date of the refund. To refund a booking, find it in <Link href="/bookings" className="font-bold text-brand">Bookings</Link>.</p>
          </div>
          <div className="px-5 pt-4">
            <RangePicker path="/refunds" start={r.start} end={r.end} note={`Refunds made from ${dayLong(r.start)} to ${dayLong(r.end)}.`} />
            <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2 text-sm">
              {STATES.map((s) => (
                <Link key={s.key} href={link({ state: s.key })} className={`rounded-lg border px-2.5 py-1 ${state === s.key ? "border-ink bg-ink text-white" : "border-line"}`}>{s.label}</Link>
              ))}
              <span className="mx-1 text-line">|</span>
              <Link href={link({ reason: null })} className={`rounded-lg border px-2.5 py-1 ${!params.get("reason") ? "border-ink bg-ink text-white" : "border-line"}`}>Any reason</Link>
              {Object.entries(REASON).slice(0, 3).map(([k, v]) => (
                <Link key={k} href={link({ reason: k })} className={`rounded-lg border px-2.5 py-1 ${params.get("reason") === k ? "border-ink bg-ink text-white" : "border-line"}`}>{v}</Link>
              ))}
              <form action="/refunds" className="ml-auto flex gap-2">
                {[...params.entries()].filter(([k]) => k !== "q").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                <input name="q" defaultValue={params.get("q") ?? ""} placeholder="Booking ID, name, mobile or UPI ref" aria-label="Search refunds" className="field h-9 w-56 py-1 text-sm" />
                <button type="submit" className="btn-secondary h-9 px-3 py-1 text-sm">Search</button>
              </form>
            </div>
          </div>
          {history.length === 0 ? (
            <p className="px-5 pb-8 text-center text-sm text-muted">No refunds in these dates.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="report w-full min-w-[900px] text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Refunded</th><th className="text-left">Booking</th><th className="text-left">Customer</th>
                    <th className="text-left">Show</th><th>Amount</th><th className="text-left">Why</th><th className="text-left">How</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((b) => {
                    const h = how(b);
                    return (
                      <tr key={b.id} className="align-top">
                        <td className="whitespace-nowrap">{b.refunded_at ? dateTime(b.refunded_at) : "–"}</td>
                        <td><span className="font-mono font-bold">{b.code}</span><div className="text-xs text-muted">{b.seats.join(", ")}</div></td>
                        <td>{b.customer_name || "—"}<div className="font-mono text-xs text-muted">{b.mobile}</div></td>
                        <td>{b.movie_title}<div className="text-xs text-muted">{dateTime(b.starts_at)}</div></td>
                        <td className="num font-bold">{rupees(b.refund_paise)}</td>
                        <td>
                          {REASON[b.failure_reason ?? ""] ?? b.failure_reason ?? "—"}
                          {b.refund_note && <div className="max-w-56 text-xs text-muted">“{b.refund_note}”</div>}
                        </td>
                        <td className={h.cls}>
                          {h.text}
                          {!b.refund_pending && b.refund_id && <div className="font-mono text-[11px] text-muted">{b.refund_id}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
