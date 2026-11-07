import type { Metadata } from "next";
import Link from "next/link";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { SHOWS_TABS, SubNav } from "@/components/SubNav";
import { api, getMe } from "@/lib/api";
import { addDays, dayLong, istDate, pct, rupees, time } from "@/lib/format";
import type { AdminSeatMap, Movie, Show } from "@/lib/types";
import { AddShows } from "./AddShows";
import { ShowActions } from "./ShowActions";

export const metadata: Metadata = { title: "Show timings" };

export default async function ShowsPage({ searchParams }: PageProps<"/shows">) {
  const me = await getMe();
  if (me.user.role === "gate") return <Forbidden />;
  const sp = await searchParams;
  const today = istDate();
  const start = typeof sp.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : today;

  const [shows, movies, hall] = await Promise.all([
    api<Show[]>(`/api/admin/shows?start=${start}&days=7`),
    api<Movie[]>("/api/admin/movies"),
    api<AdminSeatMap>("/api/admin/seatmap"),
  ]);

  const byDay = new Map<string, Show[]>();
  for (let i = 0; i < 7; i++) byDay.set(addDays(start, i), []);
  for (const s of shows) byDay.get(istDate(new Date(s.starts_at)))?.push(s);
  const bookable = movies.filter((m) => m.status !== "archived");

  return (
    <>
      <PageHeader title="Shows" subtitle="A week of shows with prices for each class" />
      <SubNav items={SHOWS_TABS} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="font-bold">{dayLong(start)} to {dayLong(addDays(start, 6))}</h2>
            <div className="flex gap-2 text-sm">
              <Link href={`/shows?start=${addDays(start, -7)}`} className="btn-secondary px-3 py-1.5 text-sm">← Earlier</Link>
              {start !== today && <Link href="/shows" className="btn-secondary px-3 py-1.5 text-sm">This week</Link>}
              <Link href={`/shows?start=${addDays(start, 7)}`} className="btn-secondary px-3 py-1.5 text-sm">Later →</Link>
            </div>
          </div>
          <div className="divide-y divide-line">
            {[...byDay.entries()].map(([day, list]) => (
              <div key={day} className="px-5 py-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                  {day === today ? "Today · " : ""}{dayLong(day)}
                </h3>
                {list.length === 0 ? (
                  <p className="text-sm text-[#9a9fbb]">No shows</p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((s) => {
                      const cancelled = s.status === "cancelled";
                      const fill = pct(s.seats_sold, s.seats_total);
                      return (
                        <li key={s.id} className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line px-4 py-3 ${cancelled ? "bg-canvas/70" : ""}`}>
                          <div className="w-24">
                            <div className={`font-bold ${cancelled ? "text-muted line-through" : ""}`}>{time(s.starts_at)}</div>
                            <div className="text-xs text-muted">{s.label}</div>
                          </div>
                          <div className="min-w-[150px] flex-1">
                            <div className="font-medium">{s.movie_title}</div>
                            <div className="text-xs text-muted">
                              {cancelled
                                ? `Cancelled: ${s.cancel_reason}`
                                : s.prices.map((p) => `${p.class_name} ${rupees(p.price_paise)}`).join(" · ")}
                            </div>
                          </div>
                          {!cancelled && (
                            <div className="w-40">
                              <div className="flex justify-between text-xs">
                                <span>{s.seats_sold}/{s.seats_total} sold</span>
                                <span className="text-muted">{fill}%</span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                                <div className="h-full rounded-full bg-brand" style={{ width: `${fill}%` }} />
                              </div>
                              <div className="mt-1 text-xs text-muted">
                                {rupees(s.collection_paise)}{s.seats_blocked ? ` · ${s.seats_blocked} blocked` : ""}
                              </div>
                            </div>
                          )}
                          <ShowActions show={s} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        <AddShows movies={bookable} classes={hall.classes} today={today} />
      </div>
    </>
  );
}
