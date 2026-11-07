import type { Metadata } from "next";
import Link from "next/link";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { api, getMe } from "@/lib/api";
import { dateTime, rupees } from "@/lib/format";
import type { AdminBooking } from "@/lib/types";
import { RefundButton } from "./RefundButton";

export const metadata: Metadata = { title: "Bookings" };

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-ok-soft text-[#145c33]" },
  refunded: { label: "Refunded", cls: "bg-brand-soft text-[#8a1424]" },
  failed: { label: "Payment failed", cls: "bg-[#e9eaf1] text-muted" },
  cancelled: { label: "Cancelled", cls: "bg-[#e9eaf1] text-muted" },
};

const REASON: Record<string, string> = {
  seat_clash: "Seat clash",
  show_cancelled: "Show cancelled",
  manual_refund: "Refunded by theatre",
  payment_failed: "Payment failed",
};

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const me = await getMe();
  if (me.user.role === "gate") return <Forbidden />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const showId = typeof sp.show === "string" && /^[0-9a-f-]{36}$/.test(sp.show) ? sp.show : null;

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (showId) params.set("show_id", showId);
  const results = q || showId ? await api<AdminBooking[]>(`/api/admin/bookings?${params}`) : null;
  const isOwner = me.user.role === "owner" || me.user.role === "super_admin";
  const showLabel = results?.[0] && showId ? `${dateTime(results[0].starts_at)} · ${results[0].movie_title}` : null;

  return (
    <>
      <PageHeader title="Bookings" subtitle="Find a booking by booking ID, name or mobile number" />

      <form className="card mb-6 flex flex-wrap items-center gap-3 p-4" action="/bookings">
        <input
          name="q"
          defaultValue={q}
          placeholder="Booking ID, name or mobile"
          aria-label="Search bookings"
          className="field max-w-md flex-1"
          autoFocus={!showId}
        />
        <button type="submit" className="btn-primary">Search</button>
        {(q || showId) && <Link href="/bookings" className="text-sm text-muted hover:text-ink">Clear</Link>}
        {showId && <span className="w-full text-sm text-muted">Showing bookings for {showLabel ?? "this show"}</span>}
      </form>

      {results === null ? (
        <p className="text-sm text-muted">Search above, or open a show&apos;s bookings from Shows.</p>
      ) : results.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">No bookings found.</div>
      ) : (
        <section className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-3 font-bold">Booking</th>
                <th className="px-3 py-3 font-bold">Customer</th>
                <th className="px-3 py-3 font-bold">Show</th>
                <th className="px-3 py-3 font-bold">Seats</th>
                <th className="px-3 py-3 text-right font-bold">Amount</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {results.map((b) => (
                <tr key={b.id} className="align-top">
                  <td className="px-5 py-3">
                    <div className="font-mono font-bold">{b.code}</div>
                    <div className="text-xs text-muted">{dateTime(b.created_at)}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{b.customer_name || "—"}</div>
                    <div className="font-mono text-xs text-muted">{b.mobile}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{b.movie_title}</div>
                    <div className="text-xs text-muted">{dateTime(b.starts_at)} · {b.show_label}</div>
                  </td>
                  <td className="px-3 py-3">
                    {b.seats.join(", ")}
                    {b.seats_admitted > 0 && <div className="text-xs text-muted">{b.seats_admitted} entered</div>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {rupees(b.total_paise)}
                    {b.refund_paise > 0 && <div className="text-xs text-brand">−{rupees(b.refund_paise)} refunded</div>}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS[b.status]?.cls ?? ""}`}>
                      {STATUS[b.status]?.label ?? b.status}
                    </span>
                    {b.failure_reason && <div className="mt-1 text-xs text-muted">{REASON[b.failure_reason] ?? b.failure_reason}</div>}
                    {b.refund_id && <div className="font-mono text-[11px] text-muted">{b.refund_id}</div>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {isOwner && b.status === "confirmed" && b.seats_admitted === 0 && (
                      <RefundButton bookingId={b.id} amount={rupees(b.total_paise)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
