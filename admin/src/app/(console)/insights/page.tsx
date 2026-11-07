import type { Metadata } from "next";
import { BarList, RangePicker, Tiles } from "@/components/Figures";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { api, getMe } from "@/lib/api";
import { pct, rupees } from "@/lib/format";
import type { Insights } from "@/lib/types";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const me = await getMe();
  if (me.user.role !== "owner" && me.user.role !== "super_admin") return <Forbidden />;
  const sp = await searchParams;
  const q = new URLSearchParams();
  if (typeof sp.start === "string" && sp.start) q.set("start", sp.start);
  if (typeof sp.end === "string" && sp.end) q.set("end", sp.end);
  const r = await api<Insights>(`/api/admin/insights?${q}`);
  const s = r.summary;
  const profiled = r.gender.filter((g) => g.label !== "Not said").reduce((a, g) => a + g.value, 0);

  return (
    <>
      <PageHeader title="Insights" subtitle="Who books, when they book, and what fills the hall" />
      <RangePicker path="/insights" start={r.start} end={r.end} />

      <Tiles
        tiles={[
          { label: "Seats filled", value: `${s.occupancy}%`, hint: `${s.seats_sold} seats over ${s.shows} shows` },
          { label: "Customers", value: String(s.customers), hint: `${s.new_customers} booked here for the first time` },
          { label: "Came back", value: `${pct(s.repeat_customers, s.customers)}%`, hint: `${s.repeat_customers} booked 2 or more times` },
          { label: "Group size", value: String(s.avg_group), hint: `Seats per booking, ${s.bookings} bookings` },
        ]}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <BarList title="Seats filled by show time" unit="%" bars={r.by_slot} caption="Which slots fill up and which have room for an offer" />
        <BarList title="Seats filled by day" unit="%" bars={r.by_weekday} caption="Plan extra shows on busy days, offers on quiet ones" />
        <BarList title="When people book" bars={r.lead_time} caption="Bookings, by how long before the show" />
        <BarList title="How many seats per booking" bars={r.group_size} caption="Bookings by group size" />
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-bold">Movies</h2>
        </div>
        {r.movies.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No shows in these dates.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="report w-full min-w-[620px] text-sm">
              <thead>
                <tr><th className="text-left">Movie</th><th>Shows</th><th>Seats sold</th><th>Filled</th><th>Collected</th></tr>
              </thead>
              <tbody>
                {r.movies.map((m) => (
                  <tr key={m.title}>
                    <td className="font-medium">{m.title}</td>
                    <td className="num">{m.shows}</td>
                    <td className="num">{m.seats_sold}</td>
                    <td className="num">{m.occupancy}%</td>
                    <td className="num font-bold">{rupees(m.collected_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <h2 className="mt-8 font-bold">Audience</h2>
      <p className="mt-1 text-sm text-muted">
        From the optional profile in the app. Each customer is counted once, only in totals, never shown by name.
        {s.customers > 0 && ` ${profiled} of ${s.customers} customers have filled it in.`}
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BarList title="Gender" bars={r.gender} caption="Customers" />
        <BarList title="Age group" bars={r.age} caption="Customers" />
      </div>

      <p className="mt-6 text-sm text-muted">
        Promo codes were used on {s.promo_bookings} of {s.bookings} bookings, taking {rupees(s.promo_discount_paise)} off ticket prices.
      </p>
    </>
  );
}
