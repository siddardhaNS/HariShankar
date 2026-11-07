import type { Metadata } from "next";
import Link from "next/link";
import { BarList, RangePicker, Tiles } from "@/components/Figures";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { api, getMe } from "@/lib/api";
import { dateTime, pct, rupees } from "@/lib/format";
import type { AdminSeatMap, Insights, Movie } from "@/lib/types";

export const metadata: Metadata = { title: "Insights" };

const SLOTS = ["Morning", "Matinee", "First show", "Second show"];
const CHANNEL = { whatsapp: "WhatsApp", push: "App", both: "WhatsApp and app" } as const;
const UUID = /^[0-9a-f-]{36}$/;

function hoursText(h: number) {
  if (h >= 48) return `${Math.round(h / 24)} days before`;
  if (h >= 1) return `${Math.round(h)} hours before`;
  return "in the last hour";
}

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const me = await getMe();
  if (me.user.role !== "owner" && me.user.role !== "super_admin") return <Forbidden />;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const keep = {
    movie_id: UUID.test(str("movie_id")) ? str("movie_id") : "",
    slot: SLOTS.includes(str("slot")) ? str("slot") : "",
    class_id: UUID.test(str("class_id")) ? str("class_id") : "",
  };
  const q = new URLSearchParams();
  if (str("start")) q.set("start", str("start"));
  if (str("end")) q.set("end", str("end"));
  for (const [k, v] of Object.entries(keep)) if (v) q.set(k, v);

  const [r, movies, hall] = await Promise.all([
    api<Insights>(`/api/admin/insights?${q}`),
    api<Movie[]>("/api/admin/movies"),
    api<AdminSeatMap>("/api/admin/seatmap"),
  ]);
  const s = r.summary;
  const profiled = r.gender.filter((g) => g.label !== "Not said").reduce((a, g) => a + g.value, 0);
  const filtered = Object.values(keep).some(Boolean);
  const excel = new URLSearchParams({ start: r.start, end: r.end, ...Object.fromEntries(Object.entries(keep).filter(([, v]) => v)) });
  const p = r.payments;

  return (
    <>
      <PageHeader title="Insights" subtitle="Who books, when they book, and what fills the hall">
        <a href={`/insights/excel?${excel}`} className="btn-secondary px-3 py-1.5 text-sm">Download Excel</a>
      </PageHeader>
      <RangePicker path="/insights" start={r.start} end={r.end} keep={keep} />

      <form action="/insights" className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="start" value={r.start} />
        <input type="hidden" name="end" value={r.end} />
        <label className="text-xs font-medium text-ink-2">
          Movie
          <select name="movie_id" defaultValue={keep.movie_id} className="field mt-1 h-9 w-56 py-1">
            <option value="">All movies</option>
            {movies.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-2">
          Show time
          <select name="slot" defaultValue={keep.slot} className="field mt-1 h-9 w-44 py-1">
            <option value="">All show times</option>
            {SLOTS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-2">
          Class
          <select name="class_id" defaultValue={keep.class_id} className="field mt-1 h-9 w-44 py-1">
            <option value="">All classes</option>
            {hall.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button type="submit" className="btn-secondary h-9 px-3 py-1 text-sm">Apply</button>
        {filtered && <Link href={`/insights?start=${r.start}&end=${r.end}`} className="h-9 px-2 py-2 text-sm text-muted hover:text-ink">Clear filters</Link>}
        {keep.class_id && <p className="w-full text-xs text-muted">With a class picked, seats and money count only that class&apos;s seats (ticket price, without the booking fee).</p>}
      </form>

      <Tiles
        tiles={[
          { label: "Seats filled", value: `${s.occupancy}%`, hint: `${s.seats_sold} seats over ${s.shows} shows` },
          { label: "Customers", value: String(s.customers), hint: `${s.new_customers} booked here for the first time` },
          { label: "Came back", value: `${pct(s.repeat_customers, s.customers)}%`, hint: `${s.repeat_customers} booked 2 or more times` },
          { label: "Booked on the day", value: `${pct(s.same_day_bookings, s.bookings)}%`, hint: `${s.same_day_bookings} of ${s.bookings} bookings` },
        ]}
      />

      <Section title="When people book" />
      <div className="grid gap-4 lg:grid-cols-2">
        <BarList title="How long before the show" bars={r.lead_time} caption="Bookings, by how long before the show" />
        <BarList title="Time of day" bars={r.booking_hour} caption="When the booking was made" />
        <BarList title="Day of the week" bars={r.booking_weekday} caption="The day the booking was made, not the show day" />
        <BarList title="How many seats per booking" bars={r.group_size} caption={`Alone, couples, families and groups. ${s.avg_group} seats per booking on average`} />
      </div>

      <Section title="Show times" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="border-b border-line px-5 py-4 font-bold">Seats filled, weekdays and weekends</h2>
          <div className="overflow-x-auto">
            <table className="report w-full min-w-[460px] text-sm">
              <thead><tr><th className="text-left">Show time</th><th>Mon to Fri</th><th>Sat and Sun</th><th>Sold out</th></tr></thead>
              <tbody>
                {r.slot_week.map((x) => (
                  <tr key={x.slot}>
                    <td className="font-medium">{x.slot}</td>
                    <td className="num">{x.weekday_shows ? `${x.weekday}%` : "–"} <span className="text-xs text-muted">{x.weekday_shows ? `${x.weekday_shows} shows` : ""}</span></td>
                    <td className="num">{x.weekend_shows ? `${x.weekend}%` : "–"} <span className="text-xs text-muted">{x.weekend_shows ? `${x.weekend_shows} shows` : ""}</span></td>
                    <td className="num">{x.sold_out}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <BarList title="Seats filled by day" unit="%" bars={r.by_weekday} caption="Plan extra shows on busy days, offers on quiet ones" />
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-bold">Shows that sold out</h2>
          <p className="mt-0.5 text-xs text-muted">95% of seats or more, and how early the last of those seats went</p>
          {r.sell_outs.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No show sold out in these dates.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {r.sell_outs.map((x, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                  <span><b>{x.movie_title}</b> <span className="text-muted">· {dateTime(x.starts_at)} · {x.label}</span></span>
                  <span className="tabular-nums">{x.occupancy}% · full {hoursText(x.hours_before)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Section title="Movies" />
      <section className="card overflow-hidden">
        {r.movies.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No shows in these dates.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="report w-full min-w-[620px] text-sm">
              <thead>
                <tr><th className="text-left">Movie</th><th>Shows</th><th>Seats sold</th><th>Filled</th><th>Rating</th><th>Collected</th></tr>
              </thead>
              <tbody>
                {r.movies.map((m) => (
                  <tr key={m.title}>
                    <td className="font-medium">{m.title}</td>
                    <td className="num">{m.shows}</td>
                    <td className="num">{m.seats_sold}</td>
                    <td className="num">{m.occupancy}%</td>
                    <td className="num">{m.rating ? <>★ {m.rating} <span className="text-muted">({m.ratings})</span></> : <span className="text-muted">–</span>}</td>
                    <td className="num font-bold">{rupees(m.collected_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {r.movie_weeks.length > 0 && (
        <section className="card mt-4 overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-bold">Week by week since release</h2>
            <p className="mt-0.5 text-xs text-muted">Week 1 starts on the release date (or the first show here). Falling seats filled is the time to cut shows; rising, to add them.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="report w-full min-w-[620px] text-sm">
              <thead><tr><th className="text-left">Movie</th><th>Week</th><th>Shows</th><th>Seats sold</th><th>Filled</th><th>Collected</th></tr></thead>
              <tbody>
                {r.movie_weeks.flatMap((m) =>
                  m.weeks.map((w, i) => (
                    <tr key={`${m.title}-${w.week}`}>
                      <td className="font-medium">{i === 0 ? m.title : ""}</td>
                      <td className="num">{w.week}</td>
                      <td className="num">{w.shows}</td>
                      <td className="num">{w.seats_sold}</td>
                      <td className="num">{w.occupancy}%</td>
                      <td className="num">{rupees(w.collected_paise)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Section title="Classes and seats" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-bold">Classes</h2>
            <p className="mt-0.5 text-xs text-muted">Which class fills, and how early people book it (half the bookings were made at least this long before)</p>
          </div>
          {r.class_demand.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No shows in these dates.</p>
          ) : (
            <table className="report w-full text-sm">
              <thead><tr><th className="text-left">Class</th><th>Seats</th><th>Filled</th><th>Booked before</th></tr></thead>
              <tbody>
                {r.class_demand.map((c) => (
                  <tr key={c.name}>
                    <td className="font-medium">{c.name}</td>
                    <td className="num">{c.seats}</td>
                    <td className="num">{c.occupancy}%</td>
                    <td className="num">{c.median_days_before === null ? "–" : c.median_days_before < 1 ? "Same day" : `${c.median_days_before} days`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <BarList title="Rows that sell first" unit="%" bars={r.row_demand.slice(0, 12)} caption="Seats filled per row, busiest first" />
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-bold">Seats that rarely sell</h2>
          <p className="mt-0.5 text-xs text-muted">Candidates for a lower price or for blocking (house quota, repairs)</p>
          {r.rarely_sold.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No shows in these dates.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {r.rarely_sold.map((x) => (
                <span key={x.seat} className="rounded-lg border border-line px-2.5 py-1 text-sm">
                  <b>{x.seat}</b> <span className="text-muted">sold {x.sold} of {x.shows} shows</span>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>

      <Section title="Customers" />
      <div className="grid gap-4 lg:grid-cols-2">
        <BarList title="How often they come" bars={r.visits} caption={`Customers by bookings in these dates. ${s.new_customers} new, ${s.customers - s.new_customers} returning`} />
        <section className="card p-5">
          <h2 className="font-bold">Regulars</h2>
          <p className="mt-0.5 text-xs text-muted">
            Most bookings in these dates. {r.lapsed_customers} customer{r.lapsed_customers === 1 ? " hasn't" : "s haven't"} come back in 60 days: a good audience for an offer.
          </p>
          {r.regulars.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nobody booked twice in these dates yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {r.regulars.map((x, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span>{x.name} <span className="text-muted">· ••••{x.mobile_end}</span></span>
                  <span className="tabular-nums"><b>{x.bookings}</b> bookings</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <h3 className="mt-6 text-sm font-bold">Audience</h3>
      <p className="mt-1 text-sm text-muted">
        From the optional profile in the app. Each customer is counted once, only in totals, never shown by name.
        {s.customers > 0 && ` ${profiled} of ${s.customers} customers have filled it in.`}
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BarList title="Gender" bars={r.gender} caption="Customers" />
        <BarList title="Age group" bars={r.age} caption="Customers" />
      </div>

      <Section title="Offers and messages" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-bold">Promo codes</h2>
            <p className="mt-0.5 text-xs text-muted">Used on {s.promo_bookings} of {s.bookings} bookings, {rupees(s.promo_discount_paise)} off ticket prices</p>
          </div>
          {r.offers.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No promo codes used in these dates.</p>
          ) : (
            <table className="report w-full text-sm">
              <thead><tr><th className="text-left">Code</th><th>Bookings</th><th>Seats</th><th>Discount</th></tr></thead>
              <tbody>
                {r.offers.map((o) => (
                  <tr key={o.code}>
                    <td><b className="font-mono">{o.code}</b><span className="block text-xs text-muted">{o.title}</span></td>
                    <td className="num">{o.bookings}</td>
                    <td className="num">{o.seats}</td>
                    <td className="num">{rupees(o.discount_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-bold">Offer messages</h2>
            <p className="mt-0.5 text-xs text-muted">
              Booked = booked within 3 days of getting it. Of these customers, {r.offers_opt.on} have offers on and {r.offers_opt.off} have them off.
            </p>
          </div>
          {r.campaigns.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No offer messages sent in these dates.</p>
          ) : (
            <table className="report w-full text-sm">
              <thead><tr><th className="text-left">Message</th><th>Reached</th><th>Booked</th></tr></thead>
              <tbody>
                {r.campaigns.map((c, i) => (
                  <tr key={i}>
                    <td><b>{c.title}</b><span className="block text-xs text-muted">{CHANNEL[c.channel] ?? c.channel} · {dateTime(c.send_after)}</span></td>
                    <td className="num">{c.reached} <span className="text-xs text-muted">of {c.recipients}</span></td>
                    <td className="num">{c.led_to_booking} <span className="text-xs text-muted">{c.reached ? `${pct(c.led_to_booking, c.reached)}%` : ""}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <Section title="Ratings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <BarList title="Stars" bars={r.stars.map((b) => ({ ...b, label: `${b.label} ★` }))} caption="Customers rate the movie on their ticket after the show" />
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-bold">Ratings against sales</h2>
            <p className="mt-0.5 text-xs text-muted">A well-rated movie that isn&apos;t filling seats may need more promotion</p>
          </div>
          {r.movies.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No shows in these dates.</p>
          ) : (
            <table className="report w-full text-sm">
              <thead><tr><th className="text-left">Movie</th><th>Rating</th><th>Filled</th><th>Seats sold</th></tr></thead>
              <tbody>
                {[...r.movies].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).map((m) => (
                  <tr key={m.title}>
                    <td className="font-medium">{m.title}</td>
                    <td className="num">{m.rating ? `★ ${m.rating}` : "–"} <span className="text-xs text-muted">{m.ratings ? `(${m.ratings})` : ""}</span></td>
                    <td className="num">{m.occupancy}%</td>
                    <td className="num">{m.seats_sold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-bold">What people said</h2>
          <p className="mt-0.5 text-xs text-muted">Latest comments with a rating. Names are never shown.</p>
          {r.comments.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No comments in these dates yet.</p>
          ) : (
            <ul className="mt-3 grid gap-x-8 divide-y divide-line lg:grid-cols-2 lg:divide-y-0">
              {r.comments.map((x, i) => (
                <li key={i} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted">
                    <span>{x.movie_title}</span>
                    <span className="tracking-wider text-ink">{"★".repeat(x.stars)}<span className="text-line">{"★".repeat(5 - x.stars)}</span></span>
                  </div>
                  <p className="mt-1">{x.comment}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Section title="Payments and refunds" />
      <Tiles
        tiles={[
          { label: "Refunded", value: rupees(p.refunded_paise), hint: `${p.refunds.reduce((a, b) => a + b.value, 0)} bookings` },
          { label: "Seat clashes", value: String(p.seat_clashes), hint: "Two people paid for the same seat; the second was refunded" },
          { label: "Payments failed", value: String(p.failed), hint: "The bank or UPI app declined" },
          { label: "Left without paying", value: String(p.abandoned), hint: "Started a booking, didn't pay in time" },
        ]}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BarList title="Paid with" bars={p.methods} caption="Confirmed bookings by payment method" />
        <BarList title="Why money went back" bars={p.refunds} caption="Refunded bookings, by reason" />
      </div>
      <p className="mt-6 text-xs text-muted">The owner also gets a summary of the week on WhatsApp every Monday at 9 AM.</p>
    </>
  );
}

function Section({ title }: { title: string }) {
  return <h2 className="mb-3 mt-9 text-lg font-bold">{title}</h2>;
}
