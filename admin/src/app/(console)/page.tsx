import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { api, getMe } from "@/lib/api";
import { dayLong, pct, rupees, time } from "@/lib/format";
import type { Today } from "@/lib/types";

export const metadata: Metadata = { title: "Today" };

const SETUP: { key: keyof Today["setup"]; step: string; href: string }[] = [
  { key: "upi", step: "Add the theatre's UPI ID so customers can pay", href: "/bookings" },
  { key: "layout", step: "Set up the hall: rows, seat numbers, aisles and class per row", href: "/shows/layout" },
  { key: "movies", step: "Add the movies now showing and coming soon", href: "/shows/movies" },
  { key: "shows", step: "Create a week of shows with prices for each class", href: "/shows" },
  { key: "staff", step: "Add your manager and gate staff logins", href: "/staff" },
];

export default async function TodayPage() {
  const me = await getMe();
  const t = await api<Today>("/api/admin/today");
  const setupDone = Object.values(t.setup).every(Boolean);

  const tiles = [
    { label: "Collection", value: rupees(t.collection_paise), hint: "Today's shows, after refunds" },
    { label: "Tickets sold", value: String(t.tickets_sold), hint: `Across ${t.shows.filter((s) => s.status === "scheduled").length} shows today` },
    { label: "Seats filled", value: `${pct(t.tickets_sold, t.seats_total)}%`, hint: `${t.tickets_sold} of ${t.seats_total} seats` },
    {
      label: "Needs checking",
      value: String(t.payments_to_check + t.refunds_to_send),
      hint:
        t.payments_to_check || t.refunds_to_send
          ? [t.payments_to_check && `${t.payments_to_check} UPI payment(s) to check`, t.refunds_to_send && `${t.refunds_to_send} refund(s) to send`].filter(Boolean).join(" · ")
          : "Nothing waiting",
      alert: t.payments_to_check + t.refunds_to_send > 0,
      href: t.payments_to_check ? "/bookings" : "/refunds",
    },
  ];

  return (
    <>
      <PageHeader title="Today" subtitle={`${me.theatre?.name ?? ""} · ${dayLong(t.date)}`} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={`card relative p-4 ${tile.alert ? "border-brand" : ""}`}>
            {"href" in tile && tile.alert && <Link href={tile.href} className="absolute inset-0" aria-label={tile.hint} />}
            <div className="text-xs font-bold uppercase tracking-wider text-ink-2">{tile.label}</div>
            <div className={`mt-2 text-[28px] font-bold leading-none ${tile.alert ? "text-brand" : ""}`}>{tile.value}</div>
            <div className="mt-2 text-xs text-muted">{tile.hint}</div>
          </div>
        ))}
      </div>
      {t.refunds_paise > 0 && <p className="mt-3 text-sm text-muted">Refunded for today&apos;s shows: {rupees(t.refunds_paise)}</p>}

      <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-bold">Today&apos;s shows</h2>
          <Link href="/shows" className="text-sm font-bold text-brand">All shows →</Link>
        </div>
        {t.shows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No shows today.</p>
        ) : (
          <ul className="divide-y divide-line">
            {t.shows.map((s) => {
              const fill = pct(s.seats_sold, s.seats_total);
              const cancelled = s.status === "cancelled";
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
                  <div className="w-24">
                    <div className={`font-bold ${cancelled ? "text-muted line-through" : ""}`}>{time(s.starts_at)}</div>
                    <div className="text-xs text-muted">{s.label}</div>
                  </div>
                  <div className="min-w-[140px] flex-1 font-medium">{s.movie_title}</div>
                  {cancelled ? (
                    <span className="text-sm text-muted">Cancelled</span>
                  ) : (
                    <>
                      <div className="w-48">
                        <div className="flex justify-between text-xs"><span>{s.seats_sold}/{s.seats_total}</span><span className="text-muted">{fill}%</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${fill}%` }} />
                        </div>
                      </div>
                      <div className="w-24 text-right text-sm">{rupees(s.collection_paise)}</div>
                      <Link href={`/block-rows?show=${s.id}`} className="btn-secondary px-3 py-1.5 text-sm">Seats</Link>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!setupDone && (
        <section className="card mt-6 p-6">
          <h2 className="text-lg font-bold">Get the theatre ready for online booking</h2>
          <ol className="mt-5 space-y-3">
            {SETUP.map((s, i) => {
              const done = t.setup[s.key];
              return (
                <li key={s.key} className="flex items-center gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-ok text-white" : "bg-canvas text-ink-2"}`}>
                    {done ? "✓" : i + 1}
                  </span>
                  <Link href={s.href} className={`text-[15px] hover:text-brand ${done ? "text-muted line-through" : ""}`}>{s.step}</Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </>
  );
}
