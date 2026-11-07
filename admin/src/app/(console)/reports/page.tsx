import type { Metadata } from "next";
import { RangePicker, Tiles } from "@/components/Figures";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { api, getMe } from "@/lib/api";
import { dayLong, pct, rupees, time } from "@/lib/format";
import type { Report, ReportTotals } from "@/lib/types";
import { DownloadCsv } from "./DownloadCsv";

export const metadata: Metadata = { title: "Reports" };

const money = (p: number) => (p / 100).toFixed(2); // CSV: plain numbers for spreadsheets

function DayCells({ d }: { d: ReportTotals }) {
  return (
    <>
      <td className="num">{d.shows}{d.cancelled_shows ? <span className="text-muted"> ({d.cancelled_shows} cancelled)</span> : null}</td>
      <td className="num">{d.seats_sold} <span className="text-muted">/ {d.seats_total}</span></td>
      <td className="num">{pct(d.seats_sold, d.seats_total)}%</td>
      <td className="num">{rupees(d.tickets_paise)}</td>
      <td className="num">{d.discount_paise ? `- ${rupees(d.discount_paise)}` : "–"}</td>
      <td className="num">{rupees(d.fee_paise)}</td>
      <td className="num">{rupees(d.gst_paise)}</td>
      <td className="num font-bold">{rupees(d.collected_paise)}</td>
      <td className="num">{d.refunded_paise ? rupees(d.refunded_paise) : "–"}</td>
    </>
  );
}

const HEAD = ["Shows", "Seats sold", "Filled", "Ticket sales", "Discounts", "Booking fee", "GST on fee", "Collected", "Refunded"];

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const me = await getMe();
  if (me.user.role !== "owner" && me.user.role !== "super_admin") return <Forbidden />;
  const sp = await searchParams;
  const q = new URLSearchParams();
  if (typeof sp.start === "string" && sp.start) q.set("start", sp.start);
  if (typeof sp.end === "string" && sp.end) q.set("end", sp.end);
  const r = await api<Report>(`/api/admin/reports?${q}`);
  const t = r.totals;

  return (
    <>
      <PageHeader title="Reports" subtitle="Collection, seats, refunds and GST, for your accounts" />
      <RangePicker path="/reports" start={r.start} end={r.end} />

      <Tiles
        tiles={[
          { label: "Collected", value: rupees(t.collected_paise), hint: `${t.bookings} bookings that stand` },
          { label: "Seats filled", value: `${pct(t.seats_sold, t.seats_total)}%`, hint: `${t.seats_sold} of ${t.seats_total} seats, ${t.shows - t.cancelled_shows} shows` },
          { label: "Refunded", value: rupees(t.refunded_paise), hint: t.refunds_to_send ? `${t.refunds_to_send} still to send by UPI` : "All refunds sent" },
          { label: "GST on booking fee", value: rupees(t.gst_paise), hint: `On ${rupees(t.fee_paise)} of booking fees` },
        ]}
      />

      <section className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="font-bold">By day</h2>
          <DownloadCsv
            label="Download days"
            filename={`hari-shankar-days-${r.start}-to-${r.end}.csv`}
            header={["Date", "Shows", "Cancelled shows", "Seats", "Seats sold", "Admitted", "Bookings", "Ticket sales", "Discounts", "Booking fee", "GST on fee", "Collected", "Refunded"]}
            rows={r.days.map((d) => [d.date ?? "", d.shows, d.cancelled_shows, d.seats_total, d.seats_sold, d.admitted, d.bookings,
              money(d.tickets_paise), money(d.discount_paise), money(d.fee_paise), money(d.gst_paise), money(d.collected_paise), money(d.refunded_paise)])}
          />
        </div>
        {r.days.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No shows in these dates.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="report w-full min-w-[860px] text-sm">
              <thead>
                <tr><th className="text-left">Date</th>{HEAD.map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {r.days.map((d) => (
                  <tr key={d.date}><td className="font-medium">{dayLong(d.date!)}</td><DayCells d={d} /></tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td className="font-bold">Total</td><DayCells d={t} /></tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Collected = ticket sales − discounts + booking fee + GST, for bookings that weren&apos;t refunded. Refunded money is shown separately and isn&apos;t in Collected.
        </p>
      </section>

      {r.shows.length > 0 && (
        <section className="card mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="font-bold">By show</h2>
            <DownloadCsv
              label="Download shows"
              filename={`hari-shankar-shows-${r.start}-to-${r.end}.csv`}
              header={["Date", "Time", "Show", "Movie", "Status", "Seats", "Seats sold", "Admitted", "Bookings", "Ticket sales", "Discounts", "Booking fee", "GST on fee", "Collected", "Refunded"]}
              rows={r.shows.map((s) => [s.date, time(s.starts_at), s.label, s.movie_title, s.status, s.seats_total, s.seats_sold, s.admitted, s.bookings,
                money(s.tickets_paise), money(s.discount_paise), money(s.fee_paise), money(s.gst_paise), money(s.collected_paise), money(s.refunded_paise)])}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="report w-full min-w-[860px] text-sm">
              <thead>
                <tr>
                  <th className="text-left">Show</th><th className="text-left">Movie</th><th>Seats sold</th><th>Filled</th><th>At the gate</th>
                  <th>Collected</th><th>Refunded</th>
                </tr>
              </thead>
              <tbody>
                {r.shows.map((s) => (
                  <tr key={s.id} className={s.status === "cancelled" ? "text-muted" : ""}>
                    <td className="whitespace-nowrap">{dayLong(s.date)}, {time(s.starts_at)}</td>
                    <td>{s.movie_title}{s.status === "cancelled" && " (cancelled)"}</td>
                    <td className="num">{s.seats_sold} <span className="text-muted">/ {s.seats_total}</span></td>
                    <td className="num">{pct(s.seats_sold, s.seats_total)}%</td>
                    <td className="num">{s.admitted}</td>
                    <td className="num font-bold">{rupees(s.collected_paise)}</td>
                    <td className="num">{s.refunded_paise ? rupees(s.refunded_paise) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
